import { cleanChannelName, slykResolutionBadge } from './slyk-format';

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
