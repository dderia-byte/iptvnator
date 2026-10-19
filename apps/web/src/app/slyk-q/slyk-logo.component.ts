import {
    ChangeDetectionStrategy,
    Component,
    computed,
    input,
    linkedSignal,
} from '@angular/core';
import { Channel } from '@iptvnator/shared/interfaces';

/**
 * A channel's logo tile, as on Sky Q's guide rows: the provider's logo, or a
 * clean text badge with the channel name when there is none or it fails.
 * Sized by its host element.
 */
@Component({
    selector: 'app-slyk-logo',
    template: `
        @if (logo() && !failed()) {
            <img [src]="logo()" alt="" loading="lazy" (error)="failed.set(true)" />
        } @else {
            <span>{{ label() }}</span>
        }
    `,
    styles: `
        :host {
            display: inline-flex;
            flex: none;
            align-items: center;
            justify-content: center;
            box-sizing: border-box;
            width: 96px;
            height: 54px;
            border-radius: 6px;
            overflow: hidden;
            background: rgb(255 255 255 / 7%);
        }

        :host(.text) {
            background: linear-gradient(160deg, #2c5597, #132a52);
            box-shadow: inset 0 1px 0 rgb(255 255 255 / 18%);
        }

        img {
            width: 90%;
            height: 84%;
            object-fit: contain;
        }

        span {
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
            padding: 0 6px;
            font-size: var(--slyk-logo-font, 15px);
            font-weight: 700;
            line-height: 1.1;
            letter-spacing: 0.02em;
            text-align: center;
            word-break: break-word;
            color: #eef3fb;
        }
    `,
    host: { '[class.text]': '!logo() || failed()' },
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SlykLogoComponent {
    readonly channel = input<Channel | null | undefined>(null);
    /** Display name for the text badge. */
    readonly name = input('');
    readonly logo = computed(() => this.channel()?.tvg?.logo?.trim() || '');
    /** A broken logo URL falls back to the badge until the channel changes. */
    readonly failed = linkedSignal({
        source: this.logo,
        computation: () => false,
    });
    /** "UK: SKY SPORTS MAIN EVENT" → "SKY SPORTS MAIN EVENT". */
    readonly label = computed(() =>
        this.name()
            .replace(/^[^:|]{1,8}[:|]\s*/, '')
            .trim()
            .toUpperCase()
    );
}
