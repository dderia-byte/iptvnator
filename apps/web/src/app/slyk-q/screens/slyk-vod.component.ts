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
import { ActivatedRoute, Router } from '@angular/router';
import { SlykButtonsComponent, SlykTemplateComponent } from '../slyk-chrome.component';
import { SlykKeyPress } from '../slyk-keys';
import { SlykNavService, SlykScreen } from '../slyk-nav.service';
import { SlykTvService } from '../slyk-tv.service';
import {
    SlykEpisode,
    SlykVodCategory,
    SlykVodDetails,
    SlykVodItem,
    SlykVodKind,
    SlykVodService,
} from '../slyk-vod.service';

interface PosterRail {
    title: string;
    items: SlykVodItem[];
}

const FEATURED_RAILS = 6;
const RAIL_ITEMS = 24;
const GRID_COLUMNS = 6;
const COLUMN_VISIBLE = 7;
const EPISODES_VISIBLE = 6;
export const POSTER_STEP = 222;
export const RAIL_STEP = 380;

/**
 * Sky Cinema / Sky Store style pages for the account's films and box sets:
 * categories in the left column (Featured first), a hero for the focused
 * title, poster rails or a poster grid, and a detail page with Play and,
 * for box sets, the episode list.
 */
@Component({
    selector: 'app-slyk-vod',
    imports: [SlykTemplateComponent, SlykButtonsComponent],
    templateUrl: './slyk-vod.component.html',
    styleUrl: './slyk-vod.component.scss',
    host: { '[class.sky-theme-red]': "kind === 'vod'" },
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SlykVodComponent implements SlykScreen {
    private readonly router = inject(Router);
    private readonly tv = inject(SlykTvService);
    readonly vod = inject(SlykVodService);
    /** Hover focuses tiles only while the mouse is really in use. */
    readonly nav = inject(SlykNavService);
    readonly kind: SlykVodKind = inject(ActivatedRoute).snapshot.data['kind'] ?? 'vod';
    readonly title = this.kind === 'vod' ? 'Movies' : 'Box sets';
    readonly posterStep = POSTER_STEP;
    readonly railStep = RAIL_STEP;

    readonly area = signal<'column' | 'content' | 'detail'>('content');
    readonly categories = signal<SlykVodCategory[]>([]);
    readonly columnIndex = signal(0);
    readonly rails = signal<PosterRail[]>([]);
    readonly loading = signal(true);
    readonly railIndex = signal(0);
    readonly tileIndex = signal<number[]>([]);
    readonly details = signal<SlykVodDetails | null>(null);
    readonly episodes = signal<SlykEpisode[]>([]);
    readonly episodeIndex = signal(-1);

    readonly columnItems = computed(() => [
        { id: '', label: 'Featured' },
        ...this.categories(),
    ]);
    readonly columnVisible = computed(() => {
        const items = this.columnItems();
        if (items.length <= COLUMN_VISIBLE) {
            return items.map((item, index) => ({ item, index }));
        }
        return Array.from({ length: COLUMN_VISIBLE }, (_, slot) => {
            const index = (this.columnIndex() - 1 + slot + items.length) % items.length;
            return { item: items[index], index };
        });
    });
    readonly focused = computed<SlykVodItem | null>(() => {
        const rail = this.railIndex();
        return this.rails()[rail]?.items[this.tileOf(rail)] ?? null;
    });
    readonly isFeatured = computed(() => this.columnIndex() === 0);
    readonly railsOffset = computed(() => this.railIndex() * (this.isFeatured() ? RAIL_STEP : 340));
    readonly episodeWindow = computed(() => {
        const start = Math.max(0, Math.min(this.episodeIndex() - 1, this.episodes().length - EPISODES_VISIBLE));
        return this.episodes()
            .slice(start, start + EPISODES_VISIBLE)
            .map((episode, i) => ({ episode, index: start + i }));
    });

    private request = 0;

    constructor() {
        this.nav.register(this, inject(DestroyRef), 'pig');
        void this.vod
            .categories(this.kind)
            .then((cats) => {
                this.categories.set(cats);
                this.loadContent();
            })
            .catch(() => this.loading.set(false));
        // The hero's synopsis follows focus once it settles on a title.
        effect((onCleanup) => {
            const item = this.focused();
            untracked(() => this.details.set(null));
            if (!item) {
                return;
            }
            const timer = setTimeout(() => {
                void this.vod
                    .details(item)
                    .then((d) => this.focused() === item && this.details.set(d))
                    .catch(() => undefined);
            }, 300);
            onCleanup(() => clearTimeout(timer));
        });
    }

    tileOf(rail: number): number {
        const count = this.rails()[rail]?.items.length ?? 0;
        return Math.min(this.tileIndex()[rail] ?? 0, Math.max(0, count - 1));
    }

    railOffset(rail: number): number {
        return this.isFeatured() ? Math.max(0, this.tileOf(rail) - 1) * POSTER_STEP : 0;
    }

    isFocused(rail: number, tile: number): boolean {
        return this.area() !== 'column' && this.railIndex() === rail && this.tileOf(rail) === tile;
    }

    /**
     * Hover moves focus along the focused rail only: focusing another rail
     * slides the rails, which would put yet another one under the pointer.
     */
    hoverTile(rail: number, tile: number): void {
        if (this.nav.pointerActive() && rail === this.railIndex()) {
            this.setTile(rail, tile);
        }
    }

    focusTile(rail: number, tile: number): void {
        this.area.set('content');
        this.railIndex.set(rail);
        this.setTile(rail, tile);
    }

    chooseCategory(index: number): void {
        this.columnIndex.set(index);
        this.loadContent();
    }

    openDetail(): void {
        const item = this.focused();
        if (!item) {
            return;
        }
        this.area.set('detail');
        this.episodes.set([]);
        this.episodeIndex.set(-1);
        if (item.kind === 'series') {
            void this.vod.episodes(item).then((eps) => this.episodes.set(eps)).catch(() => undefined);
        }
    }

    play(episode?: SlykEpisode): void {
        const item = this.focused();
        const channel = item ? this.vod.playable(item, episode) : null;
        if (channel) {
            this.tv.play(channel);
            void this.router.navigateByUrl('/tv/watch');
        }
    }

    onKey({ key }: SlykKeyPress): boolean {
        switch (this.area()) {
            case 'column':
                return this.onColumnKey(key);
            case 'detail':
                return this.onDetailKey(key);
            default:
                return this.onContentKey(key);
        }
    }

    private onColumnKey(key: string): boolean {
        const length = this.columnItems().length;
        switch (key) {
            case 'up':
            case 'down':
                this.chooseCategory((this.columnIndex() + (key === 'up' ? -1 : 1) + length) % length);
                return true;
            case 'right':
            case 'ok':
                if (this.rails().length) {
                    this.area.set('content');
                }
                return true;
            default:
                return false;
        }
    }

    private onContentKey(key: string): boolean {
        const rail = this.railIndex();
        const tile = this.tileOf(rail);
        const count = this.rails()[rail]?.items.length ?? 0;
        switch (key) {
            case 'left':
                if (tile === 0) {
                    this.area.set('column');
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
                    if (!this.isFeatured()) {
                        this.setTile(next, tile);
                    }
                }
                return true;
            }
            case 'ok':
                this.openDetail();
                return true;
            default:
                return false;
        }
    }

    private onDetailKey(key: string): boolean {
        const count = this.episodes().length;
        switch (key) {
            case 'up':
            case 'down':
                if (count) {
                    this.episodeIndex.update((i) =>
                        Math.min(count - 1, Math.max(-1, i + (key === 'up' ? -1 : 1)))
                    );
                }
                return true;
            case 'ok': {
                const episode = this.episodes()[this.episodeIndex()];
                this.play(episode ?? this.episodes()[0]);
                return true;
            }
            case 'back':
                this.area.set('content');
                return true;
            default:
                return true;
        }
    }

    private loadContent(): void {
        const request = ++this.request;
        this.loading.set(true);
        this.railIndex.set(0);
        this.tileIndex.set([]);
        const categories = this.categories();
        const load = async (): Promise<PosterRail[]> => {
            if (this.isFeatured()) {
                const featured = categories.slice(0, FEATURED_RAILS);
                const lists = await Promise.all(
                    featured.map((c) => this.vod.items(this.kind, c.id).catch(() => []))
                );
                return featured
                    .map((c, i) => ({ title: c.label, items: lists[i].slice(0, RAIL_ITEMS) }))
                    .filter((rail) => rail.items.length > 0);
            }
            const category = this.columnItems()[this.columnIndex()];
            const items = await this.vod.items(this.kind, category.id).catch(() => []);
            const rows: PosterRail[] = [];
            for (let i = 0; i < items.length; i += GRID_COLUMNS) {
                rows.push({ title: '', items: items.slice(i, i + GRID_COLUMNS) });
            }
            return rows;
        };
        void load().then((rails) => {
            if (request === this.request) {
                this.rails.set(rails);
                this.loading.set(false);
            }
        });
    }

    private setTile(rail: number, tile: number): void {
        this.tileIndex.update((tiles) => {
            const next = [...tiles];
            next[rail] = Math.max(0, tile);
            return next;
        });
    }
}
