import {
    ChangeDetectionStrategy,
    Component,
    computed,
    DestroyRef,
    inject,
    linkedSignal,
} from '@angular/core';
import { Router } from '@angular/router';
import { playlistDisplayLabel, PlaylistMeta } from '@iptvnator/shared/interfaces';
import {
    SlykButtonsComponent,
    SlykTemplateComponent,
} from '../slyk-chrome.component';
import { SlykKeyPress, wrapIndex } from '../slyk-keys';
import { SlykNavService, SlykScreen } from '../slyk-nav.service';
import { SlykTvService } from '../slyk-tv.service';
import {
    WORKSPACE_SHELL_ACTIONS,
    WorkspacePlaylistType,
} from '@iptvnator/workspace/shell/util';

const ROWS = 8;

/** Slyk Q `menu-2panel` list of the user's sources (bouquet providers). */
@Component({
    selector: 'app-slyk-playlists',
    imports: [SlykTemplateComponent, SlykButtonsComponent],
    templateUrl: './slyk-playlists.component.html',
    styleUrl: './slyk-playlists.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SlykPlaylistsComponent implements SlykScreen {
    private readonly router = inject(Router);
    private readonly shellActions = inject(WORKSPACE_SHELL_ACTIONS);
    readonly tv = inject(SlykTvService);

    readonly playlists = this.tv.playlists;
    readonly index = linkedSignal(() =>
        Math.max(
            0,
            this.playlists().findIndex(
                (p) => p._id === this.tv.activePlaylist()?._id
            )
        )
    );
    readonly pageStart = computed(
        () => Math.floor(this.index() / ROWS) * ROWS
    );
    readonly visible = computed(() =>
        this.playlists().slice(this.pageStart(), this.pageStart() + ROWS)
    );
    readonly selected = computed(() => this.playlists()[this.index()] ?? null);
    readonly description = computed(() => {
        const playlist = this.selected();
        if (!playlist) {
            return 'No playlists yet. Red adds an M3U link, green an Xtream Codes account, yellow an M3U file.';
        }
        const kind = this.kindOf(playlist);
        const count = playlist.count ? `${playlist.count} channels` : '';
        return [kind, count].filter(Boolean).join(' · ');
    });

    constructor() {
        inject(SlykNavService).register(this, inject(DestroyRef), 'pig');
    }

    label(playlist: PlaylistMeta): string {
        return playlistDisplayLabel(
            playlist.title || playlist.filename,
            'Untitled playlist'
        );
    }

    isActive(playlist: PlaylistMeta): boolean {
        return this.tv.activePlaylist()?._id === playlist._id;
    }

    open(playlist: PlaylistMeta | null): void {
        if (!playlist) {
            return;
        }
        if (this.tv.openPlaylist(playlist) === 'slyk') {
            void this.router.navigateByUrl('/tv/channels');
        }
    }

    onKey({ key }: SlykKeyPress): boolean {
        switch (key) {
            case 'up':
            case 'down':
                // One extra stop past the last source: "+ Add playlist…".
                this.index.update((i) =>
                    wrapIndex(i, key === 'up' ? -1 : 1, this.playlists().length + 1)
                );
                return true;
            case 'ok':
                if (this.index() === this.playlists().length) {
                    this.add();
                } else {
                    this.open(this.selected());
                }
                return true;
            case 'red':
                this.add('url');
                return true;
            case 'green':
                this.add('xtream');
                return true;
            case 'yellow':
                this.add('file');
                return true;
            case 'blue':
                void this.router.navigateByUrl('/workspace/sources');
                return true;
            default:
                return false;
        }
    }

    /** IPTVnator's Add playlist dialog, opened on the chosen method. */
    add(type?: WorkspacePlaylistType): void {
        this.shellActions.openAddPlaylistDialog(type);
    }

    private kindOf(playlist: PlaylistMeta): string {
        if (playlist.serverUrl) {
            return this.tv.playsHere(playlist)
                ? 'Xtream Codes · live TV here, films and series in Classic View'
                : 'Xtream Codes (opens in Classic View)';
        }
        if (playlist.macAddress) {
            return 'Stalker portal (opens in Classic View)';
        }
        return 'M3U playlist';
    }
}
