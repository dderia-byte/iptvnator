import { Injector, runInInjectionContext } from '@angular/core';
import { Actions } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { StorageMap } from '@ngx-pwa/local-storage';
import { EpgService } from '@iptvnator/epg/data-access';
import { DataService } from '@iptvnator/services';
import {
    Channel,
    OPEN_VLC_PLAYER,
    VideoPlayer,
} from '@iptvnator/shared/interfaces';
import { of, Subject } from 'rxjs';
import { ChannelActions } from './actions';
import { PlaylistEffects } from './effects';

/**
 * `setActiveChannel$` hands a channel to MPV/VLC when one is the selected
 * player. `inAppOnly` (the Slyk Q receiver) must keep playback in the app's
 * own player instead. Built without TestBed for the reason documented in
 * `add-playlist.effect.spec.ts`.
 */
describe('PlaylistEffects setActiveChannel$', () => {
    const channel = {
        id: 'one',
        url: 'https://streams.example.com/one.m3u8',
        name: 'One',
        group: { title: '' },
        tvg: { id: '', name: '', url: '', logo: '', rec: '' },
        http: { referrer: '', 'user-agent': '', origin: '' },
        radio: 'false',
    } as Channel;

    let actions$: Subject<unknown>;
    let sent: string[];

    beforeEach(() => {
        actions$ = new Subject();
        sent = [];
        const injector = Injector.create({
            parent: { get: () => ({}) } as unknown as Injector,
            providers: [
                { provide: Actions, useValue: new Actions(actions$) },
                { provide: Store, useValue: { select: () => of(null) } },
                {
                    provide: StorageMap,
                    useValue: { get: () => of({ player: VideoPlayer.VLC }) },
                },
                {
                    provide: DataService,
                    useValue: { sendIpcEvent: (type: string) => sent.push(type) },
                },
                {
                    provide: EpgService,
                    useValue: { getChannelPrograms: jest.fn() },
                },
            ],
        });
        const effects = runInInjectionContext(
            injector,
            () => new PlaylistEffects()
        );
        effects.setActiveChannel$.subscribe();
    });

    const flush = () => new Promise((resolve) => setTimeout(resolve));

    it('launches the selected external player for a normal activation', async () => {
        actions$.next(
            ChannelActions.setActiveChannel({ channel, startPlayback: true })
        );
        await flush();
        expect(sent).toEqual([OPEN_VLC_PLAYER]);
    });

    it('keeps an in-app-only activation in the app', async () => {
        actions$.next(
            ChannelActions.setActiveChannel({
                channel,
                startPlayback: true,
                inAppOnly: true,
            })
        );
        await flush();
        expect(sent).toEqual([]);
    });
});
