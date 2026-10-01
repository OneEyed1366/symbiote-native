import { Component, signal } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import {
  getAssetsAsync,
  requestPermissionsAsync,
} from '@symbiote-native/media-library/legacy';
import type { IMediaLibraryAsset } from '@symbiote-native/media-library/legacy';
import { ActionButton } from '../components/ActionButton';
import { ResultRow } from '../components/ResultRow';
import { Scenario } from '../components/Scenario';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';

const RECENT_COUNT = 6;

@Component({
  selector: 'MediaLibraryRecent',
  standalone: true,
  imports: [ActionButton, ResultRow, Scenario, SYMBIOTE_ELEMENTS],
  template: `
    <Scenario
      testID="media-library-recent-scenario"
      title="Show the user's latest photos in your own gallery"
      why="Build a custom photo picker, a memories strip or a photo backup screen by reading the library directly, with access the user can limit to selected photos."
      [steps]="steps"
      expect="Up to six of the newest photos appear as thumbnails and the status shows how many photos the library holds. Denying access shows the reason instead."
    >
      <ActionButton
        testID="media-library-recent-button"
        title="Show latest photos"
        [color]="color"
        (press)="load()"
      />
      <ResultRow
        testID="media-library-recent-status"
        label="Status"
        [value]="status()"
      />
      <view class="thumb-row">
        @for (asset of assets(); track asset.id) {
          <image [source]="{ uri: asset.uri }" class="thumb"></image>
        }
      </view>
    </Scenario>
  `,
})
export class MediaLibraryRecent {
  readonly color = lineColorOf(ROUTE_NAME.MediaLibrary);
  readonly steps = [
    'Press Show latest photos and allow access',
    'Choose a limited selection or full access',
  ];

  readonly assets = signal<IMediaLibraryAsset[]>([]);
  readonly status = signal('idle');

  load(): void {
    this.status.set('loading…');
    requestPermissionsAsync()
      .then(permission => {
        if (!permission.granted) {
          throw new Error('photo access was not granted');
        }
        return getAssetsAsync({
          first: RECENT_COUNT,
          mediaType: 'photo',
          sortBy: 'creationTime',
        });
      })
      .then(page => {
        this.assets.set(page.assets);
        this.status.set(`${page.assets.length} of ${page.totalCount} photos`);
      })
      .catch((error: Error) => this.status.set(`failed: ${error.message}`));
  }
}
