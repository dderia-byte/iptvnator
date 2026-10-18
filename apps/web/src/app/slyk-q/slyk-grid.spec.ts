import { SlykEvent } from './slyk-epg.service';
import {
    buildRow,
    cellAt,
    HALF_HOUR,
    nowMarker,
    timelineLabels,
    windowStart,
} from './slyk-grid';

const T0 = Date.UTC(2026, 9, 18, 18, 0);

function event(startMin: number, stopMin: number, title: string): SlykEvent {
    return {
        title,
        description: '',
        startMs: T0 + startMin * 60_000,
        stopMs: T0 + stopMin * 60_000,
        program: {} as SlykEvent['program'],
    };
}

const window = { fromMs: T0, toMs: T0 + 4 * HALF_HOUR, width: 1200 };

describe('slyk grid', () => {
    it('starts windows on the half hour', () => {
        expect(windowStart(T0 + 17 * 60_000)).toBe(T0);
        expect(windowStart(T0 + 31 * 60_000)).toBe(T0 + HALF_HOUR);
    });

    it('clips events to the window and fills gaps with no-information cells', () => {
        const cells = buildRow(
            [event(-30, 30, 'A'), event(60, 90, 'B')],
            window,
            T0 + 10 * 60_000
        );
        expect(cells.map((c) => [c.title, c.left, c.width, c.isNow])).toEqual([
            ['A', 0, 300, true],
            ['No event information', 300, 300, false],
            ['B', 600, 300, false],
            ['No event information', 900, 300, false],
        ]);
    });

    it('renders an empty service as one navigable cell', () => {
        const cells = buildRow([], window, T0);
        expect(cells).toHaveLength(1);
        expect(cells[0].width).toBe(1200);
    });

    it('labels every half hour and places the now marker', () => {
        expect(timelineLabels(window).map((l) => l.left)).toEqual([
            0, 300, 600, 900,
        ]);
        expect(nowMarker(window, T0 + HALF_HOUR)).toBe(300);
        expect(nowMarker(window, T0 - 1)).toBeNull();
    });

    it('finds the cell under the cursor, falling back to the last cell', () => {
        const cells = buildRow([event(0, 30, 'A')], window, T0);
        expect(cellAt(cells, 10)).toBe(0);
        expect(cellAt(cells, 400)).toBe(1);
        expect(cellAt(cells, 5000)).toBe(1);
    });
});
