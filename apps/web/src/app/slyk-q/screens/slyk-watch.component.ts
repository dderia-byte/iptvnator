import {
    ChangeDetectionStrategy,
    Component,
    computed,
    DestroyRef,
    effect,
    inject,
    signal,
    untracked,
} from '@angular/core';
import { Router } from '@angular/router';
import { SlykPiconComponent } from '../slyk-chrome.component';
import { SlykEpgService } from '../slyk-epg.service';
import { slykDate, slykResolutionBadge, slykTime } from '../slyk-format';
import { SlykKeyPress } from '../slyk-keys';
import { SlykNavService, SlykScreen } from '../slyk-nav.service';
import { SlykTvService } from '../slyk-tv.service';
import { SlykMiniGuideComponent } from './slyk-mini-guide.component';

/** Enigma2's default infobar timeout. */
const INFOBAR_TIMEOUT_MS = 5000;
const NUMBER_ZAP_TIMEOUT_MS = 2500;

/** Live TV: Slyk Q `InfoBar`, `NumberZap` and the mini guide over video. */
@Component({
    selector: 'app-slyk-watch',
    imports: [SlykPiconComponent, SlykMiniGuideComponent],
    templateUrl: './slyk-watch.component.html',
    styleUrl: './slyk-watch.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SlykWatchComponent implements SlykScreen {
    private readonly router = inject(Router);
    readonly tv = inject(SlykTvService);
    readonly epg = inject(SlykEpgService);

    readonly infobar = signal(true);
    readonly pinned = signal(false);
    readonly miniGuide = signal(false);
    readonly numberEntry = signal('');
    readonly nav = inject(SlykNavService);
    /** On-screen remote for mouse users, shown while the mouse moves. */
    readonly mouseActions = [
        { label: 'Menu', run: () => this.nav.press('menu') },
        { label: 'Channels', run: () => this.nav.press('up') },
        { label: 'TV Guide', run: () => this.nav.press('epg') },
        { label: 'Mini Guide', run: () => this.nav.press('right') },
        { label: 'CH −', run: () => this.nav.press('channelDown') },
        { label: 'CH +', run: () => this.nav.press('channelUp') },
        { label: 'Info', run: () => this.nav.press('info') },
    ];
    private infobarTimer?: ReturnType<typeof setTimeout>;
    private numberTimer?: ReturnType<typeof setTimeout>;

    readonly channel = this.tv.activeChannel;
    readonly name = computed(() => this.tv.displayName(this.channel()));
    readonly number = computed(() => this.tv.numberOf(this.channel()));
    readonly info = computed(() => this.epg.nowNext(this.channel()));
    readonly progress = computed(
        () => this.epg.progress(this.info().now) * 100
    );
    readonly nowStart = computed(() => slykTime(this.info().now?.startMs));
    readonly nextStart = computed(() => slykTime(this.info().next?.startMs));
    readonly date = computed(() => slykDate(this.epg.now()));
    readonly badge = computed(() => slykResolutionBadge(this.name()));
    readonly numberTarget = computed(() => {
        const value = Number(this.numberEntry());
        return this.tv.displayName(this.tv.tvChannels()[value - 1]) || '';
    });

    constructor() {
        const destroyRef = inject(DestroyRef);
        this.nav.register(this, destroyRef, 'full');
        destroyRef.onDestroy(() => {
            clearTimeout(this.infobarTimer);
            clearTimeout(this.numberTimer);
        });
        // Every zap brings the infobar up, then it times out.
        effect(() => {
            this.channel();
            untracked(() => this.showInfobar());
        });
        if (!this.channel()) {
            void this.router.navigateByUrl('/tv/channels', { replaceUrl: true });
        }
    }

    showInfobar(): void {
        this.infobar.set(true);
        clearTimeout(this.infobarTimer);
        if (!this.pinned()) {
            this.infobarTimer = setTimeout(
                () => this.infobar.set(false),
                INFOBAR_TIMEOUT_MS
            );
        }
    }

    hideInfobar(): void {
        clearTimeout(this.infobarTimer);
        this.pinned.set(false);
        this.infobar.set(false);
    }

    closeMiniGuide(): void {
        this.miniGuide.set(false);
    }

    onKey({ key, digit }: SlykKeyPress): boolean {
        switch (key) {
            case 'digit':
                this.typeDigit(digit ?? 0);
                return true;
            case 'ok':
                if (this.numberEntry()) {
                    this.commitNumber();
                } else if (this.infobar()) {
                    this.hideInfobar();
                } else {
                    this.showInfobar();
                }
                return true;
            case 'info':
                this.pinned.update((p) => !p);
                this.showInfobar();
                return true;
            case 'channelUp':
            case 'channelDown':
                this.tv.zap(key === 'channelUp' ? 1 : -1);
                return true;
            case 'up':
            case 'down':
                void this.router.navigateByUrl('/tv/channels');
                return true;
            case 'left':
            case 'right':
                this.hideInfobar();
                this.miniGuide.set(true);
                return true;
            case 'back':
                if (this.numberEntry()) {
                    this.numberEntry.set('');
                } else {
                    this.hideInfobar();
                }
                return true;
            default:
                return false;
        }
    }

    private typeDigit(digit: number): void {
        const entry = (this.numberEntry() + digit).slice(-4);
        this.numberEntry.set(entry);
        clearTimeout(this.numberTimer);
        if (entry.length >= 4) {
            this.commitNumber();
            return;
        }
        this.numberTimer = setTimeout(
            () => this.commitNumber(),
            NUMBER_ZAP_TIMEOUT_MS
        );
    }

    private commitNumber(): void {
        clearTimeout(this.numberTimer);
        const value = Number(this.numberEntry());
        this.numberEntry.set('');
        if (value > 0) {
            this.tv.playNumber(value);
        }
    }
}
