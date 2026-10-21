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
import { SlykKeyPress } from '../slyk-keys';
import { SlykNavService, SlykScreen } from '../slyk-nav.service';
import { SlykTvService } from '../slyk-tv.service';
import { SlykMiniGuideComponent } from './slyk-mini-guide.component';

const NUMBER_ZAP_TIMEOUT_MS = 2500;
/** Large Xtream line-ups run past 10,000 services. */
const MAX_DIGITS = 5;

/** Live TV: the Sky Q channel banner and number entry over the picture. */
@Component({
    selector: 'app-slyk-watch',
    imports: [SlykMiniGuideComponent],
    templateUrl: './slyk-watch.component.html',
    styleUrl: './slyk-watch.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SlykWatchComponent implements SlykScreen {
    private readonly router = inject(Router);
    readonly tv = inject(SlykTvService);

    /** The Sky Q channel banner over the picture (hides itself when idle). */
    readonly miniGuide = signal(false);
    readonly numberEntry = signal('');
    readonly nav = inject(SlykNavService);
    private numberTimer?: ReturnType<typeof setTimeout>;

    readonly channel = this.tv.activeChannel;
    readonly numberTarget = computed(() => {
        const value = Number(this.numberEntry());
        return this.tv.displayName(this.tv.tvChannels()[value - 1]) || '';
    });

    constructor() {
        const destroyRef = inject(DestroyRef);
        this.nav.register(this, destroyRef, 'full');
        destroyRef.onDestroy(() => clearTimeout(this.numberTimer));
        // Every zap brings the banner up; it times out by itself.
        effect(() => {
            this.tv.activeChannel();
            untracked(() => this.openMiniGuide());
        });
        if (!this.channel()) {
            void this.router.navigateByUrl('/tv/channels', { replaceUrl: true });
        }
    }

    openMiniGuide(): void {
        this.miniGuide.set(true);
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
                } else {
                    this.openMiniGuide();
                }
                return true;
            case 'channelUp':
            case 'channelDown':
                this.tv.zap(key === 'channelUp' ? 1 : -1);
                return true;
            case 'info':
            case 'up':
            case 'down':
            case 'left':
            case 'right':
                // Sky Q: any arrow or Select brings up the banner.
                this.openMiniGuide();
                return true;
            case 'back':
                // Back clears a half-typed channel number, otherwise leaves
                // live TV for the screen the channel was chosen from.
                if (this.numberEntry()) {
                    this.numberEntry.set('');
                } else {
                    void this.router.navigateByUrl(this.nav.lastMenuUrl());
                }
                return true;
            default:
                return false;
        }
    }

    private typeDigit(digit: number): void {
        const entry = (this.numberEntry() + digit).slice(-MAX_DIGITS);
        this.numberEntry.set(entry);
        clearTimeout(this.numberTimer);
        if (entry.length >= MAX_DIGITS) {
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
