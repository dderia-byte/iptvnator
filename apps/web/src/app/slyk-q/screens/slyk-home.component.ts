import {
    ChangeDetectionStrategy,
    Component,
    computed,
    DestroyRef,
    effect,
    inject,
    signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { Channel } from '@iptvnator/shared/interfaces';
import { SlykEpgService } from '../slyk-epg.service';
import {
    slykLength,
    slykResolutionBadge,
    slykStartedAt,
    slykTime,
} from '../slyk-format';
import { SlykKeyPress } from '../slyk-keys';
import { SlykLogoComponent } from '../slyk-logo.component';
import { SlykNavService, SlykScreen } from '../slyk-nav.service';
import { SlykRecentService } from '../slyk-recent.service';
import { SlykTvService } from '../slyk-tv.service';

interface Rail {
    title: string;
    /** 'cards': Sky's navy "What's on now and next" cards. */
    kind: 'cards' | 'tiles';
    channels: Channel[];
}

const RAIL_TILES = 12;
/** Tile pitch (460 wide + gap) and rail pitch, in stage pixels. */
const TILE_STEP = 480;
const RAIL_STEP = 350;

/**
 * Sky Q Home: no left column, a large hero describing the focused tile, and
 * rails underneath. The focused rail slides up under the hero; rails scroll
 * sideways keeping focus near the left. Back opens the main menu.
 */
@Component({
    selector: 'app-slyk-home',
    imports: [SlykLogoComponent],
    templateUrl: './slyk-home.component.html',
    styleUrl: './slyk-home.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SlykHomeComponent implements SlykScreen {
    private readonly router = inject(Router);
    readonly tv = inject(SlykTvService);
    readonly epg = inject(SlykEpgService);
    readonly tileStep = TILE_STEP;
    readonly railStep = RAIL_STEP;

    readonly railIndex = signal(0);
    /** Focused tile per rail, so each rail keeps its place. */
    readonly tileIndex = signal<number[]>([]);
    readonly clock = computed(() => slykTime(this.epg.now()));

    private readonly recent = inject(SlykRecentService).in(this.tv.tvChannels);

    readonly rails = computed<Rail[]>(() => {
        const channels = this.tv.tvChannels();
        const genres = this.tv.categories.genreOf();
        const inRegion = (c: Channel) => this.tv.categories.inRegion(c);
        const favourites = channels.filter((c) => this.tv.isFavourite(c));
        const ofGenre = (genre: string) =>
            channels.filter((c) => genres.get(c) === genre && inRegion(c)).slice(0, RAIL_TILES);
        const nowNext = favourites.length ? favourites : ofGenre('Entertainment');
        const rails: Rail[] = [
            { title: "What's on now and next", kind: 'cards', channels: nowNext.slice(0, RAIL_TILES) },
            { title: 'Continue watching', kind: 'tiles', channels: this.recent().slice(0, RAIL_TILES) },
            { title: 'Your favourite channels', kind: 'tiles', channels: favourites.slice(0, RAIL_TILES) },
            { title: 'Sport now', kind: 'tiles', channels: ofGenre('Sports') },
            { title: 'Movies on now', kind: 'tiles', channels: ofGenre('Movies') },
            { title: 'Kids', kind: 'tiles', channels: ofGenre('Kids') },
            { title: 'News', kind: 'tiles', channels: ofGenre('News') },
        ];
        return rails.filter((rail) => rail.channels.length > 0);
    });

    /** The tile the hero describes. */
    readonly focused = computed<Channel | null>(() => {
        const rail = this.railIndex();
        return this.rails()[rail]?.channels[this.tileOf(rail)] ?? null;
    });
    readonly hero = computed(() => {
        const channel = this.focused();
        const now = this.epg.nowNext(channel).now;
        return {
            channel,
            name: this.tv.displayName(channel),
            title: now?.title || this.tv.displayName(channel),
            length: now ? slykLength(now) : '',
            when: now ? slykStartedAt(now, this.epg.now()) : '',
            badge: slykResolutionBadge(channel?.name ?? ''),
            synopsis: now?.description || (channel ? 'No programme information available.' : ''),
        };
    });
    /** Vertical scroll: the focused rail sits right under the hero. */
    readonly railsOffset = computed(() => this.railIndex() * RAIL_STEP);

    constructor() {
        inject(SlykNavService).register(this, inject(DestroyRef), 'hidden');
        effect(() => void this.epg.load(([] as Channel[]).concat(...this.rails().map((r) => r.channels))));
    }

    tileOf(rail: number): number {
        return Math.min(
            this.tileIndex()[rail] ?? 0,
            Math.max(0, (this.rails()[rail]?.channels.length ?? 1) - 1)
        );
    }

    /** Horizontal scroll: the focused tile stays first or second. */
    railOffset(rail: number): number {
        return Math.max(0, this.tileOf(rail) - 1) * TILE_STEP;
    }

    isFocused(rail: number, tile: number): boolean {
        return this.railIndex() === rail && this.tileOf(rail) === tile;
    }

    nowNext(channel: Channel) {
        return this.epg.nowNext(channel);
    }

    startedAt(channel: Channel): string {
        return slykStartedAt(this.epg.nowNext(channel).now, this.epg.now());
    }

    startsAt(channel: Channel): string {
        return slykStartedAt(this.epg.nowNext(channel).next, this.epg.now());
    }

    progress(channel: Channel): number {
        return this.epg.progress(this.epg.nowNext(channel).now) * 100;
    }

    focusTile(rail: number, tile: number): void {
        this.railIndex.set(rail);
        this.setTile(rail, tile);
    }

    openTile(rail: number, tile: number): void {
        const channel = this.rails()[rail]?.channels[tile];
        if (channel) {
            this.tv.play(channel);
            void this.router.navigateByUrl('/tv/watch');
        }
    }

    onKey({ key }: SlykKeyPress): boolean {
        const rail = this.railIndex();
        const tile = this.tileOf(rail);
        const count = this.rails()[rail]?.channels.length ?? 0;
        switch (key) {
            case 'left':
                if (tile === 0) {
                    this.openMenu();
                } else {
                    this.setTile(rail, tile - 1);
                }
                return true;
            case 'right':
                this.setTile(rail, Math.min(tile + 1, count - 1));
                return true;
            case 'up':
            case 'down': {
                const next = rail + (key === 'up' ? -1 : 1);
                if (next >= 0 && next < this.rails().length) {
                    this.railIndex.set(next);
                }
                return true;
            }
            case 'ok':
                this.openTile(rail, tile);
                return true;
            case 'back':
            case 'menu':
                this.openMenu();
                return true;
            default:
                return false;
        }
    }

    private openMenu(): void {
        void this.router.navigateByUrl('/tv/menu');
    }

    private setTile(rail: number, tile: number): void {
        this.tileIndex.update((tiles) => {
            const next = [...tiles];
            next[rail] = Math.max(0, tile);
            return next;
        });
    }
}
