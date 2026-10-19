import {
    ChangeDetectionStrategy,
    Component,
    computed,
    effect,
    HostListener,
    inject,
    OnInit,
    signal,
    untracked,
    ViewEncapsulation,
} from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { isTypingInInput } from '@iptvnator/portal/shared/util';
import { WebPlayerViewComponent } from '@iptvnator/ui/playback';
import { SettingsStore } from '@iptvnator/services';
import { SlykEpgService } from './slyk-epg.service';
import { SlykKey, toSlykKey } from './slyk-keys';
import { SlykNavService } from './slyk-nav.service';
import { SlykCategoriesService } from './slyk-categories.service';
import { SlykRecentService } from './slyk-recent.service';
import { SlykNativeService } from './slyk-native.service';
import { SlykPlayerService } from './slyk-player.service';
import { SlykTvService } from './slyk-tv.service';

const STAGE_WIDTH = 1920;
const STAGE_HEIGHT = 1080;
const WHEEL_STEP_MS = 120;

/**
 * The Slyk Q receiver. Everything is laid out on a fixed 1920×1080 stage
 * (the skin's `<resolution xres="1920" yres="1080">`) that is scaled to the
 * window, so every position and size can be taken from the skin XML as is.
 * The live picture stays mounted across screens and is only moved between
 * the full-screen, menu PiG and guide PiG frames, as on the receiver.
 */
