import { computed, inject, Injectable, signal } from '@angular/core';
import { Store } from '@ngrx/store';
import { firstValueFrom } from 'rxjs';
import {
    ChannelActions,
    FavoritesActions,
    resolveExternalPlayerHttpHeaders,
    selectActive,
    selectActivePlaybackUrl,
    selectActivePlaylist,
    selectChannels,
    selectChannelsLoading,
    selectFavorites,
} from '@iptvnator/m3u-state';
import { EpgService } from '@iptvnator/epg/data-access';
import { createPlaybackSessionKey } from '@iptvnator/playback/util';
import { PlaylistContextFacade } from '@iptvnator/playlist/shared/util';
import { PlaylistsService, SettingsStore } from '@iptvnator/services';
import {
    applyChannelNameStrip,
    extractDrmFromRaw,
    isLikelyM3uVod,
} from '@iptvnator/shared/m3u-utils';
import {
    Channel,
    PlaylistMeta,
    ResolvedPortalPlayback,
    StreamFormat,
} from '@iptvnator/shared/interfaces';
import {
    XtreamApiService,
    XtreamCredentials,
    XtreamUrlService,
} from '@iptvnator/portal/xtream/data-access';
import {
    GENRE_PREFIX,
    GROUP_PREFIX,
    REGION_ALL,
    SlykCategoriesService,
} from './slyk-categories.service';
import { xtreamLiveChannels, xtreamXmltvUrl } from './slyk-xtream';

/** A Slyk "bouquet": all channels, favourites, or one playlist group. */
export interface SlykBouquet {
    id: string;
    label: string;
}

export const BOUQUET_ALL = 'all';
export const BOUQUET_FAVOURITES = 'favourites';

/**
 * State behind every Slyk Q screen. It owns no data of its own: playlists,
 * channels, favourites and the active channel live in the existing m3u-state
 * store, filled the same way the classic M3U workspace route session fills
 * it, so playback, favourites and recents behave exactly as before.
 */
@Injectable()
export class SlykTvService {
    private readonly store = inject(Store);
    private readonly playlistContext = inject(PlaylistContextFacade);
    private readonly playlistsService = inject(PlaylistsService);
    private readonly settingsStore = inject(SettingsStore);
    readonly categories = inject(SlykCategoriesService);

    readonly playlists = this.playlistContext.playlists;
    readonly activePlaylist = this.store.selectSignal(selectActivePlaylist);
    readonly channels = this.store.selectSignal(selectChannels);
    readonly channelsLoading = this.store.selectSignal(selectChannelsLoading);
    readonly activeChannel = this.store.selectSignal(selectActive);
    readonly favouriteKeys = this.store.selectSignal(selectFavorites);
    private readonly activePlaybackUrl = this.store.selectSignal(
        selectActivePlaybackUrl
    );

    /**
     * Favourites live on M3U playlists; an Xtream account keeps its own in
     * the classic workspace, so the receiver does not write to it.
     */
    readonly favouritesSupported = computed(
        () => !this.activePlaylist()?.serverUrl
    );
    private readonly epgService = inject(EpgService);
    private readonly xtreamCache = new Map<string, Channel[]>();
    private readonly xtreamApi = inject(XtreamApiService);
    private readonly xtreamUrls = inject(XtreamUrlService);
    /** Why the last source could not be opened, shown on the channel list. */
    readonly loadError = signal<string | null>(null);
    private loadedPlaylistId: string | null = null;
    private loadRequest = 0;

    /** TV services: radio entries are left to the classic radio player. */
    readonly tvChannels = computed(() =>
        this.channels().filter((channel) => channel.radio !== 'true')
    );

    readonly bouquetId = signal(BOUQUET_ALL);

    readonly bouquets = computed<SlykBouquet[]>(() => {
        const seen = new Set<string>();
        const groups: SlykBouquet[] = [];
        for (const channel of this.tvChannels()) {
            const title = channel.group?.title?.trim();
            if (title && !seen.has(title)) {
                seen.add(title);
                groups.push({ id: GROUP_PREFIX + title, label: title });
            }
        }
        return [
            { id: BOUQUET_ALL, label: 'All Channels' },
            { id: BOUQUET_FAVOURITES, label: 'Favourites' },
            { id: GENRE_PREFIX + REGION_ALL, label: 'All Channels' },
            ...this.categories.genres().map(({ id, label }) => ({ id, label })),
            ...groups,
        ];
    });

    readonly bouquet = computed(
        () =>
            this.bouquets().find((b) => b.id === this.bouquetId()) ??
            this.bouquets()[0]
    );

    /** Channels of the current bouquet, in playlist order. */
    readonly bouquetChannels = computed(() => {
        const id = this.bouquetId();
        const channels = this.tvChannels();
        if (id === BOUQUET_FAVOURITES) {
            const keys = new Set(this.favouriteKeys());
            return channels.filter((c) => keys.has(c.url) || keys.has(c.id));
        }
        if (id.startsWith(GENRE_PREFIX)) {
            const genre = id.slice(GENRE_PREFIX.length);
            if (genre === REGION_ALL) {
                return channels.filter((c) => this.categories.inRegion(c));
            }
            const genres = this.categories.genreOf();
            return channels.filter(
                (c) => genres.get(c) === genre && this.categories.inRegion(c)
            );
        }
        if (id.startsWith(GROUP_PREFIX)) {
            const title = id.slice(GROUP_PREFIX.length);
            return channels.filter((c) => c.group?.title?.trim() === title);
        }
        return channels;
    });

