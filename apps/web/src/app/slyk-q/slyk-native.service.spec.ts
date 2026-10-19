import { ResolvedPortalPlayback } from '@iptvnator/shared/interfaces';
import { frameToViewport, toNativePlayRequest } from './slyk-native.service';

describe('slyk native bridge', () => {
    it('maps Pig frames from stage to viewport pixels', () => {
        // 1280×720 window: stage scaled by 2/3 with no letterbox.
        const geometry = { scale: 2 / 3, offsetX: 0, offsetY: 0 };
        expect(frameToViewport('full', geometry)).toEqual([0, 0, 1280, 720]);
        expect(frameToViewport('pig', geometry)).toEqual([0, 250 / 3, 1000 / 3, 190]);
        expect(frameToViewport('hidden', geometry)).toBeNull();
    });

    it('adds the letterbox offset', () => {
        const rect = frameToViewport('guide', { scale: 1, offsetX: 10, offsetY: 20 });
        expect(rect).toEqual([10, 20, 500, 285]);
    });

    it('hands the device player the stream, title and headers', () => {
        const playback: ResolvedPortalPlayback = {
            streamUrl: 'http://h/live/u/p/1.ts',
            title: 'One',
            isLive: true,
            headers: { 'User-Agent': 'UA' },
        };
        expect(toNativePlayRequest(playback)).toEqual({
            url: 'http://h/live/u/p/1.ts',
            title: 'One',
            live: true,
            headers: { 'User-Agent': 'UA' },
        });
        expect(
            toNativePlayRequest({ streamUrl: 'u', title: 't', isLive: false })
                .live
        ).toBe(false);
    });
});
