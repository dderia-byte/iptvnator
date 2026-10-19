import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { EpgRuntimeBridgeService } from '@iptvnator/epg/data-access';
import { resolveChannelEpgLookupKey } from '@iptvnator/m3u-state';
import { SettingsStore } from '@iptvnator/services';
import { Channel, EpgProgram } from '@iptvnator/shared/interfaces';
import {
    XtreamApiService,
    XtreamCredentials,
} from '@iptvnator/portal/xtream/data-access';
import { EpgItem } from '@iptvnator/shared/interfaces';
import { getProgramTimeMs } from '@iptvnator/ui/epg';
import { XtreamEpgIndex } from './slyk-xtream-epg';

/** A programme with display-clock instants (EPG offset applied). */
export interface SlykEvent {
    title: string;
    description: string;
    startMs: number;
    stopMs: number;
    program: EpgProgram;
}

export interface SlykNowNext {
    now: SlykEvent | null;
    next: SlykEvent | null;
    later: SlykEvent | null;
}

const EMPTY: SlykNowNext = { now: null, next: null, later: null };
const HOUR = 3_600_000;
/** Programmes are fetched in this window around "now" and cached per key. */
const WINDOW_BEFORE = 6 * HOUR;
const WINDOW_AFTER = 30 * HOUR;
const BATCH = 60;
/** Xtream listings are fetched per channel, a few at a time. */
const XTREAM_PARALLEL = 4;
const XTREAM_LISTINGS = 24;

/**
 * Programme data for the Slyk screens. M3U playlists read the same XMLTV
 * bridge the classic EPG guide uses (Electron only). Xtream accounts read
 * the panel's per-channel listings (get_short_epg), which also work in the
 * PWA and on Fire TV, and don't depend on the panel's often broken XMLTV.
 * Channels without data render as Enigma2's "No event information".
 */
@Injectable()
export class SlykEpgService {
    private readonly bridge = inject(EpgRuntimeBridgeService);
    private readonly settingsStore = inject(SettingsStore);
    private readonly xtreamApi = inject(XtreamApiService);
    private xtream: {
        credentials: XtreamCredentials;
        index: XtreamEpgIndex;
    } | null = null;

    /** Display clock, ticking every 15s for progress bars and "now" markers. */
    readonly now = signal(Date.now());
    /** Bumped whenever the cache gains programmes, so screens recompute. */
    readonly revision = signal(0);

    private readonly cache = new Map<string, SlykEvent[]>();
    private readonly pending = new Set<string>();

    constructor() {
        const timer = setInterval(() => this.now.set(Date.now()), 15_000);
        inject(DestroyRef).onDestroy(() => clearInterval(timer));
    }

    get supported(): boolean {
        return !!this.xtream || this.bridge.supportsGuide;
    }

    /** The Xtream account in use (null for M3U playlists). */
    get xtreamCredentials(): XtreamCredentials | null {
        return this.xtream?.credentials ?? null;
    }

    /** Switches to an Xtream panel's own listings (null: XMLTV bridge). */
    useXtream(
        credentials: XtreamCredentials | null,
        channels: readonly Channel[] = []
    ): void {
        this.xtream = credentials
            ? { credentials, index: new XtreamEpgIndex(channels) }
            : null;
        this.cache.clear();
        this.revision.update((r) => r + 1);
    }

    keyOf(channel: Channel | null | undefined): string | null {
        if (this.xtream) {
            return this.xtream.index.epgId(channel ?? null);
        }
        return resolveChannelEpgLookupKey(channel) || null;
    }

    private get offsetMinutes(): number {
        return this.settingsStore.resolvedEpgOffsetMinutes?.() ?? 0;
    }

