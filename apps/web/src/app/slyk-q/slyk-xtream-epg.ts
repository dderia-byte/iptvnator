import { Channel } from '@iptvnator/shared/interfaces';

/** Picture-format and feed words that don't change which channel it is. */
const FORMAT_WORDS =
    /\b(hd|fhd|uhd|sd|hq|lq|4k|8k|hevc|h26[45]|raw|fps|sat|backup|multi|vip|\d{3,4}p|50|60)\b/g;

/**
 * A channel name reduced to what identifies the channel, so feeds of one
 * channel match: "4K: SKY SPORTS MAIN EVENTS ᵁᴴᴰ ³⁸⁴⁰ᴾ" and
 * "VIP: SKY SPORTS MAIN EVENT ᴴᴰ" both become "skysportmainevent".
 */
export function epgNameKey(name: string): string {
    return (
        name
            .toLowerCase()
            // Provider feed prefix: "UK:", "NOW:", "VIP:", "4K|", "SKYGO:"
            .replace(/^([^:|]{1,8}[:|]\s*)+/, '')
            .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
            // Superscript tags and decorations (ᴴᴰ, ◉) are not ASCII.
            .replace(/[^\x20-\x7e]/g, ' ')
            .replace(FORMAT_WORDS, ' ')
            .replace(/[^a-z0-9+ ]/g, ' ')
            .split(/\s+/)
            .filter(Boolean)
            .map((word) => (word.length > 3 ? word.replace(/s$/, '') : word))
            .join('')
    );
}

export function xtreamStreamId(channel: Channel): number | null {
    const match = /^xtream-live-(\d+)$/.exec(channel.id ?? '');
    return match ? Number(match[1]) : null;
}

/**
 * Where a channel's programmes come from on an Xtream panel: the panel only
 * has listings for streams with an EPG id, so a copy without one (a 4K or
 * backup feed) borrows the id of a listed feed with the same name.
 */
export class XtreamEpgIndex {
    /** EPG id → a stream id that carries it. */
    private readonly streamOfEpgId = new Map<string, number>();
    /** Channel id → EPG id (own or borrowed). */
    private readonly epgIdOfChannel = new Map<string, string>();

    constructor(channels: readonly Channel[]) {
        const votes = new Map<string, Map<string, number>>();
        for (const channel of channels) {
            const epgId = channel.tvg?.id?.trim();
            const streamId = xtreamStreamId(channel);
            if (!epgId || streamId === null) {
                continue;
            }
            if (!this.streamOfEpgId.has(epgId)) {
                this.streamOfEpgId.set(epgId, streamId);
            }
            this.epgIdOfChannel.set(channel.id, epgId);
            const key = epgNameKey(channel.name ?? '');
            if (key) {
                const counts = votes.get(key) ?? new Map<string, number>();
                counts.set(epgId, (counts.get(epgId) ?? 0) + 1);
                votes.set(key, counts);
            }
        }
        // The EPG id most feeds of a name use wins.
        const byName = new Map<string, string>();
        for (const [key, counts] of votes) {
            const [best] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
            byName.set(key, best[0]);
        }
        for (const channel of channels) {
            if (!this.epgIdOfChannel.has(channel.id)) {
                const borrowed = byName.get(epgNameKey(channel.name ?? ''));
                if (borrowed) {
                    this.epgIdOfChannel.set(channel.id, borrowed);
                }
            }
        }
    }

    epgId(channel: Channel | null | undefined): string | null {
        return channel ? (this.epgIdOfChannel.get(channel.id) ?? null) : null;
    }

    streamId(epgId: string): number | null {
        return this.streamOfEpgId.get(epgId) ?? null;
    }

    get coverage(): number {
        return this.epgIdOfChannel.size;
    }
}
