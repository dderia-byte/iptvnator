import { SlykEvent } from './slyk-epg.service';

const pad = (value: number) => String(value).padStart(2, '0');

/** Slyk18Time: 24-hour "HH:MM". */
export function slykTime(ms: number | null | undefined): string {
    if (ms === null || ms === undefined || !Number.isFinite(ms)) {
        return '';
    }
    const date = new Date(ms);
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Slyk18DateFormat1: "Sat 18 Oct". */
export function slykDate(ms: number): string {
    const date = new Date(ms);
    const weekday = date.toLocaleDateString('en-GB', { weekday: 'short' });
    const month = date.toLocaleDateString('en-GB', { month: 'short' });
    return `${weekday} ${date.getDate()} ${month}`;
}

/** Slyk18AsLength: "60 mins". */
export function slykLength(event: SlykEvent | null): string {
    if (!event) {
        return '';
    }
    const minutes = Math.round((event.stopMs - event.startMs) / 60_000);
    return `${minutes} min${minutes === 1 ? '' : 's'}`;
}

/** Slyk18StartedAt: "Started 19:00" for a running event, "Starts 19:30" ahead. */
export function slykStartedAt(event: SlykEvent | null, now: number): string {
    if (!event) {
        return '';
    }
    return `${event.startMs <= now ? 'Started' : 'Starts'} ${slykTime(event.startMs)}`;
}

/** Modifier (superscript) letters providers use for tags such as ᴴᴰ. */
const SUPERSCRIPTS: Record<string, string> = {};
for (const [from, to] of [
    ['ᴬᴮᴰᴱᴳᴴᴵᴶᴷᴸᴹᴺᴼᴾᴿᵀᵁⱽᵂ', 'ABDEGHIJKLMNOPRTUVW'],
    ['ᵃᵇᶜᵈᵉᶠᵍʰⁱʲᵏˡᵐⁿᵒᵖʳˢᵗᵘᵛʷˣʸᶻ', 'abcdefghijklmnoprstuvwxyz'],
    ['⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁽⁾', '0123456789+()'],
]) {
    [...from].forEach((c, i) => (SUPERSCRIPTS[c] = to[i]));
}

/** Symbol blocks (punctuation, arrows, shapes such as ◉) and emoji. */
const SYMBOLS = new RegExp(
    `[${String.fromCodePoint(0x2000)}-${String.fromCodePoint(0x2bff)}${String.fromCodePoint(0x1f000)}-${String.fromCodePoint(0x1faff)}]`,
    'gu'
);

/** "SKY ONE ᴴᴰ" → "SKY ONE HD": superscript tags read as plain letters. */
export function plainChannelName(name: string): string {
    return [...name].map((c) => SUPERSCRIPTS[c] ?? c).join('');
}

/**
 * The name a receiver shows: superscript tags and symbols such as ◉ are
 * dropped ("SKY SPORTS MAIN EVENT ᴴᴰ ◉" → "SKY SPORTS MAIN EVENT").
 */
export function cleanChannelName(name: string): string {
    const cleaned = [...name]
        .filter((c) => !(c in SUPERSCRIPTS))
        .join('')
        .replace(SYMBOLS, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return cleaned || name.trim();
}

/** Guess of the SlykServiceInfo resolution badge from the channel name. */
export function slykResolutionBadge(name: string): 'UHD' | 'HD' | 'SD' {
    const plain = plainChannelName(name);
    if (/\b(uhd|4k|8k|2160p?|3840p?)\b/i.test(plain)) {
        return 'UHD';
    }
    return /\b(hd|fhd|1080[pi]?|720p?)\b/i.test(plain) ? 'HD' : 'SD';
}
