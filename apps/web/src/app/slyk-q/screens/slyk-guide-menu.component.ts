import {
    ChangeDetectionStrategy,
    Component,
    computed,
    DestroyRef,
    inject,
    signal,
} from '@angular/core';
import { Router } from '@angular/router';
import {
    SlykButtonsComponent,
    SlykTemplateComponent,
} from '../slyk-chrome.component';
import { pageIndex, SlykKeyPress, wrapIndex } from '../slyk-keys';
import { SlykNavService, SlykScreen } from '../slyk-nav.service';
import { GENRE_PREFIX, REGION_ALL } from '../slyk-categories.service';
import { BOUQUET_FAVOURITES, SlykTvService } from '../slyk-tv.service';

const ROWS = 8;
const GROUPS_ROW = 'groups';

interface GuideMenuRow {
    id: string;
    label: string;
    count: number | null;
}

/**
 * The TV Guide's first page, as on a Sky box: pick a category (All
 * Channels, Entertainment, Movies, Sports…) and the grid opens on it.
 * "Channel Groups" lists the provider's own groups for anything finer.
 */
@Component({
    selector: 'app-slyk-guide-menu',
    imports: [SlykTemplateComponent, SlykButtonsComponent],
    templateUrl: './slyk-guide-menu.component.html',
    styleUrl: './slyk-guide-menu.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SlykGuideMenuComponent implements SlykScreen {
    private readonly router = inject(Router);
    readonly tv = inject(SlykTvService);

    readonly mode = signal<'categories' | 'sub' | 'groups'>('categories');
    /** Category whose sub-categories are listed (mode 'sub'). */
    readonly genre = signal('');
    readonly index = signal(0);

    private readonly categoryRows = computed<GuideMenuRow[]>(() => {
        const favourites = this.tv
            .tvChannels()
            .filter((c) => this.tv.isFavourite(c)).length;
        return [
            {
                id: GENRE_PREFIX + REGION_ALL,
                label: 'All Channels',
                count: this.tv.categories.regionCount(),
            },
            ...(favourites
                ? [{ id: BOUQUET_FAVOURITES, label: 'Favourites', count: favourites }]
                : []),
            ...this.tv.categories.genres(),
            { id: GROUPS_ROW, label: 'Channel Groups', count: null },
        ];
    });

    private readonly groupRows = computed<GuideMenuRow[]>(() =>
        this.tv
            .bouquets()
            .filter((b) => b.id.startsWith('group:'))
            .map((b) => ({ id: b.id, label: b.label, count: null }))
    );

    /** "All Sports", then the provider groups holding Sports channels. */
    private readonly subRows = computed<GuideMenuRow[]>(() => {
        const genre = this.genre();
        const all = this.tv.categories.genres().find((g) => g.label === genre);
        return [
            {
                id: GENRE_PREFIX + genre,
                label: `All ${genre}`,
                count: all?.count ?? 0,
            },
            ...this.tv.categories.subgroupsOf(genre),
        ];
    });

    readonly rows = computed(() => {
        switch (this.mode()) {
            case 'categories':
                return this.categoryRows();
            case 'sub':
                return this.subRows();
            default:
                return this.groupRows();
        }
    });
    readonly pageStart = computed(() => Math.floor(this.index() / ROWS) * ROWS);
    readonly page = computed(() => this.pageStart() / ROWS + 1);
    readonly pageCount = computed(() =>
        Math.max(1, Math.ceil(this.rows().length / ROWS))
    );
    readonly visible = computed(() =>
        this.rows().slice(this.pageStart(), this.pageStart() + ROWS)
    );
    readonly title = computed(() => {
        switch (this.mode()) {
            case 'categories':
                return 'TV Guide';
            case 'sub':
                return this.genre();
            default:
                return 'Channel Groups';
        }
    });
    readonly description = computed(() => {
        const row = this.rows()[this.index()];
        if (!row) {
            return this.tv.channelsLoading()
                ? 'Loading channels…'
                : 'No channels yet. Add a playlist under Playlists in the main menu.';
        }
        if (row.id === GROUPS_ROW) {
            return "Browse your provider's own channel groups.";
        }
        if (this.mode() === 'categories' && this.hasSubRows(row)) {
            return `${row.label}: ${row.count?.toLocaleString()} channels. Press OK to see ${row.label} by group.`;
        }
        return row.count !== null
            ? `${row.label}: ${row.count.toLocaleString()} channels. Press OK to open the guide.`
            : `${row.label}. Press OK to open the guide.`;
    });
    /** "UK (12,345 channels)" — the region the categories are limited to. */
    readonly regionLabel = computed(() => {
        const categories = this.tv.categories;
        const region = categories.region();
        if (region === REGION_ALL) {
            return 'All regions';
        }
        const count = categories.regions().find((r) => r.code === region)?.count ?? 0;
        return `${region} (${count.toLocaleString()} channels)`;
    });
    readonly hasRegions = computed(() => this.tv.categories.regions().length > 1);

    readonly buttons = computed(() =>
        this.mode() === 'categories'
            ? [this.hasRegions() ? 'Change region' : '', '', 'Previous page', 'Next page']
            : ['Categories', '', 'Previous page', 'Next page']
    );

    private hasSubRows(row: GuideMenuRow): boolean {
        return (
            row.id.startsWith(GENRE_PREFIX) &&
            row.id !== GENRE_PREFIX + REGION_ALL
        );
    }

    private backToCategories(): void {
        const from = this.mode() === 'sub' ? GENRE_PREFIX + this.genre() : GROUPS_ROW;
        this.mode.set('categories');
        this.index.set(
            Math.max(0, this.categoryRows().findIndex((row) => row.id === from))
        );
    }

    constructor() {
        inject(SlykNavService).register(this, inject(DestroyRef), 'pig');
        // Open on the category currently shown in the guide, or on its
        // sub-category list when the guide shows one provider group.
        const bouquet = this.tv.bouquetId();
        const current = this.categoryRows().findIndex((row) => row.id === bouquet);
        if (current < 0 && bouquet.startsWith('group:')) {
            const genre = this.tv.categories.genres().find((g) =>
                this.tv.categories.subgroupsOf(g.label).some((s) => s.id === bouquet)
            );
            if (genre) {
                this.genre.set(genre.label);
                this.mode.set('sub');
                this.index.set(this.subRows().findIndex((row) => row.id === bouquet));
                return;
            }
        }
        this.index.set(Math.max(0, current));
    }

    isGenre(row: GuideMenuRow): boolean {
        return row.id.startsWith(GENRE_PREFIX);
    }

    choose(absoluteIndex: number): void {
        const row = this.rows()[absoluteIndex];
        if (!row) {
            return;
        }
        if (row.id === GROUPS_ROW) {
            this.mode.set('groups');
            this.index.set(0);
            return;
        }
        if (this.mode() === 'categories' && this.hasSubRows(row)) {
            this.genre.set(row.label);
            this.mode.set('sub');
            this.index.set(0);
            return;
        }
        this.tv.setBouquet(row.id);
        void this.router.navigateByUrl('/tv/guide');
    }

    onKey({ key }: SlykKeyPress): boolean {
        const length = this.rows().length;
        switch (key) {
            case 'up':
            case 'down':
                this.index.update((i) => wrapIndex(i, key === 'up' ? -1 : 1, length));
                return true;
            case 'left':
            case 'right':
                // Categories: left/right change region, as on the region bar.
                if (this.mode() === 'categories') {
                    this.tv.categories.stepRegion(key === 'left' ? -1 : 1);
                    return true;
                }
                this.index.update((i) => pageIndex(i, key === 'left' ? -1 : 1, ROWS, length));
                return true;
            case 'channelUp':
            case 'yellow':
                this.index.update((i) => pageIndex(i, -1, ROWS, length));
                return true;
            case 'channelDown':
            case 'blue':
                this.index.update((i) => pageIndex(i, 1, ROWS, length));
                return true;
            case 'ok':
                this.choose(this.index());
                return true;
            case 'red':
                if (this.mode() === 'categories') {
                    this.tv.categories.stepRegion(1);
                    return true;
                }
                this.backToCategories();
                return true;
            case 'back':
                if (this.mode() !== 'categories') {
                    this.backToCategories();
                    return true;
                }
                return false;
            case 'epg':
                return true;
            default:
                return false;
        }
    }
}
