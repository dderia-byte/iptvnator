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
    XtreamApiService,
    XtreamUrlService,
} from '@iptvnator/portal/xtream/data-access';
import { Channel } from '@iptvnator/shared/interfaces';
import { SlykButtonsComponent, SlykTemplateComponent } from '../slyk-chrome.component';
import { SlykEpgService } from '../slyk-epg.service';
import { cleanGroupLabel } from '../slyk-genres';
import { slykDay, slykLength, slykTime } from '../slyk-format';
import { SlykKeyPress } from '../slyk-keys';
import { SlykLogoComponent } from '../slyk-logo.component';
import { SlykNavService, SlykScreen } from '../slyk-nav.service';
import { SlykTvService } from '../slyk-tv.service';
import { xtreamStreamId } from '../slyk-xtream-epg';

export interface SlykPastProgramme {
    title: string;
    description: string;
    startMs: number;
    stopMs: number;
}

const DAY = 86_400_000;
const COLUMNS = 3;
const FEATURED = 30;
const COLUMN_VISIBLE = 7;
export const CATCHUP_ROW_STEP = 320;

/**
 * Sky Q Catch up TV: channel groups with recordings in the left column,
 * channels as 16:9 tiles, and once a channel is picked its past
 * programmes, which play from the provider's archive.
 */
