import { computed, signal } from '@angular/core';
import { GENRE_PREFIX, REGION_ALL } from './slyk-categories.service';
import { BOUQUET_FAVOURITES, SlykTvService } from './slyk-tv.service';

export const REGION_ITEM = 'region';

export interface SlykColumnItem {
    id: string;
    label: string;
    /** 1 for a provider group listed under its category. */
    depth: 0 | 1;
    /** A category whose provider groups can be listed under it. */
    expandable: boolean;
}

/** Items shown in the left column at once; the list wraps past them. */
const VISIBLE = 7;

/**
 * The TV guide's category list in Sky Q's left column: Favourites, All
 * channels and the Sky-style categories. OK on a category lists its
 * provider groups beneath it ("Sports" → "SKY SPORTS", "TNT SPORTS"…), and
 * the last item switches the region the categories cover.
 */
export class SlykGuideColumn {
    /** Category whose provider groups are listed under it. */
    readonly expanded = signal<string | null>(null);
    readonly index = signal(0);

    readonly items = computed<SlykColumnItem[]>(() => {
        const categories = this.tv.categories;
        const items: SlykColumnItem[] = [];
        const add = (id: string, label: string, depth: 0 | 1 = 0, expandable = false) =>
            items.push({ id, label, depth, expandable });
        if (this.tv.favouritesSupported()) {
            add(BOUQUET_FAVOURITES, 'Favourites');
        }
        add(GENRE_PREFIX + REGION_ALL, 'All channels');
        for (const genre of categories.genres()) {
            add(genre.id, genre.label, 0, true);
            if (this.expanded() === genre.label) {
                for (const group of categories.subgroupsOf(genre.label)) {
                    add(group.id, group.label, 1);
                }
            }
        }
        if (categories.regions().length > 1) {
            const region = categories.region();
            add(REGION_ITEM, `Region: ${region === REGION_ALL ? 'All' : region}`);
        }
        return items;
    });

    /**
     * Items on screen, keeping the selection in the second slot as Sky Q
     * does; long lists wrap around.
     */
    readonly visible = computed(() => {
        const items = this.items();
        if (items.length <= VISIBLE) {
            return items.map((item, i) => ({ item, index: i }));
        }
        return Array.from({ length: VISIBLE }, (_, slot) => {
            const index = (this.index() - 1 + slot + items.length) % items.length;
            return { item: items[index], index };
        });
    });

    constructor(private readonly tv: SlykTvService) {}

    /** Selects the item showing the guide's current bouquet. */
    syncToBouquet(): void {
        const bouquet = this.tv.bouquetId();
        if (bouquet.startsWith('group:') && !this.items().some((i) => i.id === bouquet)) {
            const genre = this.tv.categories
                .genres()
                .find((g) =>
                    this.tv.categories.subgroupsOf(g.label).some((s) => s.id === bouquet)
                );
            this.expanded.set(genre?.label ?? null);
        }
        this.index.set(Math.max(0, this.items().findIndex((i) => i.id === bouquet)));
    }

    move(delta: 1 | -1): void {
        const length = this.items().length;
        this.index.update((i) => (i + delta + length) % length);
        this.apply();
    }

    /** OK on an item: categories open or close their groups. */
    choose(index = this.index()): void {
        this.index.set(index);
        const item = this.items()[index];
        if (item?.id === REGION_ITEM) {
            this.tv.categories.stepRegion(1);
            return;
        }
        if (item?.expandable) {
            this.expanded.update((open) => (open === item.label ? null : item.label));
            this.index.set(this.items().findIndex((i) => i.id === item.id));
        }
        this.apply();
    }

    /** The grid follows the selected category. */
    private apply(): void {
        const item = this.items()[this.index()];
        if (item && item.id !== REGION_ITEM) {
            this.tv.setBouquet(item.id);
        }
    }
}
