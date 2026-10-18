import {
    ChangeDetectionStrategy,
    Component,
    computed,
    effect,
    HostListener,
    inject,
    OnInit,
    signal,
    ViewEncapsulation,
} from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { isTypingInInput } from '@iptvnator/portal/shared/util';
import { WebPlayerViewComponent } from '@iptvnator/ui/playback';
import { SettingsStore } from '@iptvnator/services';
import { SlykEpgService } from './slyk-epg.service';
import { toSlykKey } from './slyk-keys';
import { SlykNavService } from './slyk-nav.service';
import { SlykTvService } from './slyk-tv.service';

const STAGE_WIDTH = 1920;
const STAGE_HEIGHT = 1080;

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
    providers: [SlykTvService, SlykEpgService, SlykNavService],
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
    readonly player = computed(
        () => this.tv.playerOverride() ?? this.settingsStore.player() ?? null
    );

    constructor() {
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
        if (event.defaultPrevented || isTypingInInput(event)) {
            return;
        }
        const press = toSlykKey(event);
        if (!press) {
            return;
        }
        if (this.nav.dispatch(press) || this.handleGlobal(press.key)) {
            event.preventDefault();
            event.stopPropagation();
        }
    }

    /** Receiver-wide keys any screen leaves unhandled. */
    private handleGlobal(key: string): boolean {
        switch (key) {
            case 'menu':
                void this.router.navigate(['/tv']);
                return true;
            case 'epg':
                void this.router.navigate(['/tv/guide']);
                return true;
            case 'tv':
            case 'back':
                void this.router.navigate(['/tv/watch']);
                return true;
            default:
                return false;
        }
    }
}

function readStoredVolume(): number {
    const stored = localStorage.getItem('volume')?.trim();
    if (!stored) {
        return 1;
    }
    const parsed = Number(stored);
    return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : 1;
}
