import {
    ChangeDetectionStrategy,
    Component,
    DestroyRef,
    inject,
    signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { SlykTemplateComponent } from '../slyk-chrome.component';
import { SlykKeyPress, wrapIndex } from '../slyk-keys';
import { SlykNavService, SlykScreen } from '../slyk-nav.service';

const ROWS = [
    {
        label: 'Classic view',
        help: 'Switch to the original IPTVnator screens. Open "TV" there to come back.',
    },
    {
        label: 'About this interface',
        help: 'A TV-box style interface for IPTVnator, laid out after Sky Q and the Slyk Q skin. Use the arrows, OK, Back, Guide, Menu, channel up and down, and the coloured keys.',
    },
] as const;

/** Help: what this interface is, and the switch to Classic view. */
@Component({
    selector: 'app-slyk-help',
    imports: [SlykTemplateComponent],
    template: `
        <app-slyk-template title="Help" />
        @for (row of rows; track row.label; let i = $index) {
            <div
                class="row slyk-abs"
                role="option"
                tabindex="-1"
                [attr.aria-selected]="i === index()"
                [class.selected]="i === index()"
                [style.top.px]="420 + i * 80"
                (mouseenter)="index.set(i)"
                (click)="open(i)"
                (keydown.enter)="open(i)"
            >
                {{ row.label }}
            </div>
        }
        <div class="help slyk-abs">{{ rows[index()].help }}</div>
    `,
    styles: `
        .row {
            left: 600px;
            width: 1060px;
            height: 76px;
            z-index: 3;
            padding: 0 24px;
            box-sizing: border-box;
            border-bottom: 1px solid rgb(255 255 255 / 25%);
            font-size: 34px;
            line-height: 76px;
            cursor: pointer;
        }
        .row.selected {
            font-weight: 700;
            background: var(--sky-focus-bg);
            outline: var(--sky-focus-border);
        }
        .help {
            left: 600px;
            top: 620px;
            width: 1060px;
            z-index: 3;
            font-size: 30px;
            line-height: 42px;
            color: rgb(255 255 255 / 85%);
        }
    `,
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SlykHelpComponent implements SlykScreen {
    private readonly router = inject(Router);
    readonly rows = ROWS;
    readonly index = signal(0);

    constructor() {
        inject(SlykNavService).register(this, inject(DestroyRef), 'pig');
    }

    open(index: number): void {
        this.index.set(index);
        if (index === 0) {
            void this.router.navigateByUrl('/workspace');
        }
    }

    onKey({ key }: SlykKeyPress): boolean {
        switch (key) {
            case 'up':
            case 'down':
                this.index.update((i) => wrapIndex(i, key === 'up' ? -1 : 1, ROWS.length));
                return true;
            case 'ok':
                this.open(this.index());
                return true;
            case 'back':
                void this.router.navigateByUrl('/tv/menu');
                return true;
            default:
                return false;
        }
    }
}
