import {
    ChangeDetectionStrategy,
    Component,
    computed,
    inject,
    input,
} from '@angular/core';
import { Channel } from '@iptvnator/shared/interfaces';
import { SlykEpgService } from './slyk-epg.service';
import { SlykLogoComponent } from './slyk-logo.component';
import { SlykNavService } from './slyk-nav.service';
import { slykTime } from './slyk-format';
import { SlykTvService } from './slyk-tv.service';

/**
 * Sky Q's left column, shared by most screens: the glass column with the
 * wordmark and clock in its header strip, the live preview window below it
 * and the section title. Screens put their own list or content beside it.
 */
@Component({
    selector: 'app-slyk-template',
    template: `
        <div class="slyk-bg"></div>
        <div class="sky-column slyk-abs"></div>
        <div class="sky-header slyk-abs"></div>
        <div class="slyk-logo slyk-abs" aria-hidden="true">iptv</div>
        <div class="slyk-clock slyk-abs">{{ clock() }}</div>
        @if (showTv()) {
            <!-- preview window: live TV shows through; navy when nothing plays -->
            @if (!serviceName()) {
                <div class="sky-preview slyk-abs"><span>iptv</span></div>
            }
        }
        @if (title()) {
            <h1 class="slyk-title slyk-abs" [class.small]="smallTitle()">
                {{ title() }}
            </h1>
        }
    `,
    styles: `
        /* the column below the preview window (live TV shows in the gap) */
        .sky-column {
            left: 0;
            top: 410px;
            width: 500px;
            height: 670px;
            z-index: 1;
            background: linear-gradient(180deg, rgb(11 44 158 / 78%), rgb(9 36 140 / 86%));
            border-right: 1px solid rgb(160 200 255 / 35%);
            box-shadow: 6px 0 24px rgb(0 0 40 / 25%);
        }
        .sky-header {
            left: 0;
            top: 0;
            width: 500px;
            height: 125px;
            z-index: 1;
            background: linear-gradient(rgb(255 255 255 / 10%), rgb(255 255 255 / 10%)), rgb(11 44 158 / 80%);
            border-right: 1px solid rgb(160 200 255 / 35%);
            border-bottom: 1px solid rgb(255 255 255 / 12%);
        }
        .slyk-logo {
            left: 40px;
            top: 30px;
            height: 64px;
            z-index: 3;
            font-size: 58px;
            font-weight: 700;
            line-height: 64px;
            letter-spacing: -2px;
            background: linear-gradient(180deg, #d8f3ff, #4cbcf4 50%, #1d8ee0);
            -webkit-background-clip: text;
            background-clip: text;
            color: transparent;
        }
        .slyk-clock {
            left: 170px;
            top: 44px;
            z-index: 3;
            font-size: 32px;
            line-height: 40px;
        }
        .sky-preview {
            left: 0;
            top: 125px;
            width: 500px;
            height: 285px;
            z-index: 2;
            display: flex;
            align-items: center;
            padding-left: 40px;
            box-sizing: border-box;
            background: #050a1e;
            font-size: 64px;
            font-weight: 700;
            letter-spacing: -2px;
            color: #fff;
        }
        .slyk-title {
            left: 60px;
            top: 440px;
            width: 420px;
            margin: 0;
            z-index: 3;
            font-size: 50px;
            font-weight: 400;
            line-height: 1.15;
        }
        .slyk-title.small {
            font-size: 40px;
        }
    `,
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SlykTemplateComponent {
    private readonly tv = inject(SlykTvService);
    private readonly epg = inject(SlykEpgService);
    readonly title = input('');
    readonly smallTitle = input(false);
    readonly showTv = input(true);
    readonly clock = computed(() => slykTime(this.epg.now()));
    readonly serviceName = computed(() =>
        this.tv.displayName(this.tv.activeChannel())
    );
}

/** The coloured-key footer ("New-Buttons" / "Full-Buttons-T1"). */
@Component({
    selector: 'app-slyk-buttons',
    template: `
        <div
            class="slyk-button-bg"
            [style.left.px]="full() ? 0 : 490"
            [style.width.px]="full() ? 1920 : 1430"
        ></div>
        <div
            class="slyk-key slyk-abs back"
            role="button"
            tabindex="-1"
            (click)="nav.press('back')"
            (keydown.enter)="nav.press('back')"
        >
            <span class="label">‹ Back</span>
        </div>
        @for (key of keys; track key.colour; let i = $index) {
            @if (labels()[i]) {
                <div
                    class="slyk-key slyk-abs"
                    role="button"
                    tabindex="-1"
                    [style.left.px]="key.x"
                    (click)="nav.press(key.colour)"
                    (keydown.enter)="nav.press(key.colour)"
                >
                    <span class="dot" [style.background]="key.fill"></span>
                    <span class="label">{{ labels()[i] }}</span>
                </div>
            }
        }
    `,
    styles: `
        .slyk-button-bg {
            position: absolute;
            top: 1018px;
            height: 62px;
            z-index: 1;
            /* Sky Q has no footer bar: the keys sit as small hints. */
            background: none;
        }
        .slyk-key {
            top: 1030px;
            height: 38px;
            display: flex;
            align-items: center;
            gap: 7px;
            font-size: 24px;
            color: rgb(255 255 255 / 80%);
        }
        .back {
            left: 1745px;
            padding: 0 14px;
            border: 1px solid rgb(255 255 255 / 45%);
            border-radius: 4px;
        }
        .dot {
            width: 30px;
            height: 30px;
            margin: 4px;
            border-radius: 50%;
            box-shadow:
                0 0 0 3px #2b2b2b,
                inset 0 2px 3px rgb(255 255 255 / 45%);
        }
    `,
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SlykButtonsComponent {
    readonly nav = inject(SlykNavService);
    readonly labels = input<readonly string[]>([]);
    readonly full = input(false);
    readonly keys = [
        { colour: 'red', x: 512, fill: '#e8262b' },
        { colour: 'green', x: 827, fill: '#2bb24a' },
        { colour: 'yellow', x: 1142, fill: '#f4e01b' },
        { colour: 'blue', x: 1457, fill: '#2f5fd0' },
    ] as const;
}

/** Channel logo (Slyk18Picon), with a text badge as fallback. */
@Component({
    selector: 'app-slyk-picon',
    imports: [SlykLogoComponent],
    template: `
        <app-slyk-logo
            [channel]="channel()"
            [name]="name()"
            [style.--slyk-logo-font.px]="fallbackSize()"
            style="width: 100%; height: 100%"
        />
    `,
    host: { class: 'slyk-picon' },
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SlykPiconComponent {
    readonly channel = input<Channel | null | undefined>(null);
    readonly name = input('');
    readonly fallbackSize = input(24);
}
