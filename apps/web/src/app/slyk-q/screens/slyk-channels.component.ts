import {
    ChangeDetectionStrategy,
    Component,
    computed,
    DestroyRef,
    effect,
    inject,
    linkedSignal,
    untracked,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Channel } from '@iptvnator/shared/interfaces';
import {
    SlykButtonsComponent,
    SlykPiconComponent,
    SlykTemplateComponent,
} from '../slyk-chrome.component';
import { SlykEpgService } from '../slyk-epg.service';
import {
    slykLength,
    slykResolutionBadge,
    slykStartedAt,
} from '../slyk-format';
import { pageIndex, SlykKeyPress, wrapIndex } from '../slyk-keys';
import { SlykNavService, SlykScreen } from '../slyk-nav.service';
import { SlykTvService } from '../slyk-tv.service';

/** ListTemplate: 518,385 1374×633 with serviceItemHeight 54. */
const ROWS = 11;
const ROW_HEIGHT = 54;

/** Slyk Q `ChannelSelection`: bouquet list with now/next/later details. */
@Component({
    selector: 'app-slyk-channels',
    imports: [SlykTemplateComponent, SlykButtonsComponent, SlykPiconComponent],
    templateUrl: './slyk-channels.component.html',
    styleUrl: './slyk-channels.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SlykChannelsComponent implements SlykScreen {
    private readonly router = inject(Router);
    readonly tv = inject(SlykTvService);
    readonly epg = inject(SlykEpgService);
    readonly rowHeight = ROW_HEIGHT;

    readonly channels = this.tv.bouquetChannels;

    /** Opens on the playing service when the bouquet contains it. */
    readonly index = linkedSignal(() => {
        const active = this.tv.activeChannel();
        const list = this.channels();
        const found = active
            ? list.findIndex((c) => c.id === active.id && c.url === active.url)
            : -1;
        return Math.max(0, found);
    });

    readonly pageStart = computed(
        () => Math.floor(this.index() / ROWS) * ROWS
    );
    readonly visible = computed(() =>
        this.channels().slice(this.pageStart(), this.pageStart() + ROWS)
    );
    readonly selected = computed<Channel | null>(
        () => this.channels()[this.index()] ?? null
    );
    readonly info = computed(() => this.epg.nowNext(this.selected()));
    readonly selectedName = computed(() =>
        this.tv.displayName(this.selected())
    );
    readonly badge = computed(() => slykResolutionBadge(this.selectedName()));
    readonly length = computed(() => slykLength(this.info().now));
    readonly startedAt = computed(() =>
        slykStartedAt(this.info().now, this.epg.now())
    );
    readonly nextStart = computed(() =>
        slykStartedAt(this.info().next, this.epg.now())
    );
    readonly laterStart = computed(() =>
        slykStartedAt(this.info().later, this.epg.now())
    );
    readonly favouriteLabel = computed(() => {
        const channel = this.selected();
        return channel && this.tv.isFavourite(channel)
            ? 'Remove favourite'
            : 'Add favourite';
    });
    readonly buttons = computed(() => [
        this.tv.favouritesSupported() ? this.favouriteLabel() : '',
        'TV Guide',
        'Previous',
        'Next',
    ]);

    constructor() {
        inject(SlykNavService).register(this, inject(DestroyRef), 'pig');
        // A source just added from the Slyk screens arrives as ?open=<id>.
        const route = inject(ActivatedRoute);
        const opened = route.snapshot.queryParamMap.get('open');
        if (opened) {
            const playlistId = opened;
            const stop = effect(() => {
                if (this.tv.playlists().some((p) => p._id === playlistId)) {
                    untracked(() => {
                        if (this.tv.openPlaylistById(playlistId) === 'slyk') {
                            // Drop ?open= but stay here: without relativeTo an
                            // empty command list would navigate to the root.
                            void this.router.navigate([], {
                                relativeTo: route,
                                queryParams: {},
                                replaceUrl: true,
                            });
                        }
                    });
                    stop.destroy();
                }
            });
        }
        effect(() => void this.epg.load(this.visible()));
    }

    isPlaying(channel: Channel): boolean {
        const active = this.tv.activeChannel();
        return !!active && active.id === channel.id && active.url === channel.url;
    }

    nowTitle(channel: Channel): string {
        return this.epg.nowNext(channel).now?.title ?? '';
    }

    progress(channel: Channel): number {
        return this.epg.progress(this.epg.nowNext(channel).now) * 100;
    }

    /** Click = OK on that service (hover already moved the highlight). */
    select(rowIndex: number): void {
        this.index.set(this.pageStart() + rowIndex);
        this.zap();
    }

    onKey({ key }: SlykKeyPress): boolean {
        const length = this.channels().length;
        switch (key) {
            case 'up':
            case 'down':
                this.index.update((i) =>
                    wrapIndex(i, key === 'up' ? -1 : 1, length)
                );
                return true;
            case 'left':
            case 'right':
                this.index.update((i) =>
                    pageIndex(i, key === 'left' ? -1 : 1, ROWS, length)
                );
                return true;
            case 'channelUp':
            case 'blue':
                this.tv.stepBouquet(1);
                return true;
            case 'channelDown':
            case 'yellow':
                this.tv.stepBouquet(-1);
                return true;
            case 'red': {
                const channel = this.selected();
                if (channel) {
                    this.tv.toggleFavourite(channel);
                }
                return true;
            }
            case 'green':
            case 'epg':
                void this.router.navigateByUrl('/tv/guide');
                return true;
            case 'ok':
                this.zap();
                return true;
            default:
                return false;
        }
    }

    private zap(): void {
        const channel = this.selected();
        if (channel) {
            this.tv.play(channel);
            void this.router.navigateByUrl('/tv/watch');
        }
    }
}
