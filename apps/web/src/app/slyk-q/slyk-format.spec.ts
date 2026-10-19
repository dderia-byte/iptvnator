import { cleanChannelName, slykLength, slykResolutionBadge, slykStartedAt, slykTime } from './slyk-format';

describe('channel name helpers', () => {
    it('drops superscript tags and symbols from the shown name', () => {
        expect(cleanChannelName('UK: SKY SPORTS MAIN EVENT ᴴᴰ ◉')).toBe(
            'UK: SKY SPORTS MAIN EVENT'
        );
        expect(cleanChannelName('BBC ONE')).toBe('BBC ONE');
    });

    it('reads superscript tags for the resolution badge', () => {
        expect(slykResolutionBadge('4K: SKY SPORTS ᵁᴴᴰ ³⁸⁴⁰ᴾ')).toBe('UHD');
        expect(slykResolutionBadge('SKY ONE ᴴᴰ')).toBe('HD');
        expect(slykResolutionBadge('DAVE')).toBe('SD');
    });
});

describe('Sky Q time formats', () => {
    const at = (h: number, m: number, dayOffset = 0) =>
        new Date(2026, 9, 19 + dayOffset, h, m).getTime();
    const event = (start: number, stop: number) =>
        ({ startMs: start, stopMs: stop }) as Parameters<typeof slykLength>[0];

    it('writes clock times the Sky way', () => {
        expect(slykTime(at(21, 52))).toBe('9.52pm');
        expect(slykTime(at(0, 5))).toBe('12.05am');
        expect(slykTime(at(12, 0))).toBe('12.00pm');
    });

    it('writes durations as hours and minutes', () => {
        expect(slykLength(event(at(21, 40), at(22, 55)))).toBe('1h 15m');
        expect(slykLength(event(at(21, 0), at(21, 45)))).toBe('45m');
        expect(slykLength(event(at(21, 0), at(23, 0)))).toBe('2h');
    });

    it('says when a programme started or starts', () => {
        const now = at(21, 52);
        expect(slykStartedAt(event(at(21, 40), at(22, 55)), now)).toBe('Started at 9.40pm');
        expect(slykStartedAt(event(at(22, 55), at(23, 30)), now)).toBe('Starts at 10.55pm');
        expect(slykStartedAt(event(at(17, 0, 1), at(18, 0, 1)), now)).toBe('Tomorrow, 5.00pm');
    });
});
