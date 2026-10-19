import { Routes } from '@angular/router';
import { SlykCatchupComponent } from './screens/slyk-catchup.component';
import { SlykChannelsComponent } from './screens/slyk-channels.component';
import { SlykGuideComponent } from './screens/slyk-guide.component';
import { SlykHelpComponent } from './screens/slyk-help.component';
import { SlykHomeComponent } from './screens/slyk-home.component';
import { SlykMenuComponent } from './screens/slyk-menu.component';
import { SlykPlaylistsComponent } from './screens/slyk-playlists.component';
import { SlykSetupComponent } from './screens/slyk-setup.component';
import { SlykVodComponent } from './screens/slyk-vod.component';
import { SlykWatchComponent } from './screens/slyk-watch.component';
import { SlykShellComponent } from './slyk-shell.component';

/** The Slyk Q receiver interface, mounted at `/tv`. */
export const SLYK_Q_ROUTES: Routes = [
    {
        path: '',
        component: SlykShellComponent,
        children: [
            { path: '', pathMatch: 'full', component: SlykHomeComponent },
            { path: 'menu', component: SlykMenuComponent },
            { path: 'help', component: SlykHelpComponent },
            { path: 'movies', component: SlykVodComponent, data: { kind: 'vod' } },
            { path: 'boxsets', component: SlykVodComponent, data: { kind: 'series' } },
            { path: 'catchup', component: SlykCatchupComponent },
            { path: 'watch', component: SlykWatchComponent },
            { path: 'channels', component: SlykChannelsComponent },
            { path: 'guide', component: SlykGuideComponent },
            { path: 'guide-menu', redirectTo: 'guide' },
            { path: 'playlists', component: SlykPlaylistsComponent },
            { path: 'settings', component: SlykSetupComponent },
        ],
    },
];
