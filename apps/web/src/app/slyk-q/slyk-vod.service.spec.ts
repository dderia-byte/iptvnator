import { splitVodName } from './slyk-vod.service';

describe('splitVodName', () => {
    it('drops provider prefixes and country tags and keeps the year', () => {
        expect(splitVodName('4K-TOP - Practical Magic 2 (2026)')).toEqual({
            title: 'Practical Magic 2',
            year: '2026',
        });
        expect(splitVodName('4K-NF - Black Doves (2024) (GB)')).toEqual({
            title: 'Black Doves',
            year: '2024',
        });
        expect(splitVodName('Heat')).toEqual({ title: 'Heat', year: '' });
    });
});
