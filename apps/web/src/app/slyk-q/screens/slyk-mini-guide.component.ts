import {
    ChangeDetectionStrategy,
    Component,
    computed,
    DestroyRef,
    effect,
    inject,
    output,
    signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { SlykEpgService } from '../slyk-epg.service';
import { slykResolutionBadge, slykTime } from '../slyk-format';
import { SlykKeyPress } from '../slyk-keys';
import { SlykLogoComponent } from '../slyk-logo.component';
import { SlykNavService, SlykScreen } from '../slyk-nav.service';
import { SlykTvService } from '../slyk-tv.service';

/** Upcoming programmes shown as tiles to the right of the main card. */
const NEXT_TILES = 3;

/**
 * Sky Q mini guide over live TV: the channel on the left between up/down
 * chevrons, the focused programme as a large card, and what follows as
 * tiles running off the right edge. Up/Down change channel (without
 * tuning), Left/Right move through programmes, OK watches.
 */
@Component({
    selector: 'app-slyk-mini-guide',
    imports: [SlykLogoComponent],
    templateUrl: './slyk-mini-guide.component.html',
    styleUrl: './slyk-mini-guide.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SlykMiniGuideComponent implements SlykScreen {
    private readonly router = inject(Router);
    readonly tv = inject(SlykTvService);
    readonly epg = inject(SlykEpgService);
    readonly nav = inject(SlykNavService);
    readonly closed = output<void>();

    /** Offset from the playing channel, and the focused programme. */
    readonly offset = signal(0);
    readonly programme = signal(0);

    private readonly list = computed(() =>
        this.tv.bouquetChannels().length ? this.tv.bouquetChannels() : this.tv.tvChannels()
    );
    readonly channel = computed(() => {
        const list = this.list();
        const active = this.tv.activeChannel();
        const index = active ? list.findIndex((c) => c.id === active.id && c.url === active.url) : 0;
        if (!list.length) {
            return active;
        }
        const base = Math.max(0, index);
        return list[(((base + this.offset()) % list.length) + list.length) % list.length];
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
        effect(() => {
            const channel = this.channel();
            if (channel) {
                void this.epg.load([channel]);
            }
        });
    }

    time(ms: number): string {
        return slykTime(ms);
    }

    /** Up/Down step through channels; the programme focus resets. */
    stepChannel(delta: 1 | -1): void {
        this.offset.update((o) => o + delta);
        this.programme.set(0);
    }

    stepProgramme(delta: 1 | -1): void {
        const count = this.programmes().length;
        this.programme.update((p) => Math.min(Math.max(0, p + delta), Math.max(0, count - 1)));
    }

    /** Watches the shown channel (a later programme can only be tuned to). */
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
        switch (key) {
            case 'up':
            case 'channelUp':
                this.stepChannel(1);
                return true;
            case 'down':
            case 'channelDown':
                this.stepChannel(-1);
                return true;
            case 'left':
                if (this.programme() === 0) {
                    return true;
                }
                this.stepProgramme(-1);
                return true;
            case 'right':
                this.stepProgramme(1);
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
                return true;
        }
    }
}
