import { computed, inject, Injectable, signal } from '@angular/core';
import { RuntimeCapabilitiesService, SettingsStore } from '@iptvnator/services';
import { isDashChannel } from '@iptvnator/shared/m3u-utils';
import {
    Channel,
    EmbeddedMpvSupport,
    VideoPlayer,
} from '@iptvnator/shared/interfaces';

/**
 * Which engine draws the receiver's picture.
 *
 * Embedded MPV decodes what Chromium cannot (HEVC on any GPU, Dolby AC-3 /
 * E-AC-3 audio), so it is the receiver's engine whenever it can render into
 * the page: the frame-copy engine paints a canvas, keeping the infobar and
 * guides above the picture. The native-view engine floats an OS window over
 * the page instead, which would cover them, so the receiver never uses it.
 * Without frame copy the built-in web players are used; MPV/VLC open their
 * own windows and stay a Classic View choice.
 */
@Injectable()
export class SlykPlayerService {
    private readonly settingsStore = inject(SettingsStore);
    private readonly runtime = inject(RuntimeCapabilitiesService);

    readonly mpvSupport = signal<EmbeddedMpvSupport | null>(null);
    /** Frame copy was just switched on and needs one app restart. */
    readonly restartNotice = signal(false);

    readonly frameCopyActive = computed(() => {
        const support = this.mpvSupport();
        return !!support?.supported && support.engine === 'frame-copy';
    });

    constructor() {
        if (!this.runtime.supportsEmbeddedMpv) {
            return;
        }
        void window.electron
            ?.getEmbeddedMpvSupport?.()
            .then((support) => {
                this.mpvSupport.set(support);
                void this.enableFrameCopyOnce(support);
            })
            .catch(() => undefined);
    }

    playerFor(channel: Channel | null | undefined): VideoPlayer | null {
        const selected = this.settingsStore.player();
        if (this.frameCopyActive()) {
            return VideoPlayer.EmbeddedMpv;
        }
        if (isDashChannel(channel)) {
            return selected === VideoPlayer.ArtPlayer
                ? VideoPlayer.ArtPlayer
                : VideoPlayer.Html5Player;
        }
        return selected === VideoPlayer.MPV ||
            selected === VideoPlayer.VLC ||
            selected === VideoPlayer.EmbeddedMpv
            ? VideoPlayer.VideoJs
            : null;
    }

    dismissRestartNotice(): void {
        this.restartNotice.set(false);
    }

    /**
     * Turns the frame-copy engine on the first time the receiver finds it
     * available (settings default it to off, so "never chosen" is tracked
     * here). Only once: switching it off later in Classic View settings
     * sticks. The engine is fixed at window creation, so it takes effect
     * after one restart.
     */
    private async enableFrameCopyOnce(support: EmbeddedMpvSupport) {
        if (
            !support.supported ||
            !support.frameCopyAvailable ||
            support.engine === 'frame-copy' ||
            readFlag(FRAME_COPY_OFFERED_KEY)
        ) {
            return;
        }
        writeFlag(FRAME_COPY_OFFERED_KEY);
        await this.settingsStore.loadSettings();
        await this.settingsStore.updateSettings({ embeddedMpvFrameCopy: true });
        // The main process reads the engine choice from its own config at
        // window creation, as the Classic View settings save mirrors it.
        await window.electron?.updateSettings?.({ embeddedMpvFrameCopy: true });
        this.restartNotice.set(true);
    }
}

const FRAME_COPY_OFFERED_KEY = 'slyk-q-frame-copy-offered';

function readFlag(key: string): boolean {
    try {
        return localStorage.getItem(key) === '1';
    } catch {
        return true;
    }
}

function writeFlag(key: string): void {
    try {
        localStorage.setItem(key, '1');
    } catch {
        // Without storage the receiver simply never offers it again.
    }
}
