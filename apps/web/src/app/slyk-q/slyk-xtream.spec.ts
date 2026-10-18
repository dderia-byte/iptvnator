import {
    isXtreamLiveChannel,
    xtreamM3uUrl,
    xtreamXmltvUrl,
} from './slyk-xtream';

const account = {
    serverUrl: 'http://provider.example:8080/',
    username: 'me@home',
    password: 'p&ss word',
};

describe('slyk xtream', () => {
    it('builds the account M3U export and XMLTV links with encoded credentials', () => {
        expect(xtreamM3uUrl(account)).toBe(
            'http://provider.example:8080/get.php?username=me%40home&password=p%26ss%20word&type=m3u_plus&output=ts'
        );
        expect(xtreamXmltvUrl(account)).toBe(
            'http://provider.example:8080/xmltv.php?username=me%40home&password=p%26ss%20word'
        );
    });

    it('keeps live streams and drops films and series', () => {
        expect(isXtreamLiveChannel({ url: 'http://h/live/u/p/1.ts' })).toBe(true);
        expect(isXtreamLiveChannel({ url: 'http://h/u/p/1' })).toBe(true);
        expect(isXtreamLiveChannel({ url: 'http://h/movie/u/p/9.mp4' })).toBe(false);
        expect(isXtreamLiveChannel({ url: 'http://h/series/u/p/9.mkv' })).toBe(false);
    });
});
