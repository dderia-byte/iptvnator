import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Channel } from '@iptvnator/shared/interfaces';
import { SlykEpgService } from './slyk-epg.service';
import { SlykGuideState } from './slyk-guide-state';

const channels = ['A', 'B', 'C', 'D', 'E'].map(
    (name) => ({ id: name, name, url: name }) as Channel
);
const epg = {
    now: signal(Date.UTC(2026, 9, 19, 21, 52)),
    between: () => [],
    load: async () => undefined,
} as unknown as SlykEpgService;

function pinnedGuide(rows: number): SlykGuideState {
    return TestBed.runInInjectionContext(
        () => new SlykGuideState(signal(channels), epg, rows, 900, 3 * 1_800_000, true)
    );
}

describe('SlykGuideState pinned (Sky Q)', () => {
    it('keeps the focused channel on the top row and wraps the list', () => {
        const guide = pinnedGuide(3);
        guide.move('down');
        guide.move('down');
        expect(guide.rows().map((r) => r.channel.name)).toEqual(['C', 'D', 'E']);
        expect(guide.selectedRow()).toBe(0);
        guide.move('down');
        guide.move('down');
        expect(guide.rows().map((r) => r.channel.name)).toEqual(['E', 'A', 'B']);
        expect(guide.channelAtRow(1)).toBe(0);
    });

    it('wraps from the first channel to the last going up', () => {
        const guide = pinnedGuide(3);
        guide.move('up');
        expect(guide.selectedChannel()?.name).toBe('E');
    });
});
