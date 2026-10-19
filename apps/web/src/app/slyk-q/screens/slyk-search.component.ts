import {
    ChangeDetectionStrategy,
    Component,
    computed,
    DestroyRef,
    effect,
    inject,
    signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { Channel } from '@iptvnator/shared/interfaces';
import { SlykButtonsComponent, SlykTemplateComponent } from '../slyk-chrome.component';
import { SlykEpgService } from '../slyk-epg.service';
import { SlykKeyPress } from '../slyk-keys';
import { SlykLogoComponent } from '../slyk-logo.component';
import { SlykNavService, SlykScreen } from '../slyk-nav.service';
import { SlykTvService } from '../slyk-tv.service';

/** On-screen keyboard, six keys a row, as in Sky Q's search. */
export const SEARCH_KEYS = [
    ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890'.split(''),
    'Space',
    'Delete',
];
const KEY_COLUMNS = 6;
const RESULT_COLUMNS = 3;
const MAX_RESULTS = 60;

/**
 * Sky Q Search: an A–Z keyboard in the left column and matching channels
 * as tiles on the right, with what is on each now.
 */
@Component({
    selector: 'app-slyk-search',
    imports: [SlykTemplateComponent, SlykButtonsComponent, SlykLogoComponent],
    templateUrl: './slyk-search.component.html',
    styleUrl: './slyk-search.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SlykSearchComponent implements SlykScreen {
    private readonly router = inject(Router);
    readonly tv = inject(SlykTvService);
    readonly epg = inject(SlykEpgService);
    readonly keys = SEARCH_KEYS;
    readonly keyColumns = KEY_COLUMNS;
    readonly resultColumns = RESULT_COLUMNS;

    readonly area = signal<'keys' | 'results'>('keys');
    readonly keyIndex = signal(0);
    readonly resultIndex = signal(0);
    readonly query = signal('');

    readonly results = computed<Channel[]>(() => {
        const words = this.query().toLowerCase().split(/\s+/).filter(Boolean);
        if (!words.length) {
            return [];
        }
        const matches: Channel[] = [];
        for (const channel of this.tv.tvChannels()) {
            const name = this.tv.displayName(channel).toLowerCase();
            if (words.every((w) => name.includes(w)) && this.tv.categories.inRegion(channel)) {
                matches.push(channel);
                if (matches.length >= MAX_RESULTS) {
                    break;
                }
            }
        }
        return matches;
    });
    readonly offset = computed(() => Math.max(0, this.rowOf(this.resultIndex()) - 1) * 300);

    constructor() {
        inject(SlykNavService).register(this, inject(DestroyRef), 'pig');
        effect(() => void this.epg.load(this.results().slice(0, 12)));
    }

    rowOf(i: number): number {
        return Math.floor(i / RESULT_COLUMNS);
    }

    nowTitle(channel: Channel): string {
        return this.epg.nowNext(channel).now?.title ?? '';
    }

    type(key: string): void {
        this.query.update((q) =>
            key === 'Delete' ? q.slice(0, -1) : key === 'Space' ? `${q} ` : q + key
        );
        this.resultIndex.set(0);
    }

    play(i: number): void {
        const channel = this.results()[i];
        if (channel) {
            this.tv.play(channel);
            void this.router.navigateByUrl('/tv/watch');
        }
    }

    onKey({ key, digit }: SlykKeyPress): boolean {
        if (key === 'digit' && digit !== null) {
            this.type(String(digit));
            return true;
        }
        return this.area() === 'keys' ? this.onKeyboardKey(key) : this.onResultKey(key);
    }

    private onKeyboardKey(key: string): boolean {
        const i = this.keyIndex();
        const count = this.keys.length;
        switch (key) {
            case 'left':
                if (i % KEY_COLUMNS) {
                    this.keyIndex.set(i - 1);
                }
                return true;
            case 'right':
                if (i % KEY_COLUMNS === KEY_COLUMNS - 1 || i === count - 1) {
                    if (this.results().length) {
                        this.area.set('results');
                    }
                } else {
                    this.keyIndex.set(i + 1);
                }
                return true;
            case 'up':
            case 'down': {
                const next = i + (key === 'up' ? -KEY_COLUMNS : KEY_COLUMNS);
                if (next >= 0 && next < count) {
                    this.keyIndex.set(next);
                }
                return true;
            }
            case 'ok':
                this.type(this.keys[i]);
                return true;
            case 'red':
                this.type('Delete');
                return true;
            default:
                return false;
        }
    }

    private onResultKey(key: string): boolean {
        const i = this.resultIndex();
        const count = this.results().length;
        switch (key) {
            case 'left':
                if (i % RESULT_COLUMNS === 0) {
                    this.area.set('keys');
                } else {
                    this.resultIndex.set(i - 1);
                }
                return true;
            case 'right':
                this.resultIndex.set(Math.min(count - 1, i + 1));
                return true;
            case 'up':
            case 'down': {
                const next = i + (key === 'up' ? -RESULT_COLUMNS : RESULT_COLUMNS);
                if (next >= 0 && next < count) {
                    this.resultIndex.set(next);
                }
                return true;
            }
            case 'ok':
                this.play(i);
                return true;
            default:
                return false;
        }
    }
}
