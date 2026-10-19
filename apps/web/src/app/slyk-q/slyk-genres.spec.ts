import { classifyChannel, cleanGroupLabel } from './slyk-genres';

const ch = (group: string, name = 'Channel') =>
    classifyChannel({ name, group: { title: group } });

describe('slyk genres', () => {
    it('sorts provider groups into Sky categories', () => {
        expect(ch('UK | SPORTS')).toBe('Sports');
        expect(ch('AR| BEIN SPORTS HD')).toBe('Sports');
        expect(ch('UK | MOVIES')).toBe('Movies');
        expect(ch('Kids TV')).toBe('Kids');
        expect(ch('UK | NEWS')).toBe('News');
        expect(ch('Documentaries')).toBe('Documentaries');
        expect(ch('UK | MUSIC')).toBe('Music');
        expect(ch('UK | ENTERTAINMENT')).toBe('Entertainment');
        expect(ch('Religious')).toBe('Religious');
    });

    it('prefers the subject over the 4K label', () => {
        expect(ch('4K UHD', '4K: SKY SPORTS F1')).toBe('Sports');
        expect(ch('4K UHD', '4K: UHD DEMO 1')).toBe('UHD & 4K');
    });

    it('falls back to the channel name for vague groups', () => {
        expect(ch('UK | VIP', 'Sky Sports Main Event')).toBe('Sports');
        expect(ch('UK | VIP', 'BBC News HD')).toBe('News');
        expect(ch('UK | VIP', 'Cartoon Network')).toBe('Kids');
        expect(ch('AR| KUWAIT', 'Al Adalah TV')).toBe('Other Channels');
    });
});

describe('cleanGroupLabel', () => {
    it('drops the country prefix and superscript decorations', () => {
        expect(cleanGroupLabel('UK| SPORTS \u1D34\u1D30')).toBe('SPORTS');
        expect(cleanGroupLabel('DE : FILME')).toBe('FILME');
        expect(cleanGroupLabel('Kids TV')).toBe('Kids TV');
    });
});
