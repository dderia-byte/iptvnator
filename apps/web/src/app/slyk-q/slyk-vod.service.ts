import { inject, Injectable } from '@angular/core';
import {
    XtreamApiService,
    XtreamCredentials,
    XtreamUrlService,
} from '@iptvnator/portal/xtream/data-access';
import {
    Channel,
    getXtreamVodInfo,
    XtreamSerieEpisode,
    XtreamSerieItem,
    XtreamVodDetails,
    XtreamVodStream,
} from '@iptvnator/shared/interfaces';
import { SlykEpgService } from './slyk-epg.service';
import { cleanChannelName } from './slyk-format';

export type SlykVodKind = 'vod' | 'series';

export interface SlykVodCategory {
    id: string;
    label: string;
}

/** A film or box set as the Movies and Box sets pages show it. */
export interface SlykVodItem {
    kind: SlykVodKind;
    id: number;
    title: string;
    poster: string;
    year: string;
    rating: string;
    extension: string;
    plot: string;
}

export interface SlykVodDetails {
    plot: string;
    /** "1h 55m" */
    length: string;
    genre: string;
    art: string;
}

export interface SlykEpisode {
    id: string;
    title: string;
    number: number;
    season: number;
    plot: string;
    extension: string;
}

const YEAR = /\((\d{4})\)\s*$/;

/** "4K-TOP - Practical Magic 2 (2026)" → title "Practical Magic 2", year 2026. */
export function splitVodName(name: string): { title: string; year: string } {
    // Trailing country tags such as "(GB)" come after the year.
    const clean = cleanChannelName(name).replace(/(\s*\([A-Z]{2,3}\))+$/, '');
    const year = YEAR.exec(clean)?.[1] ?? '';
    const title = clean
        .replace(YEAR, '')
        // Provider prefixes: "4K-TOP - ", "4K-NF - ", "EN - ", "NF: "
        .replace(/^[A-Z0-9][A-Z0-9+&._-]{0,14}\s*[-|:]\s/, '')
        .trim();
    return { title: title || clean, year };
}

function minutesLabel(seconds: number): string {
    const minutes = Math.round(seconds / 60);
    if (!minutes) {
        return '';
    }
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m`;
}

/**
 * Films (Xtream VOD) and box sets (Xtream series) for the Sky-style Movies
 * and Box sets pages. Panels often refuse the whole catalogue at once, so
 * everything loads per category and is cached for the session.
 */
@Injectable()
export class SlykVodService {
    private readonly api = inject(XtreamApiService);
    private readonly urls = inject(XtreamUrlService);
    private readonly epg = inject(SlykEpgService);
    private readonly cache = new Map<string, Promise<unknown>>();

    get available(): boolean {
        return !!this.epg.xtreamCredentials;
    }

    categories(kind: SlykVodKind): Promise<SlykVodCategory[]> {
        return this.cached(`cats:${kind}`, async (creds) =>
            (await this.api.getCategories(creds, kind)).map((c) => ({
                id: String(c.category_id),
                label: cleanChannelName(c.category_name ?? ''),
            }))
        );
    }

    items(kind: SlykVodKind, categoryId: string): Promise<SlykVodItem[]> {
        return this.cached(`items:${kind}:${categoryId}`, async (creds) => {
            if (kind === 'vod') {
                const streams = await this.api.getVodStreams(creds, { categoryId });
                return streams.map((s) => this.fromVod(s));
            }
            const series = await this.api.getSeriesStreams(creds, { categoryId });
            return series.map((s) => this.fromSeries(s));
        });
    }

    details(item: SlykVodItem): Promise<SlykVodDetails> {
        return this.cached(`details:${item.kind}:${item.id}`, async (creds) => {
            if (item.kind === 'vod') {
                const info = getXtreamVodInfo(await this.api.getVodInfo(creds, item.id));
                return {
                    plot: info?.plot || info?.description || item.plot,
                    length: minutesLabel(Number(info?.duration_secs) || 0),
                    genre: info?.genre ?? '',
                    art: info?.backdrop_path?.[0] || info?.cover_big || item.poster,
                };
            }
            const details = await this.api.getSeriesInfo(creds, item.id);
            return {
                plot: details?.info?.plot || item.plot,
                length: '',
                genre: details?.info?.genre ?? '',
                art: item.poster,
            };
        });
    }

    episodes(item: SlykVodItem): Promise<SlykEpisode[]> {
        return this.cached(`episodes:${item.id}`, async (creds) => {
            const details = await this.api.getSeriesInfo(creds, item.id);
            const all = ([] as XtreamSerieEpisode[]).concat(...Object.values(details?.episodes ?? {}));
            return all
                .map((e) => ({
                    id: e.id,
                    title: cleanChannelName(e.title ?? ''),
                    number: Number(e.episode_num) || 0,
                    season: Number(e.season) || 1,
                    plot: Array.isArray(e.info) ? '' : (e.info?.plot ?? ''),
                    extension: e.container_extension || 'mp4',
                }))
                .sort((a, b) => a.season - b.season || a.number - b.number);
        });
    }

    /** A playable entry for the player, shaped like a channel. */
    playable(item: SlykVodItem, episode?: SlykEpisode): Channel | null {
        const creds = this.epg.xtreamCredentials;
        if (!creds) {
            return null;
        }
        const url = episode
            ? this.urls.constructEpisodeUrl(creds, {
                  id: episode.id,
                  container_extension: episode.extension,
              } as XtreamSerieEpisode)
            : this.urls.constructVodUrl(creds, {
                  movie_data: { stream_id: item.id, container_extension: item.extension },
              } as XtreamVodDetails);
        const name = episode
            ? `${item.title} S${episode.season} E${episode.number}`
            : item.title;
        return {
            id: `xtream-${item.kind}-${episode?.id ?? item.id}`,
            url,
            name,
            group: { title: item.kind === 'vod' ? 'Movies' : 'Box sets' },
            tvg: { id: '', name, url: '', logo: item.poster, rec: '' },
            http: { referrer: '', 'user-agent': '', origin: '' },
            radio: 'false',
        } as Channel;
    }

    private fromVod(s: XtreamVodStream): SlykVodItem {
        const { title, year } = splitVodName(s.name ?? '');
        return {
            kind: 'vod',
            id: Number(s.stream_id),
            title,
            year,
            poster: s.stream_icon ?? '',
            rating: s.rating ? String(s.rating) : '',
            extension: s.container_extension || 'mp4',
            plot: '',
        };
    }

    private fromSeries(s: XtreamSerieItem): SlykVodItem {
        const { title, year } = splitVodName(s.name ?? '');
        return {
            kind: 'series',
            id: Number(s.series_id),
            title,
            year: year || (s.releaseDate ?? '').slice(0, 4),
            poster: s.cover ?? '',
            rating: s.rating ?? '',
            extension: '',
            plot: s.plot ?? '',
        };
    }

    private cached<T>(key: string, load: (creds: XtreamCredentials) => Promise<T>): Promise<T> {
        const creds = this.epg.xtreamCredentials;
        if (!creds) {
            return Promise.resolve([] as unknown as T);
        }
        const full = `${creds.serverUrl}|${creds.username}|${key}`;
        let hit = this.cache.get(full) as Promise<T> | undefined;
        if (!hit) {
            hit = load(creds).catch((error) => {
                this.cache.delete(full);
                throw error;
            });
            this.cache.set(full, hit);
        }
        return hit;
    }
}