@Component({
    selector: 'app-slyk-catchup',
    imports: [SlykTemplateComponent, SlykButtonsComponent, SlykLogoComponent],
    templateUrl: './slyk-catchup.component.html',
    styleUrl: './slyk-catchup.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SlykCatchupComponent implements SlykScreen {
    private readonly router = inject(Router);
    private readonly api = inject(XtreamApiService);
    private readonly urls = inject(XtreamUrlService);
    readonly tv = inject(SlykTvService);
    readonly epg = inject(SlykEpgService);
    readonly nav = inject(SlykNavService);
    readonly rowStep = CATCHUP_ROW_STEP;
    readonly columns = COLUMNS;

    readonly area = signal<'column' | 'grid'>('grid');
    readonly columnIndex = signal(0);
    readonly index = signal(0);
    /** The channel whose past programmes are shown (null: channel tiles). */
    readonly channel = signal<Channel | null>(null);
    readonly programmes = signal<SlykPastProgramme[]>([]);
    readonly loading = signal(false);

    private readonly archive = computed(() =>
        this.tv.tvChannels().filter((c) => !!c.catchup && this.tv.categories.inRegion(c))
    );
    readonly columnItems = computed(() => {
        const groups = new Set(this.archive().map((c) => c.group?.title?.trim() ?? ''));
        return [
            { id: '', label: 'Featured' },
            ...[...groups].filter(Boolean).map((g) => ({ id: g, label: cleanGroupLabel(g) })),
        ];
    });
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
    readonly channels = computed(() => {
        const id = this.columnItems()[this.columnIndex()]?.id ?? '';
        const archive = this.archive();
        if (id) {
            return archive.filter((c) => c.group?.title?.trim() === id);
        }
        const favourites = archive.filter((c) => this.tv.isFavourite(c));
        return [...favourites, ...archive.filter((c) => !favourites.includes(c))].slice(0, FEATURED);
    });
    readonly count = computed(() =>
        this.channel() ? this.programmes().length : this.channels().length
    );
    readonly offset = computed(() => Math.floor(this.index() / COLUMNS) * CATCHUP_ROW_STEP);

    readonly hero = computed(() => {
        const channel = this.channel();
        if (channel) {
            const p = this.programmes()[this.index()];
            return {
                title: p?.title ?? (this.loading() ? 'Loading…' : 'No past programmes'),
                meta: p ? this.when(p) : '',
                text: p?.description ?? '',
                chip: this.tv.displayName(channel),
            };
        }
        const focused = this.channels()[this.index()];
        const days = focused?.catchup?.days;
        return {
            title: this.tv.displayName(focused),
            meta: days ? `Catch up on the last ${days} days` : '',
            text: focused ? 'Press OK to see programmes you can watch again.' : '',
            chip: '',
        };
    });

    constructor() {
        this.nav.register(this, inject(DestroyRef), 'pig');
    }

    rowOf(i: number): number {
        return Math.floor(i / COLUMNS);
    }

    when(p: SlykPastProgramme): string {
        const length = slykLength(p as Parameters<typeof slykLength>[0]);
        return `${slykDay(p.startMs, this.epg.now())}, ${slykTime(p.startMs)} · ${length}`;
    }

    hover(i: number): void {
        if (this.nav.pointerActive() && Math.floor(i / COLUMNS) === Math.floor(this.index() / COLUMNS)) {
            this.index.set(i);
        }
    }

    chooseColumn(i: number): void {
        this.columnIndex.set(i);
        this.channel.set(null);
        this.index.set(0);
    }

    async open(i = this.index()): Promise<void> {
        this.index.set(i);
        const channel = this.channel();
        if (channel) {
            await this.play(channel, this.programmes()[i]);
            return;
        }
        const picked = this.channels()[i];
        const creds = this.epg.xtreamCredentials;
        const streamId = picked ? xtreamStreamId(picked) : null;
        if (!picked || !creds || streamId === null) {
            return;
        }
        this.channel.set(picked);
        this.index.set(0);
        this.programmes.set([]);
        this.loading.set(true);
        const days = Number(picked.catchup?.days) || 7;
        const now = Date.now();
        const items = await this.api.getFullEpg(creds, streamId).catch(() => []);
        if (this.channel() !== picked) {
            return;
        }
        this.programmes.set(
            items
                .map((item) => ({
                    title: item.title,
                    description: item.description,
                    startMs: Number(item.start_timestamp) * 1000 || Date.parse(item.start),
                    stopMs: Number(item.stop_timestamp) * 1000 || Date.parse(item.stop ?? item.end),
                }))
                .filter((p) => p.stopMs <= now && p.startMs >= now - days * DAY)
                .sort((a, b) => b.startMs - a.startMs)
        );
        this.loading.set(false);
    }

    onKey({ key }: SlykKeyPress): boolean {
        if (this.area() === 'column') {
            const length = this.columnItems().length;
            switch (key) {
                case 'up':
                case 'down':
                    this.chooseColumn((this.columnIndex() + (key === 'up' ? -1 : 1) + length) % length);
                    return true;
                case 'right':
                case 'ok':
                    this.area.set('grid');
                    return true;
                default:
                    return false;
            }
        }
        const i = this.index();
        const count = this.count();
        switch (key) {
            case 'left':
                if (i % COLUMNS === 0) {
                    this.area.set('column');
                } else {
                    this.index.set(i - 1);
                }
                return true;
            case 'right':
                this.index.set(Math.min(count - 1, i + 1));
                return true;
            case 'up':
            case 'down': {
                const next = i + (key === 'up' ? -COLUMNS : COLUMNS);
                if (next >= 0 && next < count) {
                    this.index.set(next);
                }
                return true;
            }
            case 'ok':
                void this.open();
                return true;
            case 'back':
                if (this.channel()) {
                    const back = this.channels().indexOf(this.channel() as Channel);
                    this.channel.set(null);
                    this.index.set(Math.max(0, back));
                    return true;
                }
                return false;
            default:
                return false;
        }
    }

    private async play(channel: Channel, programme?: SlykPastProgramme): Promise<void> {
        const creds = this.epg.xtreamCredentials;
        const streamId = xtreamStreamId(channel);
        if (!programme || !creds || streamId === null) {
            return;
        }
        const start = Math.floor(programme.startMs / 1000);
        const stop = Math.floor(programme.stopMs / 1000);
        const playlistId = this.tv.activePlaylist()?._id ?? '';
        const url = await this.urls
            .resolveCatchupUrl(playlistId, creds, streamId, start, stop, creds.serverTimezone)
            .catch(() => this.urls.constructCatchupUrl(creds, streamId, start, stop, 'rest'));
        const name = `${this.tv.displayName(channel)}: ${programme.title}`;
        this.tv.play({ ...channel, id: `${channel.id}-catchup-${start}`, url, name });
        void this.router.navigateByUrl('/tv/watch');
    }
}
