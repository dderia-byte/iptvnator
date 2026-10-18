import { Injector, runInInjectionContext, signal } from '@angular/core';
import { RuntimeCapabilitiesService, SettingsStore } from '@iptvnator/services';
import {
    Channel,
    EmbeddedMpvSupport,
    VideoPlayer,
} from '@iptvnator/shared/interfaces';
import { SlykPlayerService } from './slyk-player.service';

const hls = { url: 'http://h/live/1.m3u8' } as Channel;
const dash = { url: 'http://h/live/1.mpd' } as Channel;

function create(player: VideoPlayer, support: EmbeddedMpvSupport | null) {
    const injector = Injector.create({
        providers: [
            {
                provide: SettingsStore,
                useValue: { player: signal(player) },
            },
            {
                // Support is pushed below, so the constructor's bridge call
                // is not needed here.
                provide: RuntimeCapabilitiesService,
                useValue: { supportsEmbeddedMpv: false },
            },
        ],
    });
    const service = runInInjectionContext(
        injector,
        () => new SlykPlayerService()
    );
    service.mpvSupport.set(support);
    return service;
}

const frameCopy = {
    supported: true,
    engine: 'frame-copy',
    frameCopyAvailable: true,
} as EmbeddedMpvSupport;
const nativeView = { ...frameCopy, engine: 'native' } as EmbeddedMpvSupport;

describe('SlykPlayerService', () => {
    it('plays everything through Embedded MPV when frame copy is active', () => {
        const service = create(VideoPlayer.VideoJs, frameCopy);
        expect(service.playerFor(hls)).toBe(VideoPlayer.EmbeddedMpv);
        expect(service.playerFor(dash)).toBe(VideoPlayer.EmbeddedMpv);
    });

    it('never uses the native-view engine, which would cover the menus', () => {
        const service = create(VideoPlayer.EmbeddedMpv, nativeView);
        expect(service.playerFor(hls)).toBe(VideoPlayer.VideoJs);
    });

    it('keeps external MPV/VLC out of the receiver', () => {
        expect(create(VideoPlayer.VLC, null).playerFor(hls)).toBe(
            VideoPlayer.VideoJs
        );
        expect(create(VideoPlayer.MPV, null).playerFor(hls)).toBe(
            VideoPlayer.VideoJs
        );
    });

    it('honours the chosen web player and routes DASH to a capable one', () => {
        expect(create(VideoPlayer.ArtPlayer, null).playerFor(hls)).toBeNull();
        expect(create(VideoPlayer.VideoJs, null).playerFor(dash)).toBe(
            VideoPlayer.Html5Player
        );
        expect(create(VideoPlayer.ArtPlayer, null).playerFor(dash)).toBe(
            VideoPlayer.ArtPlayer
        );
    });
});
