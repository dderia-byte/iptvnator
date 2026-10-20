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
import { Channel } from '@iptvnator/shared/interfaces';
import { SlykLogoComponent } from '../slyk-logo.component';
import { SlykEpgService } from '../slyk-epg.service';
import { slykResolutionBadge, slykTime } from '../slyk-format';
import { SlykKeyPress } from '../slyk-keys';
import { SlykNavService, SlykScreen } from '../slyk-nav.service';
import { SlykTvService } from '../slyk-tv.service';
import { SlykMiniGuideComponent } from './slyk-mini-guide.component';

/** Enigma2's default infobar timeout. */
const INFOBAR_TIMEOUT_MS = 5000;
const NUMBER_ZAP_TIMEOUT_MS = 2500;
/** Large Xtream line-ups run past 10,000 services. */
const MAX_DIGITS = 5;

/** Live TV: Slyk Q `InfoBar`, `NumberZap` and the mini guide over video. */
@Component({
    selector: 'app-slyk-watch',
    imports: [SlykLogoComponent, SlykMiniGuideComponent],
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
        { label: 'Channels', run: () => void this.router.navigateByUrl('/tv/channels') },
        { label: 'TV Guide', run: () => this.nav.press('epg') },
        { label: 'Mini Guide', run: () => this.openMiniGuide() },
        { label: 'CH −', run: () => this.nav.press('channelDown') },
        { label: 'CH +', run: () => this.nav.press('channelUp') },
        { label: 'Info', run: () => this.nav.press('info') },
    ];
    private infobarTimer?: ReturnType<typeof setTimeout>;
    private numberTimer?: ReturnType<typeof setTimeout>;

    /** Sky Q banner: Up/Down browse other channels without tuning. */
    readonly browse = signal(0);
    /** The channel the banner describes: the playing one, or a browsed one. */
    readonly channel = computed(() => {
        const active = this.tv.activeChannel();
        const offset = this.browse();
        const list = this.tv.bouquetChannels().length ? this.tv.bouquetChannels() : this.tv.tvChannels();
        const index = active ? list.findIndex((c) => c.id === active.id && c.url === active.url) : -1;
        if (!offset || index < 0) {
            return active;
        }
        return list[(index + offset + list.length * 100) % list.length];
    });
    readonly name = computed(() => this.tv.displayName(this.channel()));
    readonly number = computed(() => this.tv.numberOf(this.channel()));
    readonly info = computed(() => this.epg.nowNext(this.channel()));
    readonly progress = computed(
        () => this.epg.progress(this.info().now) * 100
    );
    readonly nowStart = computed(() => slykTime(this.info().now?.startMs));
    readonly nowEnd = computed(() => slykTime(this.info().now?.stopMs));
    readonly nextStart = computed(() => slykTime(this.info().next?.startMs));
    readonly clock = computed(() => slykTime(this.epg.now()));
    readonly badge = computed(() => slykResolutionBadge(this.channel()?.name ?? ''));
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
            this.tv.activeChannel();
            untracked(() => {
                this.browse.set(0);
                this.showInfobar();
            });
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
        this.browse.set(0);
        clearTimeout(this.infobarTimer);
        this.pinned.set(false);
        this.infobar.set(false);
    }

    openMiniGuide(): void {
        this.hideInfobar();
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
                } else if (this.browse()) {
                    const browsed = this.channel();
                    this.browse.set(0);
                    if (browsed) {
                        this.tv.play(browsed);
                    }
                } else {
                    // Sky Q: Select brings up the mini guide.
                    this.openMiniGuide();
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
            case 'down':
                // Down shows the banner, then browses other channels in it.
                if (this.infobar()) {
                    this.browse.update((b) => b - 1);
                }
                this.showInfobar();
                void this.epg.load([this.channel()].filter((c) => !!c) as Channel[]);
                return true;
            case 'up':
            case 'left':
            case 'right':
                this.openMiniGuide();
                return true;
            case 'back':
                // Back clears a half-typed channel number, otherwise leaves
                // live TV for the screen the channel was chosen from.
                if (this.numberEntry()) {
                    this.numberEntry.set('');
                } else if (this.browse()) {
                    this.browse.set(0);
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
