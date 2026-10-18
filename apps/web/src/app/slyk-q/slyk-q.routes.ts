import { Routes } from '@angular/router';
import { SlykChannelsComponent } from './screens/slyk-channels.component';
import { SlykGuideComponent } from './screens/slyk-guide.component';
import { SlykHomeComponent } from './screens/slyk-home.component';
import { SlykPlaylistsComponent } from './screens/slyk-playlists.component';
import { SlykSetupComponent } from './screens/slyk-setup.component';
import { SlykWatchComponent } from './screens/slyk-watch.component';
import { SlykShellComponent } from './slyk-shell.component';

/** The Slyk Q receiver interface, mounted at `/tv`. */
export const SLYK_Q_ROUTES: Routes = [
    {
        path: '',
        component: SlykShellComponent,
        children: [
            { path: '', pathMatch: 'full', component: SlykHomeComponent },
            { path: 'watch', component: SlykWatchComponent },
            { path: 'channels', component: SlykChannelsComponent },
            { path: 'guide', component: SlykGuideComponent },
            { path: 'playlists', component: SlykPlaylistsComponent },
            { path: 'settings', component: SlykSetupComponent },
        ],
    },
];