    /** Receiver-style channel number: position in the full TV list, 1-based. */
    readonly channelNumbers = computed(() => {
        const numbers = new Map<Channel, number>();
        this.tvChannels().forEach((channel, i) => numbers.set(channel, i + 1));
        return numbers;
    });

    readonly playbackSessionKey = computed(() => {
        const playlistId = this.activePlaylist()?._id;
        const channelId = this.activeChannel()?.id;
        return playlistId && channelId !== undefined
            ? createPlaybackSessionKey({
                  kind: 'live',
                  sourceId: playlistId,
                  contentId: channelId,
              })
            : '';
    });

    readonly playback = computed<ResolvedPortalPlayback | null>(
        () => this.resolvePlayback(),
        { equal: (a, b) => JSON.stringify(a) === JSON.stringify(b) }
    );

    displayName(channel: Channel | null | undefined): string {
        if (!channel) {
            return '';
        }
        const strip = this.settingsStore.stripCountryPrefix?.();
        return applyChannelNameStrip(channel.name, strip) || channel.name;
    }

    numberOf(channel: Channel | null | undefined): number | null {
        if (!channel) {
            return null;
        }
        const exact = this.channelNumbers().get(channel);
        if (exact) {
            return exact;
        }
        const index = this.tvChannels().findIndex(
            (c) => c.id === channel.id && c.url === channel.url
        );
        return index >= 0 ? index + 1 : null;
    }

    isFavourite(channel: Channel): boolean {
        const keys = this.favouriteKeys();
        return keys.includes(channel.url) || keys.includes(channel.id);
    }

    toggleFavourite(channel: Channel): void {
        if (this.favouritesSupported()) {
            this.store.dispatch(FavoritesActions.updateFavorites({ channel }));
        }
    }

    setBouquet(id: string): void {
        if (this.bouquets().some((b) => b.id === id)) {
            this.bouquetId.set(id);
        }
    }

    /** Falls back to All Channels when the playing service is not listed. */
    showBouquetWithActive(): void {
        const active = this.activeChannel();
        if (
            active &&
            !this.bouquetChannels().some(
                (c) => c.id === active.id && c.url === active.url
            )
        ) {
            this.bouquetId.set(BOUQUET_ALL);
        }
    }

    stepBouquet(delta: number): void {
        const list = this.bouquets();
        const index = list.findIndex((b) => b.id === this.bouquetId());
        const next = (index + delta + list.length) % list.length;
        this.bouquetId.set(list[next].id);
    }

    play(channel: Channel): void {
        this.store.dispatch(
            // The receiver always plays in its own picture; MPV/VLC stay
            // a Classic View choice.
            ChannelActions.setActiveChannel({
                channel,
                startPlayback: true,
                inAppOnly: true,
            })
        );
    }

    /** Zaps within the current bouquet, wrapping like a receiver. */
    zap(delta: 1 | -1): void {
        const list = this.bouquetChannels().length
            ? this.bouquetChannels()
            : this.tvChannels();
        if (list.length === 0) {
            return;
        }
        const active = this.activeChannel();
        const index = active
            ? list.findIndex((c) => c.id === active.id && c.url === active.url)
            : -1;
        const next = index < 0 ? 0 : (index + delta + list.length) % list.length;
        this.play(list[next]);
    }

    playNumber(number: number): boolean {
        const channel = this.tvChannels()[number - 1];
        if (channel) {
            this.play(channel);
        }
        return !!channel;
    }

    isM3u(playlist: PlaylistMeta): boolean {
        return this.playlistContext.getProviderForPlaylist(playlist) === 'playlists';
    }

    /** M3U playlists, and Xtream accounts' live TV where it can be fetched. */
    playsHere(playlist: PlaylistMeta): boolean {
        return this.isM3u(playlist) || !!playlist.serverUrl;
    }

    /** Opens a source here; Stalker portals hand over to the classic UI. */
    openPlaylist(playlist: PlaylistMeta): 'slyk' | 'classic' {
        if (!this.playsHere(playlist)) {
            this.playlistContext.selectPlaylist(playlist);
            return 'classic';
        }
        this.playlistContext.activatePlaylist(playlist._id);
        void this.loadPlaylist(playlist._id);
        return 'slyk';
    }

    openPlaylistById(id: string): 'slyk' | 'classic' | null {
        const playlist = this.playlists().find((p) => p._id === id);
        return playlist ? this.openPlaylist(playlist) : null;
    }

