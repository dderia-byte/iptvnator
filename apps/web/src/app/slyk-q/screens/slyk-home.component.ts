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
import { GENRE_PREFIX } from '../slyk-categories.service';
import { SlykEpgService } from '../slyk-epg.service';
import { slykTime } from '../slyk-format';
import { SlykKeyPress, wrapIndex } from '../slyk-keys';
import { SlykLogoComponent } from '../slyk-logo.component';
import { SlykNavService, SlykScreen } from '../slyk-nav.service';
import { SlykRecentService } from '../slyk-recent.service';
import { BOUQUET_FAVOURITES, SlykTvService } from '../slyk-tv.service';

interface MenuItem {
    label: string;
    action: () => void;
}

interface Rail {
    title: string;
    channels: Channel[];
}

const RAIL_TILES = 12;
/** Tiles fully visible in a rail before it scrolls. */
const VISIBLE_TILES = 3;
const TILE_STEP = 380;
const RAIL_STEP = 340;

/**
 * Sky Q style home: live TV keeps playing behind a dark wash, the menu runs
 * down the left and rails of channel tiles (Recently Watched, Favourites,
 * Sports, Movies…) fill the right, each tile showing what is on now.
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

    readonly items: MenuItem[] = [
        { label: 'TV Guide', action: () => this.go('/tv/guide-menu') },
        { label: 'Channels', action: () => this.go('/tv/channels') },
        { label: 'Favourites', action: () => this.openBouquet(BOUQUET_FAVOURITES, '/tv/channels') },
        { label: 'Sports', action: () => this.openGenre('Sports') },
        { label: 'Movies', action: () => this.openGenre('Movies') },
        { label: 'Kids', action: () => this.openGenre('Kids') },
        { label: 'Playlists', action: () => this.go('/tv/playlists') },
        { label: 'Settings', action: () => this.go('/tv/settings') },
        { label: 'Classic View', action: () => this.go('/workspace') },
    ];

    readonly area = signal<'menu' | 'rails'>('menu');
    readonly menuIndex = signal(0);
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
        const genreRail = (genre: string, title: string): Rail => ({
            title,
            channels: channels
                .filter((c) => genres.get(c) === genre && inRegion(c))
                .slice(0, RAIL_TILES),
        });
        return [
            { title: 'Continue Watching', channels: this.recent().slice(0, RAIL_TILES) },
            { title: 'Your Favourites', channels: favourites.slice(0, RAIL_TILES) },
            genreRail('Entertainment', 'Top Picks'),
            genreRail('Sports', 'Sports On Now'),
            genreRail('Movies', 'Movies On Now'),
            genreRail('Kids', 'Kids'),
            genreRail('News', 'News'),
        ].filter((rail) => rail.channels.length > 0);
    });

    constructor() {
        inject(SlykNavService).register(this, inject(DestroyRef), 'full');
        effect(() => void this.epg.load(([] as Channel[]).concat(...this.rails().map((r) => r.channels))));
    }

    tileOf(rail: number): number {
        return Math.min(
            this.tileIndex()[rail] ?? 0,
            (this.rails()[rail]?.channels.length ?? 1) - 1
        );
    }

    /** Horizontal scroll of a rail: the focused tile stays in view. */
    railOffset(rail: number): number {
        return Math.max(0, this.tileOf(rail) - (VISIBLE_TILES - 1)) * TILE_STEP;
    }

    /** Vertical scroll: the focused rail is never below the second slot. */
    readonly railsOffset = computed(() => Math.max(0, this.railIndex() - 1) * RAIL_STEP);

    isFocused(rail: number, tile: number): boolean {
        return this.area() === 'rails' && this.railIndex() === rail && this.tileOf(rail) === tile;
    }

    nowTitle(channel: Channel): string {
        return this.epg.nowNext(channel).now?.title ?? '';
    }

    nowProgress(channel: Channel): number {
        return this.epg.progress(this.epg.nowNext(channel).now) * 100;
    }

    focusTile(rail: number, tile: number): void {
        this.area.set('rails');
        this.railIndex.set(rail);
        this.setTile(rail, tile);
    }

    openTile(rail: number, tile: number): void {
        const channel = this.rails()[rail]?.channels[tile];
        if (channel) {
            this.tv.play(channel);
            this.go('/tv/watch');
        }
    }

    onKey({ key }: SlykKeyPress): boolean {
        return this.area() === 'menu' ? this.onMenuKey(key) : this.onRailKey(key);
    }

    private onMenuKey(key: string): boolean {
        switch (key) {
            case 'up':
            case 'down':
                this.menuIndex.update((i) =>
                    wrapIndex(i, key === 'up' ? -1 : 1, this.items.length)
                );
                return true;
            case 'right':
                if (this.rails().length) {
                    this.area.set('rails');
                }
                return true;
            case 'ok':
                this.items[this.menuIndex()].action();
                return true;
            default:
                return false;
        }
    }

    private onRailKey(key: string): boolean {
        const rail = this.railIndex();
        const tile = this.tileOf(rail);
        switch (key) {
            case 'left':
                if (tile === 0) {
                    this.area.set('menu');
                } else {
                    this.setTile(rail, tile - 1);
                }
                return true;
            case 'right':
                this.setTile(
                    rail,
                    Math.min(tile + 1, this.rails()[rail].channels.length - 1)
                );
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
                this.area.set('menu');
                return true;
            default:
                return false;
        }
    }

    private setTile(rail: number, tile: number): void {
        this.tileIndex.update((tiles) => {
            const next = [...tiles];
            next[rail] = tile;
            return next;
        });
    }

    private openGenre(genre: string): void {
        const id = GENRE_PREFIX + genre;
        if (this.tv.bouquets().some((b) => b.id === id)) {
            this.openBouquet(id, '/tv/guide');
        } else {
            this.go('/tv/guide-menu');
        }
    }

    private openBouquet(id: string, path: string): void {
        this.tv.setBouquet(id);
        this.go(path);
    }

    private go(path: string): void {
        void this.router.navigateByUrl(path);
    }
}