    /** Ensures programmes are cached for the given channels. */
    async load(channels: readonly Channel[]): Promise<void> {
        if (!this.supported) {
            return;
        }
        const keys = Array.from(
            new Set(
                channels
                    .map((c) => this.keyOf(c))
                    .filter((k): k is string => !!k)
                    .filter((k) => !this.cache.has(k) && !this.pending.has(k))
            )
        );
        if (keys.length === 0) {
            return;
        }
        keys.forEach((k) => this.pending.add(k));
        if (this.xtream) {
            await this.loadXtream(keys, this.xtream);
            return;
        }
        const providerNow = Date.now() - this.offsetMinutes * 60_000;
        try {
            for (let i = 0; i < keys.length; i += BATCH) {
                const chunk = keys.slice(i, i + BATCH);
                const response = await this.bridge.getProgramsForChannels({
                    channelIds: chunk,
                    fromMs: providerNow - WINDOW_BEFORE,
                    toMs: providerNow + WINDOW_AFTER,
                });
                for (const key of chunk) {
                    this.cache.set(key, this.toEvents(response?.[key] ?? []));
                }
                this.revision.update((r) => r + 1);
            }
        } finally {
            keys.forEach((k) => this.pending.delete(k));
        }
    }

    private async loadXtream(
        keys: string[],
        source: NonNullable<SlykEpgService['xtream']>
    ): Promise<void> {
        const queue = [...keys];
        const worker = async () => {
            for (let key = queue.shift(); key; key = queue.shift()) {
                const streamId = source.index.streamId(key);
                const items =
                    streamId === null
                        ? []
                        : await this.xtreamApi
                              .getShortEpg(source.credentials, streamId, XTREAM_LISTINGS)
                              .catch(() => [] as EpgItem[]);
                this.pending.delete(key);
                // A source switch mid-load discards the old panel's listings.
                if (this.xtream === source) {
                    this.cache.set(key, this.toEvents(items.map(toProgram)));
                    this.revision.update((r) => r + 1);
                }
            }
        };
        await Promise.all(Array.from({ length: XTREAM_PARALLEL }, worker));
    }

    events(channel: Channel | null | undefined): SlykEvent[] {
        this.revision();
        const key = this.keyOf(channel);
        return key ? (this.cache.get(key) ?? []) : [];
    }

    nowNext(channel: Channel | null | undefined): SlykNowNext {
        const now = this.now();
        const events = this.events(channel);
        const index = events.findIndex(
            (e) => e.startMs <= now && e.stopMs > now
        );
        if (index < 0) {
            const upcoming = events.filter((e) => e.startMs > now);
            return upcoming.length
                ? { now: null, next: upcoming[0], later: upcoming[1] ?? null }
                : EMPTY;
        }
        return {
            now: events[index],
            next: events[index + 1] ?? null,
            later: events[index + 2] ?? null,
        };
    }

    /** Programmes overlapping [fromMs, toMs) on the display clock. */
    between(
        channel: Channel | null | undefined,
        fromMs: number,
        toMs: number
    ): SlykEvent[] {
        return this.events(channel).filter(
            (e) => e.stopMs > fromMs && e.startMs < toMs
        );
    }

    progress(event: SlykEvent | null): number {
        if (!event) {
            return 0;
        }
        const span = event.stopMs - event.startMs;
        const done = this.now() - event.startMs;
        return span > 0 ? Math.min(1, Math.max(0, done / span)) : 0;
    }

    private toEvents(programs: EpgProgram[]): SlykEvent[] {
        const offset = this.offsetMinutes;
        return programs
            .map((program) => ({
                title: program.title?.trim() || '',
                description: program.desc?.trim() || '',
                startMs: getProgramTimeMs(
                    program.start,
                    program.startTimestamp,
                    offset
                ),
                stopMs: getProgramTimeMs(
                    program.stop,
                    program.stopTimestamp,
                    offset
                ),
                program,
            }))
            .filter((e) => Number.isFinite(e.startMs) && e.stopMs > e.startMs)
            .sort((a, b) => a.startMs - b.startMs);
    }
}

function toProgram(item: EpgItem): EpgProgram {
    const seconds = (value: string) => Number(value) || null;
    return {
        start: item.start,
        stop: item.stop ?? item.end,
        channel: item.channel_id,
        title: item.title,
        desc: item.description || null,
        category: null,
        startTimestamp: seconds(item.start_timestamp),
        stopTimestamp: seconds(item.stop_timestamp),
    };
}
