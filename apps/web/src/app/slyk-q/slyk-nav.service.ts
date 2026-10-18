import { DestroyRef, Injectable, signal } from '@angular/core';
import { SlykKey, SlykKeyPress } from './slyk-keys';

const POINTER_IDLE_MS = 3000;

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
    /** True while the mouse has moved recently; hides again when idle. */
    readonly pointerActive = signal(false);
    private readonly stack: SlykScreen[] = [];
    private globalKeys: (key: SlykKey) => boolean = () => false;
    private pointerTimer?: ReturnType<typeof setTimeout>;

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

    /** Receiver-wide fallback for keys the top screen leaves unhandled. */
    setGlobalKeys(handler: (key: SlykKey) => boolean): void {
        this.globalKeys = handler;
    }

    dispatch(press: SlykKeyPress): boolean {
        const top = this.stack[this.stack.length - 1];
        return (top ? top.onKey(press) : false) || this.globalKeys(press.key);
    }

    /** A remote key pressed with the mouse (on-screen buttons, wheel). */
    press(key: SlykKey): boolean {
        return this.dispatch({ key, digit: null });
    }

    pointerMoved(): void {
        this.pointerActive.set(true);
        clearTimeout(this.pointerTimer);
        this.pointerTimer = setTimeout(
            () => this.pointerActive.set(false),
            POINTER_IDLE_MS
        );
    }
}
