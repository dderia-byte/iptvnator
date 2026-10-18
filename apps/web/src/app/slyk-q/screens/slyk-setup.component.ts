import {
    ChangeDetectionStrategy,
    Component,
    computed,
    DestroyRef,
    inject,
    signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { RuntimeCapabilitiesService, SettingsStore } from '@iptvnator/services';
import { VideoPlayer } from '@iptvnator/shared/interfaces';
import {
    SlykButtonsComponent,
    SlykTemplateComponent,
} from '../slyk-chrome.component';
import { SlykKeyPress, wrapIndex } from '../slyk-keys';
import { SlykNavService, SlykScreen } from '../slyk-nav.service';

interface Choice<T> {
    value: T;
    label: string;
}

interface ConfigRow {
    label: string;
    description: string;
    /** Choice rows cycle with left/right; link rows open another screen. */
    choices?: Choice<unknown>[];
    key?: 'player' | 'epgOffsetMinutes' | 'stripCountryPrefix';
    link?: string;
}

const PLAYERS: Choice<VideoPlayer>[] = [
    { value: VideoPlayer.VideoJs, label: 'Video.js' },
    { value: VideoPlayer.Html5Player, label: 'HTML5' },
    { value: VideoPlayer.ArtPlayer, label: 'ArtPlayer' },
];
const OFFSETS: Choice<number>[] = Array.from({ length: 49 }, (_, i) => {
    const minutes = (i - 24) * 30;
    return { value: minutes, label: `${minutes > 0 ? '+' : ''}${minutes} min` };
});
const YES_NO: Choice<boolean>[] = [
    { value: false, label: 'No' },
    { value: true, label: 'Yes' },
];

/** Slyk Q `Setup`: a ConfigList with left/right values and Save/Cancel. */
@Component({
    selector: 'app-slyk-setup',
    imports: [SlykTemplateComponent, SlykButtonsComponent],
    templateUrl: './slyk-setup.component.html',
    styleUrl: './slyk-setup.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SlykSetupComponent implements SlykScreen {
    private readonly router = inject(Router);
    private readonly settingsStore = inject(SettingsStore);
    private readonly runtime = inject(RuntimeCapabilitiesService);

    readonly rows: ConfigRow[] = [
        {
            label: 'Video player',
            key: 'player',
            choices: this.playerChoices(),
            description: 'Player used for live channels when 4K and Dolby playback (Embedded MPV) is off. With it on, Embedded MPV plays every channel. External MPV/VLC stay in Classic View settings.',
        },
        {
            label: 'EPG time offset',
            key: 'epgOffsetMinutes',
            choices: OFFSETS,
            description: 'Shift programme times when your guide data uses a different time zone.',
        },
        {
            label: 'Strip country prefix',
            key: 'stripCountryPrefix',
            choices: YES_NO,
            description: 'Hide prefixes such as "UK:" or "DE |" in channel names.',
        },
        {
            label: 'Playlists and sources',
            link: '/workspace/sources',
            description: 'Add, edit or remove M3U playlists, Xtream Codes and Stalker sources.',
        },
        {
            label: 'EPG sources',
            link: '/workspace/settings/epg',
            description: 'Manage XMLTV guide sources and refresh programme data.',
        },
        {
            label: 'All settings',
            link: '/workspace/settings',
            description: 'Every IPTVnator setting, including players, backup and remote control.',
        },
        {
            label: 'About this interface',
            description: 'Layout after the Slyk Q 1080 Enigma2 skin by kiddac (linuxsat-support.com). Graphics recreated; no skin artwork or fonts are bundled.',
        },
    ];

    readonly index = signal(0);
    /** Pending values; written on Save (green / OK), dropped on Cancel. */
    readonly draft = signal<Record<string, unknown>>(this.currentValues());
    readonly dirty = signal(false);
    readonly description = computed(() => this.rows[this.index()].description);

    constructor() {
        inject(SlykNavService).register(this, inject(DestroyRef), 'pig');
    }

    valueLabel(row: ConfigRow): string {
        if (!row.choices || !row.key) {
            return '';
        }
        const value = this.draft()[row.key];
        return row.choices.find((c) => c.value === value)?.label ?? String(value ?? '');
    }

    onKey({ key }: SlykKeyPress): boolean {
        const row = this.rows[this.index()];
        switch (key) {
            case 'up':
            case 'down':
                this.index.update((i) =>
                    wrapIndex(i, key === 'up' ? -1 : 1, this.rows.length)
                );
                return true;
            case 'left':
            case 'right':
                this.cycle(row, key === 'left' ? -1 : 1);
                return true;
            case 'ok':
                if (row.link) {
                    void this.router.navigateByUrl(row.link);
                } else {
                    void this.save();
                }
                return true;
            case 'green':
                void this.save();
                return true;
            case 'red':
            case 'back':
                this.draft.set(this.currentValues());
                this.dirty.set(false);
                void this.router.navigateByUrl('/tv');
                return true;
            default:
                return false;
        }
    }

    /** Click: links open, values step forward (the arrows step either way). */
    activate(row: ConfigRow): void {
        if (row.link) {
            void this.router.navigateByUrl(row.link);
        } else {
            this.cycle(row, 1);
        }
    }

    cycle(row: ConfigRow, delta: 1 | -1): void {
        if (!row.choices || !row.key) {
            return;
        }
        const key = row.key;
        const current = row.choices.findIndex(
            (c) => c.value === this.draft()[key]
        );
        const next = row.choices[wrapIndex(Math.max(0, current), delta, row.choices.length)];
        this.draft.update((d) => ({ ...d, [key]: next.value }));
        this.dirty.set(true);
    }

    async save(): Promise<void> {
        if (this.dirty()) {
            await this.settingsStore.updateSettings(this.draft());
            this.dirty.set(false);
        }
        void this.router.navigateByUrl('/tv');
    }

    private currentValues(): Record<string, unknown> {
        return {
            player: this.settingsStore.player() ?? VideoPlayer.VideoJs,
            epgOffsetMinutes: this.settingsStore.resolvedEpgOffsetMinutes(),
            stripCountryPrefix: !!this.settingsStore.stripCountryPrefix?.(),
        };
    }

    private playerChoices(): Choice<VideoPlayer>[] {
        const choices = [...PLAYERS];
        if (this.runtime.supportsEmbeddedMpv) {
            choices.push({ value: VideoPlayer.EmbeddedMpv, label: 'Embedded MPV' });
        }
        return choices;
    }
}
