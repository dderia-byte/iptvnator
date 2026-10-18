import { Channel, PlaylistMeta } from '@iptvnator/shared/interfaces';

type XtreamAccount = Pick<PlaylistMeta, 'serverUrl' | 'username' | 'password'>;

/**
 * Xtream Codes accounts in the Slyk Q receiver. The receiver is a live TV
 * front end, so it reads the account's standard M3U export
 * (`get.php?type=m3u_plus`) and XMLTV guide (`xmltv.php`) — the same feeds
 * Enigma2 bouquet importers use — through IPTVnator's own playlist fetcher.
 * Films and series stay in the classic Xtream workspace.
 */
function base(account: XtreamAccount): string {
    return (account.serverUrl ?? '').trim().replace(/\/+$/, '');
}

function credentials(account: XtreamAccount): string {
    return (
        `username=${encodeURIComponent(account.username ?? '')}` +
        `&password=${encodeURIComponent(account.password ?? '')}`
    );
}

export function xtreamM3uUrl(account: XtreamAccount): string {
    return `${base(account)}/get.php?${credentials(account)}&type=m3u_plus&output=ts`;
}

export function xtreamXmltvUrl(account: XtreamAccount): string {
    return `${base(account)}/xmltv.php?${credentials(account)}`;
}

/** Live streams only: the export also lists `/movie/` and `/series/` items. */
export function isXtreamLiveChannel(channel: Pick<Channel, 'url'>): boolean {
    return !/\/(movie|series)\//i.test(channel.url ?? '');
}

/** True when this runtime can fetch a remote playlist (Electron). */
export function canFetchXtream(): boolean {
    return typeof window.electron?.fetchPlaylistByUrl === 'function';
}

export async function fetchXtreamLiveChannels(
    account: XtreamAccount & Pick<PlaylistMeta, 'title'>,
    trust: Parameters<NonNullable<typeof window.electron>['fetchPlaylistByUrl']>[2]
): Promise<Channel[]> {
    const bridge = window.electron;
    if (!bridge) {
        return [];
    }
    const fetched = await bridge.fetchPlaylistByUrl(
        xtreamM3uUrl(account),
        account.title,
        trust
    );
    return (fetched.playlist?.items ?? []).filter(isXtreamLiveChannel);
}
