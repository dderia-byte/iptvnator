import { computed, Injectable, inject, signal } from '@angular/core';
import { Store } from '@ngrx/store';
import { selectChannels } from '@iptvnator/m3u-state';
import { Channel } from '@iptvnator/shared/interfaces';
import {
    classifyChannel,
    cleanGroupLabel,
    regionOf,
    SLYK_GENRES,
    SlykGenre,
} from './slyk-genres';

export const GENRE_PREFIX = 'genre:';
export const REGION_ALL = 'ALL';
export const GROUP_PREFIX = 'group:';
const REGION_KEY = 'slyk-q-region';

function readRegion(): string | null {
    try {
        return localStorage.getItem(REGION_KEY);
    } catch {
        return null;
    }
}

function writeRegion(region: string): void {
    try {
        localStorage.setItem(REGION_KEY, region);
    } catch {
        // Not remembered without storage; the default region still applies.
    }
}

/**
 * Sky-style guide categories and the region they are limited to. Works on
 * the same live line-up as SlykTvService (radio excluded).
 */
@Injectable()
export class SlykCategoriesService {
    private readonly channels = inject(Store).selectSignal(selectChannels);
    private readonly tvChannels = computed(() =>
        this.channels().filter((channel) => channel.radio !== 'true')
    );

    /** Sky-style category of every TV channel, worked out once per list. */
    readonly genreOf = computed(() => {
        const genres = new Map<Channel, SlykGenre>();
        for (const channel of this.tvChannels()) {
            genres.set(channel, classifyChannel(channel));
        }
        return genres;
    });

    /** Country prefix of every channel's group (null: every region). */
    readonly regionOfChannel = computed(() => {
        const regions = new Map<Channel, string | null>();
        for (const channel of this.tvChannels()) {
            regions.set(channel, regionOf(channel));
        }
        return regions;
    });

    /** Countries in the line-up, largest first, with channel counts. */
    readonly regions = computed(() => {
        const counts = new Map<string, number>();
        for (const region of this.regionOfChannel().values()) {
            if (region) {
                counts.set(region, (counts.get(region) ?? 0) + 1);
            }
        }
        return [...counts.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([code, count]) => ({ code, count }));
    });

    /**
     * Region the guide categories are limited to, like a Sky box's own
     * country: remembered on this device, UK by default when present.
     */
    readonly regionChoice = signal<string | null>(readRegion());
    readonly region = computed<string>(() => {
        const codes = this.regions().map((r) => r.code);
        const chosen = this.regionChoice();
        if (chosen === REGION_ALL || (chosen && codes.includes(chosen))) {
            return chosen;
        }
        return codes.includes('UK') ? 'UK' : REGION_ALL;
    });

    stepRegion(delta: 1 | -1): void {
        const options = [REGION_ALL, ...this.regions().map((r) => r.code)];
        const index = options.indexOf(this.region());
        this.setRegion(options[(index + delta + options.length) % options.length]);
    }

    setRegion(region: string): void {
        this.regionChoice.set(region);
        writeRegion(region);
    }

    inRegion(channel: Channel): boolean {
        const region = this.region();
        if (region === REGION_ALL) {
            return true;
        }
        const own = this.regionOfChannel().get(channel);
        return own === null || own === undefined || own === region;
    }

    /** Channels shown for the chosen region (all when no region applies). */
    readonly regionCount = computed(() => {
        let count = 0;
        for (const channel of this.tvChannels()) {
            if (this.inRegion(channel)) {
                count += 1;
            }
        }
        return count;
    });

    /** Categories that have channels, in Sky's order, with their counts. */
    readonly genres = computed(() => {
        const counts = new Map<SlykGenre, number>();
        for (const [channel, genre] of this.genreOf()) {
            if (this.inRegion(channel)) {
                counts.set(genre, (counts.get(genre) ?? 0) + 1);
            }
        }
        return SLYK_GENRES.filter((genre) => counts.has(genre)).map(
            (genre) => ({
                id: GENRE_PREFIX + genre,
                label: genre,
                count: counts.get(genre) ?? 0,
            })
        );
    });

    /**
     * Second level under a category: the provider groups holding its
     * channels in the chosen region, largest first ("Sports" →
     * "SKY SPORTS", "TNT SPORTS", "FOOTBALL"…).
     */
    subgroupsOf(genre: string): { id: string; label: string; count: number }[] {
        const counts = new Map<string, number>();
        for (const [channel, channelGenre] of this.genreOf()) {
            const title = channel.group?.title?.trim();
            if (channelGenre === genre && title && this.inRegion(channel)) {
                counts.set(title, (counts.get(title) ?? 0) + 1);
            }
        }
        return [...counts.entries()]
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .map(([title, count]) => ({
                id: GROUP_PREFIX + title,
                label: cleanGroupLabel(title),
                count,
            }));
    }
}