    /** Loads the remembered (or first) playable source when nothing is loaded. */
    async ensureLoaded(): Promise<void> {
        const active = this.activePlaylist();
        const candidate =
            active && this.playsHere(active)
                ? active
                : this.playlists().find((p) => this.playsHere(p));
        if (candidate && this.loadedPlaylistId !== candidate._id) {
            this.playlistContext.activatePlaylist(candidate._id);
            await this.loadPlaylist(candidate._id);
        }
    }

    /** Mirrors M3uWorkspaceRouteSession: publish channels and favourites. */
    async loadPlaylist(playlistId: string): Promise<void> {
        if (this.loadedPlaylistId === playlistId) {
            return;
        }
        this.loadedPlaylistId = playlistId;
        this.loadError.set(null);
        const request = ++this.loadRequest;
        this.bouquetId.set(BOUQUET_ALL);
        this.store.dispatch(ChannelActions.resetActiveChannel());
        this.store.dispatch(ChannelActions.setChannelsLoading({ loading: true }));
        try {
            const playlist = await firstValueFrom(
                this.playlistsService.getPlaylist(playlistId)
            );
            if (request !== this.loadRequest) {
                return;
            }
            if (playlist.serverUrl) {
                await this.loadXtream(
                    { ...playlist, _id: playlistId, title: playlist.title ?? '' },
                    request
                );
                return;
            }
            void window.electron
                ?.setUserAgent(playlist.userAgent, playlist.referrer)
                .catch(() => undefined);
            this.store.dispatch(
                ChannelActions.setChannels({
                    channels: playlist.playlist?.items ?? [],
                })
            );
            this.store.dispatch(
                FavoritesActions.hydrateFavorites({
                    channelIds: (playlist.favorites ?? []).filter(
                        (f): f is string => typeof f === 'string'
                    ),
                })
            );
        } catch (error) {
            if (request === this.loadRequest) {
                this.loadError.set(
                    error instanceof Error && error.message
                        ? error.message
                        : 'The source could not be loaded.'
                );
                this.loadedPlaylistId = null;
                this.store.dispatch(ChannelActions.setChannels({ channels: [] }));
            }
        }
    }

    /** Xtream: live channels from the Xtream API, guide from its XMLTV. */
    private async loadXtream(
        account: Pick<
            PlaylistMeta,
            '_id' | 'title' | 'serverUrl' | 'username' | 'password'
        >,
        request: number
    ) {
        const credentials: XtreamCredentials = {
            serverUrl: account.serverUrl ?? '',
            username: account.username ?? '',
            password: account.password ?? '',
        };
        let channels = this.xtreamCache.get(account._id);
        if (!channels) {
            const [streams, categories, info] = await Promise.all([
                this.xtreamApi.getLiveStreams(credentials),
                this.xtreamApi.getCategories(credentials, 'live'),
                this.xtreamApi.getAccountInfo(credentials).catch(() => null),
            ]);
            // The account's allowed formats keep the URL to one it serves.
            credentials.allowedOutputFormats =
                info?.user_info?.allowed_output_formats?.map((f) => f.trim());
            // Receivers zap MPEG-TS, and some panels only serve real video
            // as .ts (their .m3u8 answers with an error page), so Auto means
            // ts here; an explicit HLS choice in settings is still honoured.
            const format =
                this.settingsStore.streamFormat?.() === StreamFormat.M3u8StreamFormat
                    ? StreamFormat.M3u8StreamFormat
                    : StreamFormat.TsStreamFormat;
            channels = xtreamLiveChannels(streams, categories, (id) =>
                this.xtreamUrls.constructLiveUrl(credentials, id, format)
            );
            if (channels.length === 0) {
                throw new Error('The provider returned no live channels.');
            }
            this.xtreamCache.set(account._id, channels);
        }
        if (request !== this.loadRequest) {
            return;
        }
        this.store.dispatch(ChannelActions.setChannels({ channels }));
        this.store.dispatch(FavoritesActions.hydrateFavorites({ channelIds: [] }));
        void this.epgService.fetchEpg([xtreamXmltvUrl(account)]);
    }

    private resolvePlayback(): ResolvedPortalPlayback | null {
        const channel = this.activeChannel();
        if (!channel?.url) {
            return null;
        }
        const catchupUrl = this.activePlaybackUrl();
        const target = catchupUrl ? { ...channel, url: catchupUrl } : channel;
        const effective = resolveExternalPlayerHttpHeaders(
            target,
            this.activePlaylist()
        );
        const headers: Record<string, string> = {};
        if (effective['user-agent']) {
            headers['User-Agent'] = effective['user-agent'];
        }
        if (effective.referer) {
            headers['Referer'] = effective.referer;
        }
        if (effective.origin) {
            headers['Origin'] = effective.origin;
        }
        return {
            streamUrl: `${target.url}${target.epgParams ?? ''}`,
            title: this.displayName(channel) || channel.tvg?.name || target.url,
            thumbnail: channel.tvg?.logo ?? null,
            isLive: !catchupUrl && !isLikelyM3uVod(channel),
            headers: Object.keys(headers).length > 0 ? headers : undefined,
            userAgent: effective['user-agent'],
            referer: effective.referer,
            origin: effective.origin,
            drm: target.drm ?? extractDrmFromRaw(target.raw),
        };
    }
}
