import { XtreamCategory, XtreamLiveStream } from '@iptvnator/shared/interfaces';
import { xtreamLiveChannels, xtreamXmltvUrl } from './slyk-xtream';

const stream = (
    id: number,
    num: number,
    name: string,
    category: string,
    epg = ''
): XtreamLiveStream =>
    ({
        stream_id: id,
        num,
        name,
        category_id: category,
        stream_icon: `http://logo/${id}.png`,
        epg_channel_id: epg,
        stream_type: 'live',
    }) as XtreamLiveStream;

describe('slyk xtream', () => {
    it('builds the XMLTV link with encoded credentials', () => {
        expect(
            xtreamXmltvUrl({
                serverUrl: 'http://provider.example:8080/',
                username: 'me@home',
                password: 'p&ss word',
            })
        ).toBe(
            'http://provider.example:8080/xmltv.php?username=me%40home&password=p%26ss%20word'
        );
    });

    it('maps API live streams to channels in panel order with category names', () => {
        const categories = [
            { category_id: '7', category_name: 'UK | Entertainment' },
        ] as XtreamCategory[];
        const channels = xtreamLiveChannels(
            [
                stream(20, 2, 'UK: BBC Two', '7', 'bbc2.uk'),
                stream(10, 1, ' UK: BBC One ', '7', 'bbc1.uk'),
                stream(30, 3, '', '99'),
            ],
            categories,
            (id) => `http://h/live/u/p/${id}.ts`
        );

        expect(channels.map((c) => c.name)).toEqual([
            'UK: BBC One',
            'UK: BBC Two',
            'Channel 30',
        ]);
        expect(channels[0]).toMatchObject({
            id: 'xtream-live-10',
            url: 'http://h/live/u/p/10.ts',
            group: { title: 'UK | Entertainment' },
            tvg: { id: 'bbc1.uk', logo: 'http://logo/10.png' },
            radio: 'false',
        });
        expect(channels[2].group.title).toBe('');
    });
});
