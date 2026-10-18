import { pageIndex, toSlykKey, wrapIndex } from './slyk-keys';

const press = (key: string, init: KeyboardEventInit = {}) =>
    toSlykKey(new KeyboardEvent('keydown', { key, ...init }));

describe('slyk keys', () => {
    it('maps keyboard and TV remote keys to receiver keys', () => {
        expect(press('ArrowUp')?.key).toBe('up');
        expect(press('Enter')?.key).toBe('ok');
        expect(press('GoBack')?.key).toBe('back');
        expect(press('ChannelUp')?.key).toBe('channelUp');
        expect(press('PageDown')?.key).toBe('channelDown');
        expect(press('Guide')?.key).toBe('epg');
        expect(press('G')?.key).toBe('epg');
        expect(press('ColorF0Red')?.key).toBe('red');
        expect(press('F4')?.key).toBe('blue');
    });

    it('reports digits with their value', () => {
        expect(press('7')).toEqual({ key: 'digit', digit: 7 });
    });

    it('ignores unmapped keys and modified shortcuts', () => {
        expect(press('q')).toBeNull();
        expect(press('g', { ctrlKey: true })).toBeNull();
    });

    it('wraps list cursors and clamps page steps', () => {
        expect(wrapIndex(0, -1, 5)).toBe(4);
        expect(wrapIndex(4, 1, 5)).toBe(0);
        expect(wrapIndex(0, 1, 0)).toBe(0);
        expect(pageIndex(3, 1, 11, 20)).toBe(14);
        expect(pageIndex(15, 1, 11, 20)).toBe(19);
        expect(pageIndex(3, -1, 11, 20)).toBe(0);
    });
});
