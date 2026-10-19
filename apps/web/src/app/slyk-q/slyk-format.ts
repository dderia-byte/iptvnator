import { SlykEvent } from './slyk-epg.service';

const pad = (value: number) => String(value).padStart(2, '0');
const DAY = 86_400_000;

/** Sky Q clock: "9.52pm", "12.05am". */
export function slykTime(ms: number | null | undefined): string {
    if (ms === null || ms === undefined || !Number.isFinite(ms)) {
        return '';
    }
    const date = new Date(ms);
    const hours = date.getHours();
    return `${hours % 12 || 12}.${pad(date.getMinutes())}${hours < 12 ? 'am' : 'pm'}`;
}

/** "Sat 18 Oct". */
export function slykDate(ms: number): string {
    const date = new Date(ms);
    const weekday = date.toLocaleDateString('en-GB', { weekday: 'short' });
    const month = date.toLocaleDateString('en-GB', { month: 'short' });
    return `${weekday} ${date.getDate()} ${month}`;
}

/** Sky's day label: "Today", "Tomorrow", "Yesterday" or "Sat 18 Oct". */
export function slykDay(ms: number, now: number): string {
    const startOf = (t: number) => new Date(t).setHours(0, 0, 0, 0);
    const days = Math.round((startOf(ms) - startOf(now)) / DAY);
    return days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : days === -1 ? 'Yesterday' : slykDate(ms);
}

/** Sky Q duration: "1h 15m", "45m", "2h". */
export function slykLength(event: SlykEvent | null): string {
    if (!event) {
        return '';
    }
    const minutes = Math.round((event.stopMs - event.startMs) / 60_000);
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m`;
}

/**
 * Sky Q timing line: "Started at 9.40pm" while on, "Starts at 10.55pm" later
 * today, "Tomorrow, 5.00pm" on another day.
 */
export function slykStartedAt(event: SlykEvent | null, now: number): string {
    if (!event) {
        return '';
    }
    const time = slykTime(event.startMs);
    if (event.startMs <= now) {
        return `Started at ${time}`;
    }
    const day = slykDay(event.startMs, now);
    return day === 'Today' ? `Starts at ${time}` : `${day}, ${time}`;
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
