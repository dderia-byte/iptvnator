import {
    ChangeDetectionStrategy,
    Component,
    computed,
    DestroyRef,
    inject,
    signal,
} from '@angular/core';
import { Router } from '@angular/router';
import {
    SlykButtonsComponent,
    SlykTemplateComponent,
} from '../slyk-chrome.component';
import { SlykEpgService } from '../slyk-epg.service';
import {
    slykDay,
    slykLength,
    slykResolutionBadge,
    slykStartedAt,
} from '../slyk-format';
import { HALF_HOUR } from '../slyk-grid';
import { SlykGuideColumn } from '../slyk-guide-column';
import { SlykGuideState } from '../slyk-guide-state';
import { SlykKeyPress } from '../slyk-keys';
import { SlykNavService, SlykScreen } from '../slyk-nav.service';
import { SlykTvService } from '../slyk-tv.service';

/** 7 full rows and a clipped 8th, as on Sky Q. */
const ROWS = 8;
export const GUIDE_ROW_HEIGHT = 82;
/** Channel column 520–980, programmes from 980 to the right edge. */
const GRID_LEFT = 980;
const GRID_WIDTH = 1920 - GRID_LEFT;
/** Sky Q shows about an hour and three quarters. */
const SPAN = 3.5 * HALF_HOUR;

/**
 * Sky Q TV guide: categories in the left column under the live preview, an
 * info panel for the focused programme, and a grid whose focused channel
 * stays pinned to the top row while the list scrolls under it.
 */
@Component({
    selector: 'app-slyk-guide',
    imports: [SlykTemplateComponent, SlykButtonsComponent],
    templateUrl: './slyk-guide.component.html',
    styleUrl: './slyk-guide.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SlykGuideComponent implements SlykScreen {
    private readonly router = inject(Router);
    readonly tv = inject(SlykTvService);
    readonly epg = inject(SlykEpgService);
    readonly gridLeft = GRID_LEFT;
    readonly rowHeight = GUIDE_ROW_HEIGHT;

    readonly guide = new SlykGuideState(
        this.tv.bouquetChannels,
        this.epg,
        ROWS,
        GRID_WIDTH,
        SPAN,
        true
    );
    readonly column = new SlykGuideColumn(this.tv);
    /** Where the remote's arrows act: the category column or the grid. */
    readonly area = signal<'column' | 'grid'>('grid');

    readonly cell = this.guide.selectedCell;
    readonly event = computed(() => this.cell()?.event ?? null);
    readonly channel = this.guide.selectedChannel;
    readonly channelName = computed(() => this.tv.displayName(this.channel()));
    readonly badge = computed(() => slykResolutionBadge(this.channel()?.name ?? ''));
    readonly length = computed(() => slykLength(this.event()));
    readonly startedAt = computed(() => slykStartedAt(this.event(), this.epg.now()));
    readonly day = computed(() => slykDay(this.guide.startMs(), this.epg.now()));

    constructor() {
        inject(SlykNavService).register(this, inject(DestroyRef), 'pig');
        this.column.syncToBouquet();
        // Opens on the playing channel when the category lists it.
        this.guide.focus(this.tv.activeChannel());
    }

    channelAt(row: number) {
        return this.guide.rows()[row]?.channel ?? null;
    }

    /** Programmes already running when the window opens are dimmed. */
    isPast(row: number, cellIndex: number): boolean {
        const event = this.guide.rows()[row]?.cells[cellIndex]?.event;
        return !!event && event.startMs < this.guide.startMs();
    }

    pickRow(row: number): void {
        this.area.set('grid');
        this.guide.channelIndex.set(this.guide.channelAtRow(row));
    }

    pick(row: number, x: number): void {
        this.pickRow(row);
        this.guide.cursorX.set(x);
    }

    pickColumn(index: number): void {
        this.area.set('column');
        this.column.choose(index);
        this.guide.channelIndex.set(0);
    }

    /** OK: tune to the focused channel; OK on the playing one goes full screen. */
    activate(): void {
        const channel = this.channel();
        if (!channel) {
            return;
        }
        const active = this.tv.activeChannel();
        if (active?.id === channel.id && active.url === channel.url) {
            void this.router.navigateByUrl('/tv/watch');
        } else {
            this.tv.play(channel);
        }
    }

    onKey(press: SlykKeyPress): boolean {
        return this.area() === 'column' ? this.onColumnKey(press) : this.onGridKey(press);
    }

    private onColumnKey({ key }: SlykKeyPress): boolean {
        switch (key) {
            case 'up':
            case 'down':
                this.column.move(key === 'up' ? -1 : 1);
                this.guide.channelIndex.set(0);
                return true;
            case 'ok':
                this.column.choose();
                this.guide.channelIndex.set(0);
                return true;
            case 'right':
            case 'back':
                this.area.set('grid');
                return true;
            case 'epg':
                return true;
            default:
                return false;
        }
    }

    private onGridKey({ key }: SlykKeyPress): boolean {
        // Left from the first programme of the current window enters the
        // category column; otherwise it steps back through time.
        if (key === 'left' && this.guide.atNow() && this.guide.selectedCellIndex() === 0) {
            this.area.set('column');
            return true;
        }
        if (this.guide.move(key)) {
            return true;
        }
        switch (key) {
            case 'ok':
                this.activate();
                return true;
            case 'green':
                void this.router.navigateByUrl('/tv/watch');
                return true;
            case 'red':
                this.area.set('column');
                return true;
            case 'epg':
                return true;
            default:
                return false;
        }
    }
}
