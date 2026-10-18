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
import {
    SlykPiconComponent,
    SlykTemplateComponent,
} from '../slyk-chrome.component';
import { SlykEpgService } from '../slyk-epg.service';
import { SlykKeyPress, wrapIndex } from '../slyk-keys';
import { SlykNavService, SlykScreen } from '../slyk-nav.service';
import { BOUQUET_FAVOURITES, SlykTvService } from '../slyk-tv.service';

interface MenuItem {
    label: string;
    action: () => void;
}

const TILE_COLUMNS = 5;
const TILE_COUNT = 10;

/** Slyk Q `menu_mainmenu` (menu-1panel): main menu plus the top-picks wall. */
@Component({
    selector: 'app-slyk-home',
    imports: [SlykTemplateComponent, SlykPiconComponent],
    templateUrl: './slyk-home.component.html',
    styleUrl: './slyk-home.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SlykHomeComponent implements SlykScreen {
    private readonly router = inject(Router);
    readonly tv = inject(SlykTvService);
    readonly epg = inject(SlykEpgService);

    readonly items: MenuItem[] = [
        { label: 'TV Guide', action: () => this.go('/tv/guide') },
        { label: 'Channels', action: () => this.go('/tv/channels') },
        { label: 'Favourites', action: () => this.openFavourites() },
        { label: 'Playlists', action: () => this.go('/tv/playlists') },
        { label: 'Setup', action: () => this.go('/tv/settings') },
        { label: 'Classic View', action: () => this.go('/workspace') },
    ];

    readonly area = signal<'menu' | 'tiles'>('menu');
    readonly menuIndex = signal(0);
    readonly tileIndex = signal(0);

    /** Favourites first, then the playlist's opening channels. */
    readonly picks = computed<Channel[]>(() => {
        const favourites = this.tv
            .tvChannels()
            .filter((c) => this.tv.isFavourite(c));
        const rest = this.tv.tvChannels().filter((c) => !favourites.includes(c));
        return [...favourites, ...rest].slice(0, TILE_COUNT);
    });

    readonly picksTitle = computed(() =>
        this.tv.tvChannels().some((c) => this.tv.isFavourite(c))
            ? 'Your Top Picks'
            : "Today's Top Picks"
    );

    constructor() {
        inject(SlykNavService).register(this, inject(DestroyRef), 'pig');
        effect(() => void this.epg.load(this.picks()));
    }

    tileLeft(index: number): number {
        return 537 + (index % TILE_COLUMNS) * 264;
    }

    tileTop(index: number): number {
        return 381 + Math.floor(index / TILE_COLUMNS) * 344;
    }

    nowTitle(channel: Channel): string {
        return this.epg.nowNext(channel).now?.title ?? '';
    }

    onKey({ key }: SlykKeyPress): boolean {
        return this.area() === 'menu' ? this.onMenuKey(key) : this.onTileKey(key);
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
                if (this.picks().length) {
                    this.area.set('tiles');
                }
                return true;
            case 'ok':
                this.items[this.menuIndex()].action();
                return true;
            default:
                return false;
        }
    }

    private onTileKey(key: string): boolean {
        const count = this.picks().length;
        const index = this.tileIndex();
        switch (key) {
            case 'left':
                if (index % TILE_COLUMNS === 0) {
                    this.area.set('menu');
                } else {
                    this.tileIndex.set(index - 1);
                }
                return true;
            case 'right':
                this.tileIndex.set(Math.min(count - 1, index + 1));
                return true;
            case 'up':
            case 'down': {
                const next = index + (key === 'up' ? -1 : 1) * TILE_COLUMNS;
                if (next >= 0 && next < count) {
                    this.tileIndex.set(next);
                }
                return true;
            }
            case 'ok':
                this.tv.play(this.picks()[index]);
                this.go('/tv/watch');
                return true;
            case 'back':
                this.area.set('menu');
                return true;
            default:
                return false;
        }
    }

    private openFavourites(): void {
        this.tv.setBouquet(BOUQUET_FAVOURITES);
        this.go('/tv/channels');
    }

    private go(path: string): void {
        void this.router.navigateByUrl(path);
    }
}
