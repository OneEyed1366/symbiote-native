import { useState } from 'react';
import {
  getAssetsAsync,
  requestPermissionsAsync,
} from '@symbiote-native/media-library/legacy';
import type { IMediaLibraryAsset } from '@symbiote-native/media-library/legacy';
import { ActionButton } from '../components/ActionButton';
import { Explorer, Scenario } from '../components/Scenario';
import { ResultRow, ScreenShell, lineColorOf } from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';
import { LegacyCards } from './media-library-legacy';
import { ModernCards } from './media-library-modern';

const color = lineColorOf(ROUTE_NAME.MediaLibrary);
const RECENT_COUNT = 6;

function RecentPhotos() {
  const [assets, setAssets] = useState<IMediaLibraryAsset[]>([]);
  const [status, setStatus] = useState('idle');

  const load = () => {
    setStatus('loading…');
    requestPermissionsAsync()
      .then(permission => {
        if (!permission.granted) {
          throw new Error('photo access was not granted');
        }
        return getAssetsAsync({ first: RECENT_COUNT, mediaType: 'photo', sortBy: 'creationTime' });
      })
      .then(page => {
        setAssets(page.assets);
        setStatus(`${page.assets.length} of ${page.totalCount} photos`);
      })
      .catch((error: Error) => setStatus(`failed: ${error.message}`));
  };

  return (
    <Scenario
      testID="media-library-recent-scenario"
      title="Show the user's latest photos in your own gallery"
      why="Build a custom photo picker, a memories strip or a photo backup screen by reading the library directly, with access the user can limit to selected photos."
      steps={['Press Show latest photos and allow access', 'Choose a limited selection or full access']}
      expect="Up to six of the newest photos appear as thumbnails and the status shows how many photos the library holds. Denying access shows the reason instead."
    >
      <ActionButton testID="media-library-recent-button" title="Show latest photos" onPress={load} color={color} />
      <ResultRow testID="media-library-recent-status" label="Status" value={status} />
      <view className="thumb-row">
        {assets.map(asset => (
          <image key={asset.id} source={{ uri: asset.uri }} className="thumb" />
        ))}
      </view>
    </Scenario>
  );
}

export function MediaLibraryScreen() {
  return (
    <ScreenShell
      route={ROUTE_NAME.MediaLibrary}
      testID="media-library-scroll"
      title="Media Library"
      body="Read and manage the user's photos, videos and albums: list recent media, save new files, create albums and watch for changes. Delete and create buttons in the explorer act on the ids you pass, so the read-only calls are safe to tap freely."
    >
      <RecentPhotos />
      <Explorer testID="media-library-explorer" color={color}>
        <ModernCards />
        <LegacyCards />
      </Explorer>
    </ScreenShell>
  );
}
