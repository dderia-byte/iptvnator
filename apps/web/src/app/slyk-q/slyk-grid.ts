import { SlykEvent } from './slyk-epg.service';
import { slykTime } from './slyk-format';

export const HALF_HOUR = 30 * 60_000;

/** One programme cell of a guide row, in stage pixels relative to the grid. */
export interface SlykGridCell {
    event: SlykEvent | null;
    left: number;
    width: number;
    title: string;
    isNow: boolean;
}

export interface SlykGridWindow {
    fromMs: number;
    toMs: number;
    /** Grid width in stage pixels (right of the service column). */
    width: number;
}

/** Rounds down to the half hour, where Enigma2 guides start their window. */
export function windowStart(ms: number): number {
    return Math.floor(ms / HALF_HOUR) * HALF_HOUR;
}

/**
 * Cells for one service across the window. Gaps without programme data are
 * filled with "No event information" cells so every row is navigable, the
 * way the GraphicalEPG renders an empty service.
 */
export function buildRow(
    events: readonly SlykEvent[],
    window: SlykGridWindow,
    now: number
): SlykGridCell[] {
    const span = window.toMs - window.fromMs;
    const toX = (ms: number) =>
        Math.round(
            ((Math.min(Math.max(ms, window.fromMs), window.toMs) -
                window.fromMs) /
                span) *
                window.width
        );
    const cells: SlykGridCell[] = [];
    let cursor = window.fromMs;
    const pushGap = (until: number) => {
        if (until > cursor) {
            cells.push({
                event: null,
                left: toX(cursor),
                width: toX(until) - toX(cursor),
                title: 'No event information',
                isNow: cursor <= now && until > now,
            });
        }
    };
    for (const event of events) {
        if (event.stopMs <= window.fromMs || event.startMs >= window.toMs) {
            continue;
        }
        pushGap(Math.max(event.startMs, window.fromMs));
        const left = toX(event.startMs);
        cells.push({
            event,
            left,
            width: toX(event.stopMs) - left,
            title: event.title,
            isNow: event.startMs <= now && event.stopMs > now,
        });
        cursor = Math.max(cursor, Math.min(event.stopMs, window.toMs));
    }
    pushGap(window.toMs);
    return cells.filter((cell) => cell.width > 0);
}

/** Labels for the timeline bar, one per half hour. */
export function timelineLabels(
    window: SlykGridWindow
): Array<{ left: number; label: string }> {
    const labels: Array<{ left: number; label: string }> = [];
    const span = window.toMs - window.fromMs;
    for (let t = window.fromMs; t < window.toMs; t += HALF_HOUR) {
        labels.push({
            left: Math.round(((t - window.fromMs) / span) * window.width),
            label: slykTime(t),
        });
    }
    return labels;
}

/** X position of the "now" marker, or null when now is outside the window. */
export function nowMarker(window: SlykGridWindow, now: number): number | null {
    if (now < window.fromMs || now >= window.toMs) {
        return null;
    }
    return Math.round(
        ((now - window.fromMs) / (window.toMs - window.fromMs)) * window.width
    );
}

/** Index of the cell under `ms` (used to keep the cursor's time column). */
export function cellAt(cells: readonly SlykGridCell[], x: number): number {
    const index = cells.findIndex(
        (cell) => cell.left <= x && cell.left + cell.width > x
    );
    return index >= 0 ? index : Math.max(0, cells.length - 1);
}
