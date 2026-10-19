import {
    computed,
    effect,
    Signal,
    signal,
    WritableSignal,
} from '@angular/core';
import { Channel } from '@iptvnator/shared/interfaces';
import { SlykEpgService } from './slyk-epg.service';
import {
    buildRow,
    cellAt,
    HALF_HOUR,
    nowMarker,
    SlykGridCell,
    SlykGridWindow,
    timelineLabels,
    windowStart,
} from './slyk-grid';
import { SlykKey, pageIndex, wrapIndex } from './slyk-keys';

export interface SlykGuideRow {
    channel: Channel;
    cells: SlykGridCell[];
}

const DAY = 24 * 60 * 60_000;

/**
 * Cursor and window state shared by the full GraphicalEPG and the infobar
 * mini guide. The cursor keeps its horizontal position while moving between
 * services, as the Enigma2 graphical EPG does.
 */
export class SlykGuideState {
    readonly channelIndex = signal(0);
    readonly startMs: WritableSignal<number>;
    /** Cursor x inside the grid; the selected cell is the one under it. */
    readonly cursorX = signal(0);

    readonly window = computed<SlykGridWindow>(() => ({
        fromMs: this.startMs(),
        toMs: this.startMs() + this.spanMs,
        width: this.gridWidth,
    }));
    /**
     * First row shown. Sky Q pins the focused channel to the top row and
     * scrolls the list under it; Enigma2 pages through fixed screens.
     */
    readonly pageStart = computed(() =>
        this.pinned
            ? this.channelIndex()
            : Math.floor(this.channelIndex() / this.pageSize) * this.pageSize
    );
    /** Channels on screen, wrapping past the end when pinned. */
    readonly visibleChannels = computed(() => {
        const channels = this.channels();
        if (!this.pinned) {
            return channels.slice(this.pageStart(), this.pageStart() + this.pageSize);
        }
        const count = Math.min(this.pageSize, channels.length);
        return Array.from(
            { length: count },
            (_, i) => channels[(this.pageStart() + i) % channels.length]
        );
    });
    readonly rows = computed<SlykGuideRow[]>(() => {
        const window = this.window();
        const now = this.epg.now();
        return this.visibleChannels().map((channel) => ({
                channel,
                cells: buildRow(
                    this.epg.between(channel, window.fromMs, window.toMs),
                    window,
                    now
                ),
            }));
    });
    readonly selectedRow = computed(
        () => this.channelIndex() - this.pageStart()
    );
    readonly selectedCells = computed(
        () => this.rows()[this.selectedRow()]?.cells ?? []
    );
    readonly selectedCellIndex = computed(() =>
        cellAt(this.selectedCells(), this.cursorX())
    );
    readonly selectedCell = computed(
        () => this.selectedCells()[this.selectedCellIndex()] ?? null
    );
    readonly selectedChannel = computed(
        () => this.channels()[this.channelIndex()] ?? null
    );
    readonly labels = computed(() => timelineLabels(this.window()));
    readonly nowX = computed(() => nowMarker(this.window(), this.epg.now()));

    constructor(
        private readonly channels: Signal<Channel[]>,
        private readonly epg: SlykEpgService,
        private readonly pageSize: number,
        private readonly gridWidth: number,
        private readonly spanMs = 4 * HALF_HOUR,
        private readonly pinned = false
    ) {
        const start = windowStart(epg.now());
        this.startMs = signal(start);
        this.cursorX.set(nowMarker(this.window(), epg.now()) ?? 0);
        effect(() => void this.epg.load(this.visibleChannels()));
    }

    /** Index of the channel shown on row `row`. */
    channelAtRow(row: number): number {
        const length = this.channels().length;
        return length ? (this.pageStart() + row) % length : 0;
    }

    /** True while the window starts at the current half hour. */
    readonly atNow = computed(() => this.startMs() <= windowStart(this.epg.now()));

    /** Puts the cursor on `channel` (e.g. the playing service). */
    focus(channel: Channel | null | undefined): void {
        const index = channel
            ? this.channels().findIndex(
                  (c) => c.id === channel.id && c.url === channel.url
              )
            : -1;
        this.channelIndex.set(Math.max(0, index));
    }

    /** Applies a navigation key; returns false when the key is not handled. */
    move(key: SlykKey): boolean {
        const length = this.channels().length;
        switch (key) {
            case 'up':
            case 'down':
                this.channelIndex.update((i) =>
                    wrapIndex(i, key === 'up' ? -1 : 1, length)
                );
                return true;
            case 'channelUp':
            case 'channelDown':
                this.channelIndex.update((i) =>
                    pageIndex(i, key === 'channelUp' ? -1 : 1, this.pageSize, length)
                );
                return true;
            case 'left':
                this.stepCell(-1);
                return true;
            case 'right':
                this.stepCell(1);
                return true;
            case 'yellow':
                this.shiftWindow(-DAY);
                return true;
            case 'blue':
                this.shiftWindow(DAY);
                return true;
            default:
                return false;
        }
    }

    private stepCell(delta: 1 | -1): void {
        const cells = this.selectedCells();
        const target = this.selectedCellIndex() + delta;
        if (target >= 0 && target < cells.length) {
            const cell = cells[target];
            this.cursorX.set(cell.left + Math.min(cell.width / 2, 40));
            return;
        }
        // Past the edge: scroll the window by half an hour, as the receiver.
        this.shiftWindow(delta * HALF_HOUR);
        this.cursorX.set(delta < 0 ? 1 : this.gridWidth - 1);
    }

    private shiftWindow(deltaMs: number): void {
        const earliest = windowStart(this.epg.now()) - DAY;
        this.startMs.update((start) => Math.max(earliest, start + deltaMs));
    }
}
