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
import { SlykButtonsComponent, SlykTemplateComponent } from '../slyk-chrome.component';
import { REGION_ALL } from '../slyk-categories.service';
import { SlykKeyPress, wrapIndex } from '../slyk-keys';
import { SlykNavService, SlykScreen } from '../slyk-nav.service';
import { SlykTvService } from '../slyk-tv.service';

interface Choice {
    value: unknown;
    label: string;
}

type SettingKey = 'player' | 'epgOffsetMinutes' | 'stripCountryPrefix' | 'region';

interface SettingRow {
    label: string;
    help: string;
    /** Rows with choices open the option column; link rows open a screen. */
    key?: SettingKey;
    link?: string;
}

interface Section {
    label: string;
    rows: SettingRow[];
}

const OFFSETS: Choice[] = Array.from({ length: 49 }, (_, i) => {
    const minutes = (i - 24) * 30;
    return { value: minutes, label: minutes ? `${minutes > 0 ? '+' : ''}${minutes / 60}h` : 'None' };
});
const ON_OFF: Choice[] = [
    { value: false, label: 'Off' },
    { value: true, label: 'On' },
];
const OPTIONS_VISIBLE = 9;
export const SETTING_ROW = 72;
export const HELP_HEIGHT = 110;

/**
 * Sky Q Settings: sections in the left column, label/value rows with help
 * text in the focused row, and an option column with a tick on the current
 * value. Choices apply straight away, as on the box.
 */
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
    private readonly tv = inject(SlykTvService);
    readonly rowHeight = SETTING_ROW;
    readonly helpHeight = HELP_HEIGHT;

    readonly sections: Section[] = [
        {
            label: 'Setup',
            rows: [
                { label: 'Video player', key: 'player', help: 'Player for live channels when Embedded MPV (4K and Dolby) is off. With it on, Embedded MPV plays everything.' },
                { label: 'Region', key: 'region', help: 'The country the TV guide categories and Home rows show channels for.' },
                { label: 'Hide country prefix', key: 'stripCountryPrefix', help: 'Hide prefixes such as "UK:" or "DE |" in channel names.' },
            ],
        },
        {
            label: 'Playlists and sources',
            rows: [
                { label: 'Your playlists', link: '/tv/playlists', help: 'Switch between playlists, or add an Xtream account or M3U playlist.' },
                { label: 'Manage sources', link: '/workspace/sources', help: 'Edit or remove M3U playlists, Xtream Codes and Stalker sources.' },
            ],
        },
        {
            label: 'TV guide',
            rows: [
                { label: 'Guide time offset', key: 'epgOffsetMinutes', help: 'Shift programme times when your guide data uses a different time zone.' },
                { label: 'Guide sources', link: '/workspace/settings/epg', help: 'Manage XMLTV guide sources and refresh programme data.' },
            ],
        },
        {
            label: 'Advanced',
            rows: [
                { label: 'All settings', link: '/workspace/settings', help: 'Every IPTVnator setting, including players, backup and remote control.' },
            ],
        },
    ];

    readonly area = signal<'column' | 'rows' | 'options'>('rows');
    readonly section = signal(0);
    readonly index = signal(0);
    readonly optionIndex = signal(0);
    /** Bumped after a change so values re-read the settings. */
    private readonly revision = signal(0);

    readonly rows = computed(() => this.sections[this.section()].rows);
    readonly row = computed(() => this.rows()[this.index()]);
    readonly options = computed(() => this.choicesFor(this.row()?.key));
    readonly optionFirst = computed(() =>
        Math.min(Math.max(0, this.optionIndex() - 2), Math.max(0, this.options().length - OPTIONS_VISIBLE))
    );
    readonly visibleOptions = computed(() =>
        this.options().slice(this.optionFirst(), this.optionFirst() + OPTIONS_VISIBLE)
    );

    constructor() {
        inject(SlykNavService).register(this, inject(DestroyRef), 'pig');
    }

    /** Top of row `i`: rows below the focused one make room for its help. */
    rowTop(i: number): number {
        return 420 + i * SETTING_ROW + (i > this.index() ? HELP_HEIGHT : 0);
    }

    valueLabel(row: SettingRow): string {
        if (!row.key) {
            return row.link ? '›' : '';
        }
        const value = this.value(row.key);
        return this.choicesFor(row.key).find((c) => c.value === value)?.label ?? String(value ?? '');
    }

    isCurrent(choice: Choice): boolean {
        return choice.value === this.value(this.row()?.key);
    }

    pickSection(i: number): void {
        this.section.set(i);
        this.index.set(0);
    }

    activate(i = this.index()): void {
        this.index.set(i);
        const row = this.rows()[i];
        if (row.link) {
            void this.router.navigateByUrl(row.link);
        } else if (row.key) {
            this.area.set('options');
            this.optionIndex.set(Math.max(0, this.options().findIndex((c) => this.isCurrent(c))));
        }
    }

    async choose(choice: Choice): Promise<void> {
        const key = this.row().key;
        if (key === 'region') {
            this.tv.categories.setRegion(choice.value as string);
        } else if (key) {
            await this.settingsStore.updateSettings({ [key]: choice.value });
        }
        this.revision.update((r) => r + 1);
        this.area.set('rows');
    }

    onKey({ key }: SlykKeyPress): boolean {
        const area = this.area();
        if (area === 'options') {
            return this.onOptionKey(key);
        }
        if (area === 'column') {
            switch (key) {
                case 'up':
                case 'down':
                    this.pickSection(wrapIndex(this.section(), key === 'up' ? -1 : 1, this.sections.length));
                    return true;
                case 'right':
                case 'ok':
                    this.area.set('rows');
                    return true;
                default:
                    return false;
            }
        }
        switch (key) {
            case 'up':
            case 'down':
                this.index.update((i) => wrapIndex(i, key === 'up' ? -1 : 1, this.rows().length));
                return true;
            case 'left':
                this.area.set('column');
                return true;
            case 'right':
            case 'ok':
                this.activate();
                return true;
            default:
                return false;
        }
    }

    private onOptionKey(key: string): boolean {
        const count = this.options().length;
        switch (key) {
            case 'up':
            case 'down':
                this.optionIndex.update((i) => Math.min(count - 1, Math.max(0, i + (key === 'up' ? -1 : 1))));
                return true;
            case 'ok':
                void this.choose(this.options()[this.optionIndex()]);
                return true;
            case 'left':
            case 'back':
                this.area.set('rows');
                return true;
            default:
                return true;
        }
    }

    private value(key: SettingKey | undefined): unknown {
        this.revision();
        switch (key) {
            case 'player':
                return this.settingsStore.player() ?? VideoPlayer.VideoJs;
            case 'epgOffsetMinutes':
                return this.settingsStore.resolvedEpgOffsetMinutes();
            case 'stripCountryPrefix':
                return !!this.settingsStore.stripCountryPrefix?.();
            case 'region':
                return this.tv.categories.region();
            default:
                return undefined;
        }
    }

    private choicesFor(key: SettingKey | undefined): Choice[] {
        switch (key) {
            case 'player': {
                const players: Choice[] = [
                    { value: VideoPlayer.VideoJs, label: 'Video.js' },
                    { value: VideoPlayer.Html5Player, label: 'HTML5' },
                    { value: VideoPlayer.ArtPlayer, label: 'ArtPlayer' },
                ];
                if (this.runtime.supportsEmbeddedMpv) {
                    players.push({ value: VideoPlayer.EmbeddedMpv, label: 'Embedded MPV' });
                }
                return players;
            }
            case 'epgOffsetMinutes':
                return OFFSETS;
            case 'stripCountryPrefix':
                return ON_OFF;
            case 'region':
                return [
                    { value: REGION_ALL, label: 'All' },
                    ...this.tv.categories.regions().map((r) => ({ value: r.code, label: r.code })),
                ];
            default:
                return [];
        }
    }
}
