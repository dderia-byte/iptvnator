import { DestroyRef, Injectable, signal } from '@angular/core';
import { SlykKeyPress } from './slyk-keys';

/**
 * Where the live picture sits on the 1920×1080 stage. The positions are the
 * Slyk Q `Pig` widgets: `pig` is the template1 "tv" panel (39,125 486×285),
 * `guide` the GraphicalEPGPIG corner (0,0 500×285).
 */
export type SlykPlayerFrame = 'full' | 'pig' | 'guide' | 'hidden';

export interface SlykScreen {
    /** Returns true when the key was consumed. */
    onKey(press: SlykKeyPress): boolean;
}

/** Routes remote keys to the screen on top and owns the picture frame. */
@Injectable()
export class SlykNavService {
    readonly frame = signal<SlykPlayerFrame>('pig');
    private readonly stack: SlykScreen[] = [];

    /** Registers a screen (or overlay) until its injector is destroyed. */
    register(
        screen: SlykScreen,
        destroyRef: DestroyRef,
        frame?: SlykPlayerFrame
    ): void {
        this.stack.push(screen);
        if (frame) {
            this.frame.set(frame);
        }
        destroyRef.onDestroy(() => {
            const index = this.stack.lastIndexOf(screen);
            if (index >= 0) {
                this.stack.splice(index, 1);
            }
        });
    }

    dispatch(press: SlykKeyPress): boolean {
        const top = this.stack[this.stack.length - 1];
        return top ? top.onKey(press) : false;
    }
}
