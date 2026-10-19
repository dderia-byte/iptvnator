import {
    ChangeDetectionStrategy,
    Component,
    computed,
    DestroyRef,
    inject,
    signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { SlykTemplateComponent } from '../slyk-chrome.component';
import { GENRE_PREFIX } from '../slyk-categories.service';
import { SlykKeyPress, wrapIndex } from '../slyk-keys';
import { SlykNavService, SlykScreen } from '../slyk-nav.service';
import { SlykTvService } from '../slyk-tv.service';

export interface SlykMenuItem {
    label: string;
    blurb: string;
    /** Route to open, or a category to open the TV guide on. */
    path?: string;
    genre?: string;
}

/** Sky Q's main menu, mapped to what an IPTV account offers. */
export const SLYK_MENU: readonly SlykMenuItem[] = [
    { label: 'Home', path: '/tv', blurb: "What's on now, your channels and what you watched last." },
    { label: 'TV guide', path: '/tv/guide', blurb: 'Every channel by category, with programmes for today and the days ahead.' },
    { label: 'Continue watching', path: '/tv', blurb: 'Channels you watched most recently.' },
    { label: 'Catch up TV', path: '/tv/catchup', blurb: 'Programmes from the last few days on channels your provider records.' },
    { label: 'Movies', path: '/tv/movies', blurb: "Films from your provider's on-demand library." },
    { label: 'Box sets', path: '/tv/boxsets', blurb: 'Whole series to watch from the first episode.' },
    { label: 'Sport', genre: 'Sports', blurb: 'Live sport channels and what is on them now.' },
    { label: 'Kids', genre: 'Kids', blurb: "Children's channels." },
    { label: 'Settings', path: '/tv/settings', blurb: 'Player, guide, playlists and sources.' },
    { label: 'Help', path: '/tv/help', blurb: 'About this interface, and the switch back to the classic screens.' },
];

const VISIBLE = 9;

/**
 * The main menu in Sky Q's left column, opened with Back from Home. The
 * right side previews the focused section.
 */
@Component({
    selector: 'app-slyk-menu',
    imports: [SlykTemplateComponent],
    template: `
        <app-slyk-template />
        <div class="sky-focus focus" [style.top.px]="440 + (index() - first()) * 68"></div>
        @for (item of visible(); track item.label; let i = $index) {
            <div
                class="item slyk-abs slyk-nowrap"
                role="menuitem"
                tabindex="-1"
                [class.selected]="first() + i === index()"
                [style.top.px]="440 + i * 68"
                (mouseenter)="index.set(first() + i)"
                (click)="open(first() + i)"
                (keydown.enter)="open(first() + i)"
            >
                {{ item.label }}
            </div>
        }
        @for (item of [items[index()]]; track item.label) {
            <div class="preview slyk-abs">
                <div class="preview-title">{{ item.label }}</div>
                <div class="preview-blurb">{{ item.blurb }}</div>
            </div>
        }
    `,
    styles: `
        .focus {
            left: 24px;
            width: 450px;
            height: 64px;
        }
        .item {
            left: 52px;
            width: 420px;
            height: 64px;
            z-index: 3;
            font-size: 36px;
            line-height: 64px;
            color: rgb(255 255 255 / 85%);
            cursor: pointer;
        }
        .item.selected {
            font-weight: 700;
            font-size: 40px;
            color: #fff;
        }
        .preview {
            left: 600px;
            top: 140px;
            width: 1200px;
            z-index: 3;
            animation: slyk-fade 200ms ease-out both;
        }
        .preview-title {
            font-size: 54px;
        }
        .preview-blurb {
            margin-top: 16px;
            font-size: 32px;
            line-height: 44px;
            color: rgb(255 255 255 / 85%);
        }
    `,
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SlykMenuComponent implements SlykScreen {
    private readonly router = inject(Router);
    private readonly tv = inject(SlykTvService);
    readonly items = SLYK_MENU;
    readonly index = signal(0);
    /** The list keeps the selection in the second slot once it scrolls. */
    readonly first = computed(() =>
        Math.min(Math.max(0, this.index() - 1), Math.max(0, this.items.length - VISIBLE))
    );
    readonly visible = computed(() => this.items.slice(this.first(), this.first() + VISIBLE));

    constructor() {
        inject(SlykNavService).register(this, inject(DestroyRef), 'pig');
    }

    open(index: number): void {
        this.index.set(index);
        const item = this.items[index];
        if (item.genre) {
            this.tv.setBouquet(GENRE_PREFIX + item.genre);
            void this.router.navigateByUrl('/tv/guide');
        } else if (item.path) {
            void this.router.navigateByUrl(item.path);
        }
    }

    onKey({ key }: SlykKeyPress): boolean {
        switch (key) {
            case 'up':
            case 'down':
                this.index.update((i) => wrapIndex(i, key === 'up' ? -1 : 1, this.items.length));
                return true;
            case 'ok':
            case 'right':
                this.open(this.index());
                return true;
            case 'back':
                // Back from the menu returns to live TV, or Home when nothing plays.
                void this.router.navigateByUrl(this.tv.activeChannel() ? '/tv/watch' : '/tv');
                return true;
            default:
                return false;
        }
    }
}
