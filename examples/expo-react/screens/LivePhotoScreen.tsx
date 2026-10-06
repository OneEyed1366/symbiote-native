import { useRef, useState } from 'react';
import { Platform } from '@symbiote-native/react';
import { LivePhotoView } from '@symbiote-native/live-photo/react';
import type { ILivePhotoAsset, ILivePhotoContentFit, ILivePhotoViewHandle } from '@symbiote-native/live-photo/react';
import { launchImageLibraryAsync } from '@symbiote-native/image-picker';
import { getAssetInfoAsync, getAssetsAsync, requestPermissionsAsync } from '@symbiote-native/media-library/legacy';
import { ActionButton } from '../components/ActionButton';
import { Explorer, Scenario } from '../components/Scenario';
import { Card, ChoiceRow, ResultRow, ScreenShell, ToggleRow, lineColorOf } from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';

const ROUTE = ROUTE_NAME.LivePhoto;
const IS_IOS = Platform.select({ ios: true, default: false });
const MAX_LOG_LINES = 6;
const FITS: readonly ILivePhotoContentFit[] = ['contain', 'cover'];

function errorLine(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function useEventLog() {
  const [lines, setLines] = useState<string[]>([]);
  const log = (line: string) =>
    setLines(previous => [`${new Date().toLocaleTimeString()} ${line}`, ...previous].slice(0, MAX_LOG_LINES));
  return { lines, log };
}

function EventLog({ lines }: { lines: readonly string[] }) {
  return lines.length === 0 ? (
    <ResultRow testID="live-photo-log-empty" label="Events" value="none yet" />
  ) : (
    <>
      {lines.map(line => (
        <ResultRow key={line} testID="live-photo-log" label="event" value={line} />
      ))}
    </>
  );
}

function PickScenario({ onPicked, color }: { onPicked: (asset: ILivePhotoAsset) => void; color: string }) {
  const [line, setLine] = useState('nothing picked');
  const pick = () => {
    setLine('opening the library…');
    launchImageLibraryAsync({ mediaTypes: ['livePhotos'] })
      .then(result => {
        const asset = result.canceled ? undefined : result.assets[0];
        if (asset === undefined) {
          setLine('canceled');
          return;
        }
        const video = asset.pairedVideoAsset;
        if (video === null || video === undefined) {
          setLine('that photo has no video part: pick a Live Photo');
          return;
        }
        onPicked({ photoUri: asset.uri, pairedVideoUri: video.uri });
        setLine(`picked ${asset.width}x${asset.height}`);
      })
      .catch((error: unknown) => setLine(`failed: ${errorLine(error)}`));
  };
  return (
    <Scenario
      testID="live-photo-pick-scenario"
      title="Let the user choose a Live Photo to view"
      why="A Live Photo is a still with a few seconds of motion around it. A gallery, a profile editor or a chat shows the chosen one and plays it on a press, as the Photos app does."
      steps={['Press Pick a Live Photo and choose one with the LIVE badge', 'Press and hold the picture below']}
      expect="The picked Live Photo shows as a still. While you hold a finger on it the motion plays with sound, and on release it settles back to the still."
    >
      <ActionButton testID="live-photo-pick" title="Pick a Live Photo" color={color} onPress={pick} />
      <ResultRow testID="live-photo-pick-result" label="Picker" value={line} />
    </Scenario>
  );
}

function LibraryScenario({ onFound, color }: { onFound: (asset: ILivePhotoAsset) => void; color: string }) {
  const [line, setLine] = useState('not loaded');
  const load = () => {
    setLine('asking for access…');
    requestPermissionsAsync()
      .then(permission => {
        if (!permission.granted) {
          throw new Error('photo library access was not granted');
        }
        return getAssetsAsync({ first: 1, mediaType: 'photo', mediaSubtypes: ['livePhoto'], sortBy: 'creationTime' });
      })
      .then(page => {
        const newest = page.assets[0];
        if (newest === undefined) {
          throw new Error('no Live Photo in the library');
        }
        return getAssetInfoAsync(newest);
      })
      .then(info => {
        const photoUri = info.localUri ?? info.uri;
        const videoUri = info.pairedVideoAsset?.uri;
        if (videoUri === undefined) {
          throw new Error('the asset has no paired video');
        }
        onFound({ photoUri, pairedVideoUri: videoUri });
        setLine(`loaded ${info.filename}`);
      })
      .catch((error: unknown) => setLine(`failed: ${errorLine(error)}`));
  };
  return (
    <Scenario
      testID="live-photo-library-scenario"
      title="Show the newest Live Photo without a picker"
      why="A memories widget or a latest-photo header reads the library itself: it finds the newest Live Photo and shows it, with no picker sheet."
      steps={['Press Load the newest Live Photo and allow access']}
      expect="The newest Live Photo of the device appears in the view below, ready to play. Without a Live Photo the line explains it."
    >
      <ActionButton testID="live-photo-library" title="Load the newest Live Photo" color={color} onPress={load} />
      <ResultRow testID="live-photo-library-result" label="Library" value={line} />
    </Scenario>
  );
}

function Player({ source, color }: { source: ILivePhotoAsset | null; color: string }) {
  const handle = useRef<ILivePhotoViewHandle>(null);
  const { lines, log } = useEventLog();
  const [isMuted, setIsMuted] = useState(true);
  const [isGesture, setIsGesture] = useState(true);
  const [fit, setFit] = useState<ILivePhotoContentFit>('contain');
  const guard = (action: () => void) => {
    try {
      action();
    } catch (error: unknown) {
      log(`failed: ${errorLine(error)}`);
    }
  };
  return (
    <Card testID="live-photo-player-card" title="The Live Photo view">
      {source === null ? (
        <view testID="live-photo-placeholder" className="live-placeholder">
          <text className="hero-body">Pick or load a Live Photo above, it is shown here.</text>
        </view>
      ) : (
        <LivePhotoView
          testID="live-photo-view"
          ref={handle}
          className="live-view"
          source={source}
          isMuted={isMuted}
          contentFit={fit}
          useDefaultGestureRecognizer={isGesture}
          onLoadStart={() => log('load start')}
          onPreviewPhotoLoad={() => log('preview photo loaded')}
          onLoadComplete={() => log('ready to play')}
          onLoadError={error => log(`load error: ${error.message}`)}
          onPlaybackStart={() => log('playback start')}
          onPlaybackStop={() => log('playback stop')}
        />
      )}
      <view className="button-row">
        <ActionButton testID="live-photo-hint" title="Play a hint" color={color} onPress={() => guard(() => handle.current?.startPlayback('hint'))} />
        <ActionButton testID="live-photo-full" title="Play fully" color={color} onPress={() => guard(() => handle.current?.startPlayback('full'))} />
        <ActionButton testID="live-photo-stop" title="Stop" color={color} onPress={() => guard(() => handle.current?.stopPlayback())} />
      </view>
      <EventLog lines={lines} />
      <Explorer testID="live-photo-explorer" color={color}>
        <ToggleRow testID="live-photo-muted" label="isMuted" value={isMuted} onChange={setIsMuted} color={color} />
        <ToggleRow testID="live-photo-gesture" label="useDefaultGestureRecognizer: press and hold plays" value={isGesture} onChange={setIsGesture} color={color} />
        <ChoiceRow testID="live-photo-fit" label="contentFit" color={color} value={fit} options={FITS.map(item => ({ label: item, value: item }))} onChange={setFit} />
      </Explorer>
    </Card>
  );
}

export function LivePhotoScreen() {
  const color = lineColorOf(ROUTE);
  const [source, setSource] = useState<ILivePhotoAsset | null>(null);
  return (
    <ScreenShell
      route={ROUTE}
      testID="live-photo-scroll"
      title="Live Photo"
      body="iOS only: show an Apple Live Photo, play its motion on a press and react to loading and playback events. It needs a Live Photo on the device, take one with the Camera app."
    >
      {!IS_IOS && <ResultRow testID="live-photo-platform" label="Platform" value="Live Photos exist on iOS only, the view renders nothing here" />}
      <PickScenario onPicked={setSource} color={color} />
      <LibraryScenario onFound={setSource} color={color} />
      <Player source={source} color={color} />
    </ScreenShell>
  );
}
