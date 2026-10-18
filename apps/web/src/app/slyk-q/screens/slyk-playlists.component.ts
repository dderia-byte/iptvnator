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
            return 'No playlists yet. Press the green button to add an M3U playlist, Xtream Codes or Stalker portal.';
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
                this.index.update((i) =>
                    wrapIndex(i, key === 'up' ? -1 : 1, this.playlists().length)
                );
                return true;
            case 'ok':
                this.open(this.selected());
                return true;
            case 'green':
            case 'yellow':
                void this.router.navigateByUrl('/workspace/sources');
                return true;
            default:
                return false;
        }
    }

    private kindOf(playlist: PlaylistMeta): string {
        if (playlist.serverUrl) {
            return 'Xtream Codes (opens in Classic View)';
        }
        if (playlist.macAddress) {
            return 'Stalker portal (opens in Classic View)';
        }
        return 'M3U playlist';
    }
}
