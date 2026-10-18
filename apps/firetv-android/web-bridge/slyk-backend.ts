// Bundled into the Fire TV app's web assets: parses a downloaded M3U with
// IPTVnator's own parser and playlist builder, for SlykBackend's /api/parse.
import parser from 'iptv-playlist-parser';
import { createPlaylistObject } from '../../../libs/shared/m3u-utils/src/lib/playlist.utils';

interface SlykNativeParse {
    parseResult(token: string, json: string): void;
}

const host = window as unknown as {
    SlykNative?: SlykNativeParse;
    __slykParse?: (token: string, url: string, title: string) => Promise<void>;
};

host.__slykParse = async (token, url, title) => {
    let json: string;
    try {
        const response = await fetch(`/api/raw?token=${encodeURIComponent(token)}`);
        const parsed = parser.parse(await response.text());
        json = JSON.stringify(createPlaylistObject(title, parsed, url, 'URL'));
    } catch (error) {
        json = JSON.stringify({
            status: 500,
            message: error instanceof Error ? error.message : 'Parse failed',
        });
    }
    host.SlykNative?.parseResult(token, json);
};