@Component({
    selector: 'app-slyk-shell',
    imports: [RouterOutlet, WebPlayerViewComponent],
    providers: [
        SlykTvService,
        SlykEpgService,
        SlykNavService,
        SlykPlayerService,
        SlykNativeService,
        SlykCategoriesService,
        SlykRecentService,
    ],
    templateUrl: './slyk-shell.component.html',
    styleUrls: ['./slyk-shell.component.scss'],
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SlykShellComponent implements OnInit {
    private readonly router = inject(Router);
    private readonly settingsStore = inject(SettingsStore);
    readonly tv = inject(SlykTvService);
    readonly epg = inject(SlykEpgService);
    readonly nav = inject(SlykNavService);

    readonly scale = signal(1);
    readonly offsetX = signal(0);
    readonly offsetY = signal(0);
    readonly stageTransform = computed(
        () =>
            `translate(${this.offsetX()}px, ${this.offsetY()}px) scale(${this.scale()})`
    );
    readonly volume = signal(readStoredVolume());
    private lastWheel = 0;
    private lastPointerX = -1;
    private lastPointerY = -1;
    readonly players = inject(SlykPlayerService);
    /** Fire TV app: the device player draws the picture under the page. */
    readonly native = inject(SlykNativeService);
    readonly player = computed(
        () =>
            this.players.playerFor(this.tv.activeChannel()) ??
            this.settingsStore.player() ??
            null
    );

    constructor() {
        // Every channel tuned joins the home page's Recently Watched rail.
        const recent = inject(SlykRecentService);
        effect(() => {
            const channel = this.tv.activeChannel();
            untracked(() => recent.add(channel));
        });
        // Remember the last menu screen for Back from live TV.
        this.router.events
            .pipe(
                filter((e): e is NavigationEnd => e instanceof NavigationEnd),
                takeUntilDestroyed()
            )
            .subscribe(({ urlAfterRedirects: url }) => {
                if (url.startsWith('/tv') && !url.startsWith('/tv/watch')) {
                    this.nav.lastMenuUrl.set(url.split('?')[0]);
                }
            });
        this.native.bind({
            scale: this.scale,
            offsetX: this.offsetX,
            offsetY: this.offsetY,
        });
        // A newly chosen channel gets its programmes fetched right away so
        // the infobar has now/next by the time it slides in.
        effect(() => {
            const channel = this.tv.activeChannel();
            if (channel) {
                void this.epg.load([channel]);
            }
        });
        // Each channel change remounts the engine; re-read the volume bus.
        effect(() => {
            this.tv.activeChannel();
            this.volume.set(readStoredVolume());
        });
    }

    ngOnInit(): void {
        this.nav.setGlobalKeys((key) => this.handleGlobal(key));
        this.fit();
        void this.tv.ensureLoaded();
    }

    @HostListener('window:resize')
    fit(): void {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const scale = Math.min(width / STAGE_WIDTH, height / STAGE_HEIGHT);
        this.scale.set(scale);
        this.offsetX.set((width - STAGE_WIDTH * scale) / 2);
        this.offsetY.set((height - STAGE_HEIGHT * scale) / 2);
    }

    @HostListener('document:keydown', ['$event'])
    onKeydown(event: KeyboardEvent): void {
        if (event.defaultPrevented || isTypingInInput(event) || dialogOpen()) {
            return;
        }
        const press = toSlykKey(event);
        if (!press) {
            return;
        }
        if (this.players.restartNotice() && (press.key === 'ok' || press.key === 'back')) {
            this.players.dismissRestartNotice();
            event.preventDefault();
            return;
        }
        if (this.nav.dispatch(press)) {
            event.preventDefault();
            event.stopPropagation();
        }
    }

    /**
     * A clicked row keeps focus, so its own Enter handler would fire next to
     * the remote's OK; the remote cursor alone owns the keyboard.
     */
    @HostListener('document:click')
    onClick(): void {
        const focused = document.activeElement;
        if (
            focused instanceof HTMLElement &&
            focused.closest('.slyk-stage') &&
            !focused.closest('input, textarea, select')
        ) {
            focused.blur();
        }
    }

    /**
     * Chromium also fires mousemove when the layout changes under a still
     * cursor (screen changes, the PiG resizing); only real movement counts.
     */
    @HostListener('document:mousemove', ['$event'])
    onMouseMove(event: MouseEvent): void {
        if (event.screenX === this.lastPointerX && event.screenY === this.lastPointerY) {
            return;
        }
        this.lastPointerX = event.screenX;
        this.lastPointerY = event.screenY;
        this.nav.pointerMoved();
    }

    /** Wheel = up/down (shift: left/right), throttled to one step per notch. */
    onWheel(event: WheelEvent): void {
        if (dialogOpen()) {
            return;
        }
        event.preventDefault();
        const now = Date.now();
        if (now - this.lastWheel < WHEEL_STEP_MS) {
            return;
        }
        this.lastWheel = now;
        const forward = (event.deltaY || event.deltaX) > 0;
        const horizontal = event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY);
        this.nav.press(
            horizontal ? (forward ? 'right' : 'left') : forward ? 'down' : 'up'
        );
    }

    /** Right click is the remote's Back / Exit, as in media-centre UIs. */
    onContextMenu(event: MouseEvent): void {
        if (dialogOpen()) {
            return;
        }
        event.preventDefault();
        this.nav.press('back');
    }

    /** Receiver-wide keys any screen leaves unhandled. */
    private handleGlobal(key: SlykKey): boolean {
        switch (key) {
            case 'menu':
                void this.router.navigate(['/tv']);
                return true;
            case 'epg':
                void this.router.navigate(['/tv/guide']);
                return true;
            case 'tv':
                void this.router.navigate(['/tv/watch']);
                return true;
            case 'back':
                // Sky Q: Back from a section brings up the main menu (the
                // menu itself returns to live TV or Home).
                void this.router.navigate(['/tv/menu']);
                return true;
            default:
                return false;
        }
    }
}

/** A Material dialog (e.g. Add playlist) is open over the receiver. */
function dialogOpen(): boolean {
    return !!document.querySelector('.cdk-overlay-container .mat-mdc-dialog-container');
}

function readStoredVolume(): number {
    const stored = localStorage.getItem('volume')?.trim();
    if (!stored) {
        return 1;
    }
    const parsed = Number(stored);
    return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : 1;
}
