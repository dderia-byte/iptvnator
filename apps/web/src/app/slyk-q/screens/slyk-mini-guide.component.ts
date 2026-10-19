import { SlykLogoComponent } from '../slyk-logo.component';
import {
    ChangeDetectionStrategy,
    Component,
    computed,
    DestroyRef,
    inject,
    output,
} from '@angular/core';
import { SlykButtonsComponent } from '../slyk-chrome.component';
import { SlykEpgService } from '../slyk-epg.service';
import { slykDate } from '../slyk-format';
import { SlykGuideState } from '../slyk-guide-state';
import { SlykKeyPress } from '../slyk-keys';
import { SlykNavService, SlykScreen } from '../slyk-nav.service';
import { SlykTvService } from '../slyk-tv.service';

/** list: 0,795 1920×220 (4 rows); bouquetlist/service column 375 wide. */
const ROWS = 4;
const SERVICE_WIDTH = 375;

/** Slyk Q `GraphicalInfoBarEPG`: the mini TV guide over live TV. */
@Component({
    selector: 'app-slyk-mini-guide',
    imports: [SlykLogoComponent, SlykButtonsComponent],
    templateUrl: './slyk-mini-guide.component.html',
    styleUrl: './slyk-mini-guide.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SlykMiniGuideComponent implements SlykScreen {
    readonly tv = inject(SlykTvService);
    readonly epg = inject(SlykEpgService);
    readonly closed = output<void>();
    readonly serviceWidth = SERVICE_WIDTH;
    readonly rowHeight = 220 / ROWS;

    readonly guide = new SlykGuideState(
        this.tv.bouquetChannels,
        this.epg,
        ROWS,
        1920 - SERVICE_WIDTH
    );
    readonly date = computed(() => slykDate(this.epg.now()));
    readonly buttons = ['', 'Watch', '-24 hrs', '+24 hrs'];

    constructor() {
        inject(SlykNavService).register(this, inject(DestroyRef));
        this.tv.showBouquetWithActive();
        this.guide.focus(this.tv.activeChannel());
    }

    pickRow(row: number): void {
        this.guide.channelIndex.set(this.guide.pageStart() + row);
    }

    pick(row: number, x: number): void {
        this.pickRow(row);
        this.guide.cursorX.set(x);
    }

    /** Zaps to the highlighted service and closes the guide. */
    watch(): void {
        const channel = this.guide.selectedChannel();
        if (channel) {
            this.tv.play(channel);
        }
        this.closed.emit();
    }

    onKey({ key }: SlykKeyPress): boolean {
        if (this.guide.move(key)) {
            return true;
        }
        switch (key) {
            case 'ok':
            case 'green':
                this.watch();
                return true;
            case 'back':
            case 'info':
                this.closed.emit();
                return true;
            default:
                return false;
        }
    }
}
