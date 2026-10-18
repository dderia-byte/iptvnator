import { effect, inject, Injectable, Signal, untracked } from '@angular/core';
import { ResolvedPortalPlayback } from '@iptvnator/shared/interfaces';
import { SlykNavService, SlykPlayerFrame } from './slyk-nav.service';
import { SlykTvService } from './slyk-tv.service';

/**
 * Bridge exposed by the Slyk Q Fire TV app (`addJavascriptInterface`). The
 * app plays streams in the device's own player (ExoPlayer on MediaCodec, so
 * HEVC, Dolby AC-3/E-AC-3 and 4K decode in hardware) underneath a transparent
 * WebView that shows the receiver screens.
 */
export interface SlykNativeBridge {
    play(request: string): void;
    stop(): void;
    /** Picture rectangle in CSS pixels of the WebView viewport. */
    setFrame(x: number, y: number, width: number, height: number): void;
}

declare global {
    interface Window {
        SlykNative?: SlykNativeBridge;
    }
}

/** Stage rectangles of the Slyk `Pig` widgets (see SlykPlayerFrame). */
const FRAME_RECTS: Record<SlykPlayerFrame, readonly number[] | null> = {
    full: [0, 0, 1920, 1080],
    pig: [39, 125, 486, 285],
    guide: [0, 0, 500, 285],
    hidden: null,
};

export interface SlykStageGeometry {
    scale: Signal<number>;
    offsetX: Signal<number>;
    offsetY: Signal<number>;
}

export interface SlykNativePlayRequest {
    url: string;
    title: string;
    live: boolean;
    headers: Record<string, string>;
}

/** Shape of the request handed to the native player. */
export function toNativePlayRequest(
    playback: ResolvedPortalPlayback
): SlykNativePlayRequest {
    return {
        url: playback.streamUrl,
        title: playback.title,
        live: playback.isLive !== false,
        headers: playback.headers ?? {},
    };
}

/** Viewport rectangle (CSS px) of a stage frame, or null when hidden. */
export function frameToViewport(
    frame: SlykPlayerFrame,
    geometry: { scale: number; offsetX: number; offsetY: number }
): number[] | null {
    const rect = FRAME_RECTS[frame];
    if (!rect) {
        return null;
    }
    const [x, y, w, h] = rect;
    const { scale, offsetX, offsetY } = geometry;
    return [offsetX + x * scale, offsetY + y * scale, w * scale, h * scale];
}

@Injectable()
export class SlykNativeService {
    private readonly tv = inject(SlykTvService);
    private readonly nav = inject(SlykNavService);
    private readonly bridge = window.SlykNative ?? null;

    /** True inside the Fire TV app: the picture is drawn natively. */
    readonly active = !!this.bridge;

    bind(geometry: SlykStageGeometry): void {
        const bridge = this.bridge;
        if (!bridge) {
            return;
        }
        document.body.classList.add('slyk-native-host');
        effect(() => {
            const playback = this.tv.playback();
            untracked(() =>
                playback
                    ? bridge.play(JSON.stringify(toNativePlayRequest(playback)))
                    : bridge.stop()
            );
        });
        effect(() => {
            const rect = frameToViewport(this.nav.frame(), {
                scale: geometry.scale(),
                offsetX: geometry.offsetX(),
                offsetY: geometry.offsetY(),
            });
            untracked(() =>
                rect ? bridge.setFrame(rect[0], rect[1], rect[2], rect[3]) : bridge.setFrame(0, 0, 0, 0)
            );
        });
    }
}
