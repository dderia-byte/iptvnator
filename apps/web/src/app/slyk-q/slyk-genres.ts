import { Channel } from '@iptvnator/shared/interfaces';

/**
 * Sky-style guide categories. IPTV playlists only carry free-text group
 * titles ("UK | SPORTS", "Kids TV", "AR| BEIN SPORTS HD"), so each channel is
 * sorted into the category a Sky box would list it under from its group title
 * and name.
 */
export const SLYK_GENRES = [
    'Entertainment',
    'Movies',
    'Sports',
    'News',
    'Documentaries',
    'Kids',
    'Music',
    'UHD & 4K',
    'Religious',
    'Shopping',
    'Other Channels',
] as const;

export type SlykGenre = (typeof SLYK_GENRES)[number];

const UHD_RULE = /\b(4k|uhd|8k|ultra ?hd|2160p?)\b/i;

/** First match wins, so the more specific categories come first. */
const RULES: ReadonlyArray<readonly [Exclude<SlykGenre, 'UHD & 4K' | 'Other Channels'>, RegExp]> = [
    ['Kids', /\b(kids?|children|cartoon|disney ?(jr|junior|xd|channel)|nick(elodeon| jr)?|cbeebies|cbbc|boomerang|baby ?tv|junior|toons?|pogo)\b/i],
    ['Sports', /\b(sports?|football|soccer|bein|dazn|espn|eurosport|tnt sports|sky sports|premier ?league|laliga|la liga|serie a|bundesliga|nba|nfl|nhl|mlb|ufc|wwe|boxing|f1|formula ?1|motogp|golf|tennis|cricket|rugby|racing|ppv|arena ?sport|sportklub|supersport|ssc|alkass|setanta|fight)\b/i],
    ['Movies', /\b(movies?|films?|cinema|cine|kino|box ?office|premiere|hbo|showtime|starz|mgm|tcm|paramount|sky cinema|film ?4|action|thriller|horror|comedy movies?|vod)\b/i],
    ['News', /\b(news|nachrichten|noticias|info|cnn|bbc world|sky news|al ?jazeera|euronews|france ?24|cnbc|bloomberg|fox news|msnbc|gb news|rt|trt world|weather)\b/i],
    ['Documentaries', /\b(docs?|documentar(y|ies|io|ios)|discovery|nat ?geo|national geographic|history|animal|science|crime ?(\+|and)? ?investigation|investigation|nature|wild|travel|food network|quest)\b/i],
    ['Music', /\b(music|musik|musica|mtv|vh1|kiss|capital|radio|hits?|concerts?|clubland|kerrang|box ?hits|4music|trace)\b/i],
    ['Religious', /\b(relig(ion|ious)|islam(ic)?|quran|coran|christian|church|gospel|god|faith|catholic|hindu|bhakti|sikh|peace tv|ewtn)\b/i],
    ['Shopping', /\b(shop(ping)?|qvc|hsn|ideal world|tjc|teleshopping)\b/i],
    ['Entertainment', /\b(entertain(ment)?|general|generalist|variety|drama|series|soaps?|comedy|reality|lifestyle|family|tv ?shows?|bbc|itv|channel ?[45]|sky (one|max|showcase|atlantic|witness|comedy)|e4|dave|gold|w ?channel|alibi|yesterday|local|regional)\b/i],
];

export function classifyChannel(channel: Pick<Channel, 'name' | 'group'>): SlykGenre {
    const group = channel.group?.title ?? '';
    const name = channel.name ?? '';
    // The subject wins over picture format: "4K: SKY SPORTS F1" in a
    // "4K UHD" group is Sports. A vague group ("UK | VIP") falls back to the
    // channel name; UHD & 4K only collects what has no other subject.
    for (const text of [group, name]) {
        for (const [genre, rule] of RULES) {
            if (rule.test(text)) {
                return genre;
            }
        }
    }
    return UHD_RULE.test(group) || UHD_RULE.test(name) ? 'UHD & 4K' : 'Other Channels';
}

/**
 * Country of a channel from its provider group prefix ("UK| SPORTS",
 * "DE : FILME"): two letters before a bar or colon. Format groups such as
 * "4K|" or "8K|" have no country and belong to every region.
 */
export function regionOf(channel: Pick<Channel, 'group'>): string | null {
    const match = /^\s*([A-Za-z]{2})\s*[|:]/.exec(channel.group?.title ?? '');
    return match ? match[1].toUpperCase() : null;
}
