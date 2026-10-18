import {
    Channel,
    PlaylistMeta,
    XtreamCategory,
    XtreamLiveStream,
} from '@iptvnator/shared/interfaces';

type XtreamAccount = Pick<PlaylistMeta, 'serverUrl' | 'username' | 'password'>;

/**
 * Xtream Codes accounts in the Slyk Q receiver. Live channels come from the
 * Xtream API (`player_api.php` get_live_streams / get_live_categories), the
 * same calls IPTVnator's Xtream workspace makes, so they work on panels that
 * disable the `get.php` M3U export. Films and series stay in the workspace.
 */
export function xtreamXmltvUrl(account: XtreamAccount): string {
    const base = (account.serverUrl ?? '').trim().replace(/\/+$/, '');
    return (
        `${base}/xmltv.php?username=${encodeURIComponent(account.username ?? '')}` +
        `&password=${encodeURIComponent(account.password ?? '')}`
    );
}

/**
 * Turns API live streams into the receiver's channel model, in the panel's
 * own order (`num`), grouped under their category names.
 */
export function xtreamLiveChannels(
    streams: readonly XtreamLiveStream[],
    categories: readonly XtreamCategory[],
    liveUrl: (streamId: number) => string
): Channel[] {
    const categoryNames = new Map(
        categories.map((c) => [String(c.category_id), c.category_name])
    );
    return [...streams]
        .filter((s) => s.stream_id !== undefined && s.stream_id !== null)
        .sort((a, b) => (Number(a.num) || 0) - (Number(b.num) || 0))
        .map((stream) => {
            const name = (stream.name ?? '').trim() || `Channel ${stream.stream_id}`;
            return {
                id: `xtream-live-${stream.stream_id}`,
                url: liveUrl(Number(stream.stream_id)),
                name,
                group: {
                    title: categoryNames.get(String(stream.category_id)) ?? '',
                },
                tvg: {
                    id: stream.epg_channel_id?.trim() ?? '',
                    name,
                    url: '',
                    logo: stream.stream_icon ?? '',
                    rec: '',
                },
                http: { referrer: '', 'user-agent': '', origin: '' },
                radio: 'false',
            };
        });
}
