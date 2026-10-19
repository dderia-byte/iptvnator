import { Channel } from '@iptvnator/shared/interfaces';
import { epgNameKey, XtreamEpgIndex } from './slyk-xtream-epg';

const channel = (streamId: number, name: string, epgId = ''): Channel =>
    ({ id: `xtream-live-${streamId}`, name, url: `u${streamId}`, tvg: { id: epgId } }) as Channel;

describe('epgNameKey', () => {
    it('matches feeds of the same channel across prefixes and tags', () => {
        expect(epgNameKey('4K: SKY SPORTS MAIN EVENTS ᵁᴴᴰ ³⁸⁴⁰ᴾ')).toBe(
            epgNameKey('VIP: SKY SPORTS MAIN EVENT ᴴᴰ')
        );
        expect(epgNameKey('UK: UK: SKY ONE HEVC 4K')).toBe('skyone');
        expect(epgNameKey('UK: DISCOVERY HISTORY +1')).toBe('discoveryhistory+1');
    });
});

describe('XtreamEpgIndex', () => {
    it('lends a listed feed its EPG id to unlisted copies', () => {
        const index = new XtreamEpgIndex([
            channel(1, 'UK: SKY SPORTS MAIN EVENT HD', 'SkySportsMainEvent.uk'),
            channel(2, 'VIP: SKY SPORTS MAIN EVENT ᴴᴰ', 'SkySportsMainEvent.uk'),
            channel(3, 'NOW: SKY SPORTS MAIN EVENT ᴿᴬᵂ', 'skysportsmainevent.uk'),
            channel(4, '4K: SKY SPORTS MAIN EVENTS ᵁᴴᴰ'),
            channel(5, 'UK: RELAX 1'),
        ]);
        expect(index.epgId(channel(4, '4K: SKY SPORTS MAIN EVENTS ᵁᴴᴰ'))).toBe(
            'SkySportsMainEvent.uk'
        );
        expect(index.streamId('SkySportsMainEvent.uk')).toBe(1);
        expect(index.epgId(channel(5, 'UK: RELAX 1'))).toBeNull();
    });
});
