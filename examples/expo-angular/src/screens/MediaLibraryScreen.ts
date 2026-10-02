import { Component } from '@angular/core';
import { Explorer } from '../components/Explorer';
import { ScreenShell } from '../components/ScreenShell';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { MediaLibraryLegacy } from './MediaLibraryLegacy';
import { MediaLibraryModern } from './MediaLibraryModern';
import { MediaLibraryRecent } from './MediaLibraryRecent';

@Component({
  selector: 'MediaLibraryScreen',
  standalone: true,
  imports: [
    Explorer,
    MediaLibraryLegacy,
    MediaLibraryModern,
    MediaLibraryRecent,
    ScreenShell,
  ],
  template: `
    <ScreenShell
      [route]="route"
      testID="media-library-scroll"
      title="Media Library"
      body="Read and manage the user's photos, videos and albums: list recent media, save new files, create albums and watch for changes. Delete and create buttons in the explorer act on the ids you pass, so the read-only calls are safe to tap freely."
    >
      <MediaLibraryRecent />
      <Explorer testID="media-library-explorer" [color]="color">
        <ng-template>
          <MediaLibraryModern />
          <MediaLibraryLegacy />
        </ng-template>
      </Explorer>
    </ScreenShell>
  `,
})
export class MediaLibraryScreen {
  readonly route = ROUTE_NAME.MediaLibrary;
  readonly color = lineColorOf(ROUTE_NAME.MediaLibrary);
}
