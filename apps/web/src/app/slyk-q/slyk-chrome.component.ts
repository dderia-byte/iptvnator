import {
    ChangeDetectionStrategy,
    Component,
    computed,
    inject,
    input,
    linkedSignal,
} from '@angular/core';
import { Channel } from '@iptvnator/shared/interfaces';
import { SlykEpgService } from './slyk-epg.service';
import { slykTime } from './slyk-format';
import { SlykTvService } from './slyk-tv.service';

/**
 * Slyk Q "template1": background, logo, clock, the TV PiG panel with the
 * service name, the two column edges and the screen title — the frame shared
 * by the main menu, setup, channel selection and most other screens.
 */
@Component({
    selector: 'app-slyk-template',
    template: `
        <div class="slyk-bg"></div>
        <div class="slyk-logo slyk-abs" aria-hidden="true">iptv</div>
        <div class="slyk-clock slyk-abs slyk-shadow">{{ clock() }}</div>
        @if (showTv()) {
            <div class="slyk-tv-edge slyk-abs" style="left: 55px"></div>
            <div class="slyk-tv-edge slyk-abs" style="left: 483px"></div>
            <div class="slyk-tv-name slyk-abs slyk-bold slyk-nowrap slyk-shadow">
                {{ serviceName() }}
            </div>
        }
        <div class="slyk-nav-line" style="left: 23px"></div>
        <div class="slyk-nav-line" style="left: 482px"></div>
        @if (title()) {
            <h1 class="slyk-title slyk-abs slyk-shadow" [class.small]="smallTitle()">
                {{ title() }}
            </h1>
        }
    `,
    styles: `
        .slyk-logo {
            left: 92px;
            top: 54px;
            width: 144px;
            height: 78px;
            font-size: 76px;
            font-weight: 600;
            line-height: 70px;
            letter-spacing: -3px;
            background: linear-gradient(180deg, #b8ecff 0%, #3fb6f2 45%, #0a79c9 55%, #1d9fe8 100%);
            -webkit-background-clip: text;
            background-clip: text;
            color: transparent;
            filter: drop-shadow(0 2px 2px rgb(0 0 0 / 45%));
        }
        .slyk-clock {
            left: 340px;
            top: 80px;
            width: 143px;
            height: 40px;
            line-height: 40px;
        }
        .slyk-tv-edge {
            top: 140px;
            width: 7px;
            height: 245px;
            background: rgb(255 255 255 / 7%);
            z-index: 3;
        }
        .slyk-tv-name {
            left: 54px;
            top: 353px;
            width: 437px;
            height: 32px;
            font-size: 24px;
            line-height: 32px;
            text-align: center;
            z-index: 3;
        }
        .slyk-title {
            left: 102px;
            top: 400px;
            width: 342px;
            margin: 0;
            font-size: 42px;
            font-weight: 400;
            line-height: 1.15;
        }
        .slyk-title.small {
            font-size: 33px;
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
        @for (key of keys; track key.colour; let i = $index) {
            @if (labels()[i]) {
                <div class="slyk-key slyk-abs" [style.left.px]="key.x">
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
            background: linear-gradient(90deg, rgb(255 255 255 / 9%), rgb(255 255 255 / 13%));
        }
        .slyk-key {
            top: 1030px;
            height: 38px;
            display: flex;
            align-items: center;
            gap: 7px;
            font-size: 30px;
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
    readonly labels = input<readonly string[]>([]);
    readonly full = input(false);
    readonly keys = [
        { colour: 'red', x: 512, fill: '#e8262b' },
        { colour: 'green', x: 827, fill: '#2bb24a' },
        { colour: 'yellow', x: 1142, fill: '#f4e01b' },
        { colour: 'blue', x: 1457, fill: '#2f5fd0' },
    ];
}

/** Channel logo (Slyk18Picon) with the service name as fallback. */
@Component({
    selector: 'app-slyk-picon',
    template: `
        @if (logo() && !failed()) {
            <img [src]="logo()" alt="" (error)="failed.set(true)" />
        } @else {
            <span [style.font-size.px]="fallbackSize()">{{ name() }}</span>
        }
    `,
    host: { class: 'slyk-picon' },
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SlykPiconComponent {
    readonly channel = input<Channel | null | undefined>(null);
    readonly name = input('');
    readonly fallbackSize = input(24);
    readonly logo = computed(() => this.channel()?.tvg?.logo?.trim() || '');
    /** A broken logo URL falls back to the name until the channel changes. */
    readonly failed = linkedSignal({
        source: this.logo,
        computation: () => false,
    });
}
