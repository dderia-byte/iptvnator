import {
    ChangeDetectionStrategy,
    Component,
    computed,
    DestroyRef,
    effect,
    inject,
    output,
    signal,
    untracked,
} from '@angular/core';
import { Router } from '@angular/router';
import { SlykEpgService, SlykEvent } from '../slyk-epg.service';
import { slykResolutionBadge, slykTime } from '../slyk-format';
import { SlykKeyPress } from '../slyk-keys';
import { SlykLogoComponent } from '../slyk-logo.component';
import { SlykNavService, SlykScreen } from '../slyk-nav.service';
import { SlykTvService } from '../slyk-tv.service';

/** Upcoming programmes shown to the right of the selected one. */
const NEXT_TILES = 2;
/** The banner hides itself after this long without a key press. */
const IDLE_MS = 8000;

/**
 * Sky Q channel banner over live TV, laid out from a Sky Q screenshot: the
 * channel between up/down chevrons on the left, the selected programme in
 * a dark panel in the middle, and what follows running off the right edge.
 * Up/Down change channel (without tuning), Left/Right move through
 * programmes, OK watches the shown channel, Back closes.
 */
@Component({
    selector: 'app-slyk-mini-guide',
    imports: [SlykLogoComponent],
    templateUrl: './slyk-mini-guide.component.html',
    styleUrl: './slyk-mini-guide.component.scss',
    // Layout-free host, like the screens: a boxed host animated by the
    // screen fade would form its own stacking layer under the video.
    host: { style: 'display: contents' },
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SlykMiniGuideComponent implements SlykScreen {
    private readonly router = inject(Router);
    readonly tv = inject(SlykTvService);
    readonly epg = inject(SlykEpgService);
    readonly nav = inject(SlykNavService);
    readonly closed = output<void>();

    /** Offset from the playing channel, and the selected programme. */
    readonly offset = signal(0);
    readonly programme = signal(0);
    private idleTimer?: ReturnType<typeof setTimeout>;

    private readonly list = computed(() =>
        this.tv.bouquetChannels().length ? this.tv.bouquetChannels() : this.tv.tvChannels()
    );
    readonly channel = computed(() => {
        const list = this.list();
        const active = this.tv.activeChannel();
        if (!list.length) {
            return active;
        }
        const index = active ? list.findIndex((c) => c.id === active.id && c.url === active.url) : 0;
        const at = Math.max(0, index) + this.offset();
        return list[((at % list.length) + list.length) % list.length];
    });
    readonly name = computed(() => this.tv.displayName(this.channel()));
    readonly number = computed(() => this.tv.numberOf(this.channel()));
    readonly badge = computed(() => slykResolutionBadge(this.channel()?.name ?? ''));
    /** Sky's "Wednesday, 3.01pm". */
    readonly when = computed(() => {
        const now = this.epg.now();
        const day = new Date(now).toLocaleDateString('en-GB', { weekday: 'long' });
        return `${day}, ${slykTime(now)}`;
    });
    /** What is on now and later on the shown channel. */
    readonly programmes = computed(() => {
        const now = this.epg.now();
        return this.epg.events(this.channel()).filter((e) => e.stopMs > now);
    });
    readonly current = computed(() => this.programmes()[this.programme()] ?? null);
    readonly upcoming = computed(() =>
        this.programmes().slice(this.programme() + 1, this.programme() + 1 + NEXT_TILES)
    );
    readonly progress = computed(() => {
        const event = this.current();
        return event && event.startMs <= this.epg.now() ? this.epg.progress(event) * 100 : 0;
    });

    constructor() {
        this.nav.register(this, inject(DestroyRef));
        inject(DestroyRef).onDestroy(() => clearTimeout(this.idleTimer));
        this.touch();
        effect(() => {
            const channel = this.channel();
            if (channel) {
                void this.epg.load([channel]);
            }
        });
        // A zap re-centres the banner on the new channel's current programme.
        effect(() => {
            this.tv.activeChannel();
            untracked(() => {
                this.offset.set(0);
                this.programme.set(0);
                this.touch();
            });
        });
    }

    time(ms: number): string {
        return slykTime(ms);
    }

    /** EPG artwork for a programme, when the guide data has any. */
    art(event: SlykEvent | null): string {
        return event?.program?.iconUrl?.trim() || '';
    }

    stepChannel(delta: 1 | -1): void {
        this.offset.update((o) => o + delta);
        this.programme.set(0);
        this.touch();
    }

    stepProgramme(delta: 1 | -1): void {
        const count = this.programmes().length;
        this.programme.update((p) => Math.min(Math.max(0, p + delta), Math.max(0, count - 1)));
        this.touch();
    }

    /** Watches the shown channel. */
    watch(): void {
        const channel = this.channel();
        if (channel && this.offset() !== 0) {
            this.tv.play(channel);
        }
        this.closed.emit();
    }

    openMenu(): void {
        this.closed.emit();
        void this.router.navigateByUrl('/tv/menu');
    }

    onKey({ key }: SlykKeyPress): boolean {
        this.touch();
        switch (key) {
            case 'up':
                this.stepChannel(1);
                return true;
            case 'down':
                this.stepChannel(-1);
                return true;
            case 'left':
            case 'right':
                this.stepProgramme(key === 'left' ? -1 : 1);
                return true;
            case 'ok':
            case 'green':
                this.watch();
                return true;
            case 'back':
            case 'info':
                this.closed.emit();
                return true;
            case 'menu':
                this.openMenu();
                return true;
            default:
                // Channel up/down, digits and the guide key act on live TV.
                return false;
        }
    }

    private touch(): void {
        clearTimeout(this.idleTimer);
        this.idleTimer = setTimeout(() => this.closed.emit(), IDLE_MS);
    }
}
