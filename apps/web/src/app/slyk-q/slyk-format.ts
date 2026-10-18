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

/** Guess of the SlykServiceInfo resolution badge from the channel name. */
export function slykResolutionBadge(name: string): 'UHD' | 'HD' | 'SD' {
    if (/\b(uhd|4k|2160p?)\b/i.test(name)) {
        return 'UHD';
    }
    return /\b(hd|fhd|1080[pi]?|720p?)\b/i.test(name) ? 'HD' : 'SD';
}
