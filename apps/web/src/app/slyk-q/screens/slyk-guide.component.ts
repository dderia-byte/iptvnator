import {
    ChangeDetectionStrategy,
    Component,
    computed,
    DestroyRef,
    inject,
} from '@angular/core';
import { Router } from '@angular/router';
import {
    SlykButtonsComponent,
    SlykPiconComponent,
} from '../slyk-chrome.component';
import { SlykEpgService } from '../slyk-epg.service';
import {
    slykDate,
    slykLength,
    slykResolutionBadge,
    slykStartedAt,
} from '../slyk-format';
import { SlykGuideState } from '../slyk-guide-state';
import { SlykKeyPress } from '../slyk-keys';
import { SlykNavService, SlykScreen } from '../slyk-nav.service';
import { SlykTvService } from '../slyk-tv.service';

/** list: 0,385 1920×633, NumberOfRows 10; service column 490 wide. */
const ROWS = 10;
const SERVICE_WIDTH = 490;
const GRID_WIDTH = 1920 - SERVICE_WIDTH;

/** Slyk Q `GraphicalEPGPIG`: the full-screen grid guide with picture. */
@Component({
    selector: 'app-slyk-guide',
    imports: [SlykButtonsComponent, SlykPiconComponent],
    templateUrl: './slyk-guide.component.html',
    styleUrl: './slyk-guide.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SlykGuideComponent implements SlykScreen {
    private readonly router = inject(Router);
    readonly tv = inject(SlykTvService);
    readonly epg = inject(SlykEpgService);
    readonly serviceWidth = SERVICE_WIDTH;
    readonly rowHeight = 633 / ROWS;

    readonly guide = new SlykGuideState(
        this.tv.bouquetChannels,
        this.epg,
        ROWS,
        GRID_WIDTH
    );

    readonly event = computed(() => this.guide.selectedCell()?.event ?? null);
    readonly channel = this.guide.selectedChannel;
    readonly channelName = computed(() => this.tv.displayName(this.channel()));
    readonly badge = computed(() => slykResolutionBadge(this.channelName()));
    readonly length = computed(() => slykLength(this.event()));
    readonly startedAt = computed(() =>
        slykStartedAt(this.event(), this.epg.now())
    );
    readonly date = computed(() => slykDate(this.guide.startMs()));
    readonly playingName = computed(() =>
        this.tv.displayName(this.tv.activeChannel())
    );
    readonly buttons = ['Categories', 'Watch', '-24 hrs', '+24 hrs'];

    constructor() {
        inject(SlykNavService).register(this, inject(DestroyRef), 'guide');
        // Opens on the category chosen in the guide menu; the cursor starts
        // on the playing channel when that category lists it.
        this.guide.focus(this.tv.activeChannel());
    }

    isPlaying(index: number): boolean {
        const active = this.tv.activeChannel();
        const channel = this.guide.rows()[index]?.channel;
        return !!active && !!channel && channel.id === active.id && channel.url === active.url;
    }

    pickRow(row: number): void {
        this.guide.channelIndex.set(this.guide.pageStart() + row);
    }

    pick(row: number, x: number): void {
        this.guide.channelIndex.set(this.guide.pageStart() + row);
        this.guide.cursorX.set(x);
    }

    /** OK: zap into the PiG; OK on the playing service goes full screen. */
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

    onKey({ key }: SlykKeyPress): boolean {
        if (this.guide.move(key)) {
            return true;
        }
        switch (key) {
            case 'ok':
                this.activate();
                return true;
            case 'red':
                void this.router.navigateByUrl('/tv/guide-menu');
                return true;
            case 'green':
                void this.router.navigateByUrl('/tv/watch');
                return true;
            case 'epg':
            case 'back':
                // Back steps out to the category list, as on Sky.
                void this.router.navigateByUrl('/tv/guide-menu');
                return true;
            default:
                return false;
        }
    }
}
