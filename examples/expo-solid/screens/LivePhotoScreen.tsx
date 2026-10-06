import { For, Show, createSignal } from 'solid-js';
import { Platform } from '@symbiote-native/solid';
import { LivePhotoView } from '@symbiote-native/live-photo/solid';
import type { ILivePhotoAsset, ILivePhotoContentFit, ILivePhotoViewHandle } from '@symbiote-native/live-photo/solid';
import { ActionButton } from '../components/ActionButton';
import { Explorer, Scenario } from '../components/Scenario';
import { Card, ChoiceRow, ResultRow, ScreenShell, ToggleRow, lineColorOf } from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';
import { FIT_OPTIONS, errorLine, findNewestLivePhoto, pickLivePhoto, pushLogLine } from './live-photo-shared';

const ROUTE = ROUTE_NAME.LivePhoto;
const IS_IOS = Platform.select({ ios: true, default: false });

function EventLog(props: { lines: readonly string[] }) {
  return (
    <Show when={props.lines.length > 0} fallback={<ResultRow testID="live-photo-log-empty" label="Events" value="none yet" />}>
      <For each={props.lines}>{line => <ResultRow testID="live-photo-log" label="event" value={line} />}</For>
    </Show>
  );
}

function PickScenario(props: { onPicked: (asset: ILivePhotoAsset) => void; color: string }) {
  const [line, setLine] = createSignal('nothing picked');
  const pick = async () => {
    setLine('opening the library…');
    const result = await pickLivePhoto();
    if (result.asset !== null) {
      props.onPicked(result.asset);
    }
    setLine(result.line);
  };
  return (
    <Scenario
      testID="live-photo-pick-scenario"
      title="Let the user choose a Live Photo to view"
      why="A Live Photo is a still with a few seconds of motion around it. A gallery, a profile editor or a chat shows the chosen one and plays it on a press, as the Photos app does."
      steps={['Press Pick a Live Photo and choose one with the LIVE badge', 'Press and hold the picture below']}
      expect="The picked Live Photo shows as a still. While you hold a finger on it the motion plays with sound, and on release it settles back to the still."
    >
      <ActionButton testID="live-photo-pick" title="Pick a Live Photo" color={props.color} onPress={() => void pick()} />
      <ResultRow testID="live-photo-pick-result" label="Picker" value={line()} />
    </Scenario>
  );
}

function LibraryScenario(props: { onFound: (asset: ILivePhotoAsset) => void; color: string }) {
  const [line, setLine] = createSignal('not loaded');
  const load = async () => {
    setLine('asking for access…');
    const result = await findNewestLivePhoto();
    if (result.asset !== null) {
      props.onFound(result.asset);
    }
    setLine(result.line);
  };
  return (
    <Scenario
      testID="live-photo-library-scenario"
      title="Show the newest Live Photo without a picker"
      why="A memories widget or a latest-photo header reads the library itself: it finds the newest Live Photo and shows it, with no picker sheet."
      steps={['Press Load the newest Live Photo and allow access']}
      expect="The newest Live Photo of the device appears in the view below, ready to play. Without a Live Photo the line explains it."
    >
      <ActionButton testID="live-photo-library" title="Load the newest Live Photo" color={props.color} onPress={() => void load()} />
      <ResultRow testID="live-photo-library-result" label="Library" value={line()} />
    </Scenario>
  );
}

function Player(props: { source: ILivePhotoAsset | null; color: string }) {
  const [handle, setHandle] = createSignal<ILivePhotoViewHandle>();
  const [lines, setLines] = createSignal<string[]>([]);
  const [isMuted, setIsMuted] = createSignal(true);
  const [isGesture, setIsGesture] = createSignal(true);
  const [fit, setFit] = createSignal<ILivePhotoContentFit>('contain');
  const log = (line: string) => setLines(previous => pushLogLine(previous, line));
  const guard = (action: () => void) => {
    try {
      action();
    } catch (error: unknown) {
      log(`failed: ${errorLine(error)}`);
    }
  };
  return (
    <Card testID="live-photo-player-card" title="The Live Photo view">
      <Show
        when={props.source}
        fallback={
          <view testID="live-photo-placeholder" class="live-placeholder">
            <text class="hero-body">Pick or load a Live Photo above, it is shown here.</text>
          </view>
        }
      >
        {source => (
          <LivePhotoView
            testID="live-photo-view"
            ref={setHandle}
            class="live-view"
            source={source()}
            isMuted={isMuted()}
            contentFit={fit()}
            useDefaultGestureRecognizer={isGesture()}
            onLoadStart={() => log('load start')}
            onPreviewPhotoLoad={() => log('preview photo loaded')}
            onLoadComplete={() => log('ready to play')}
            onLoadError={error => log(`load error: ${error.message}`)}
            onPlaybackStart={() => log('playback start')}
            onPlaybackStop={() => log('playback stop')}
          />
        )}
      </Show>
      <view class="button-row">
        <ActionButton testID="live-photo-hint" title="Play a hint" color={props.color} onPress={() => guard(() => handle()?.startPlayback('hint'))} />
        <ActionButton testID="live-photo-full" title="Play fully" color={props.color} onPress={() => guard(() => handle()?.startPlayback('full'))} />
        <ActionButton testID="live-photo-stop" title="Stop" color={props.color} onPress={() => guard(() => handle()?.stopPlayback())} />
      </view>
      <EventLog lines={lines()} />
      <Explorer testID="live-photo-explorer" color={props.color}>
        <ToggleRow testID="live-photo-muted" label="isMuted" value={isMuted()} onChange={setIsMuted} color={props.color} />
        <ToggleRow testID="live-photo-gesture" label="useDefaultGestureRecognizer: press and hold plays" value={isGesture()} onChange={setIsGesture} color={props.color} />
        <ChoiceRow testID="live-photo-fit" label="contentFit" color={props.color} value={fit()} options={FIT_OPTIONS} onChange={setFit} />
      </Explorer>
    </Card>
  );
}

export function LivePhotoScreen() {
  const color = lineColorOf(ROUTE);
  const [source, setSource] = createSignal<ILivePhotoAsset | null>(null);
  return (
    <ScreenShell
      route={ROUTE}
      testID="live-photo-scroll"
      title="Live Photo"
      body="iOS only: show an Apple Live Photo, play its motion on a press and react to loading and playback events. It needs a Live Photo on the device, take one with the Camera app."
    >
      <Show when={!IS_IOS}>
        <ResultRow testID="live-photo-platform" label="Platform" value="Live Photos exist on iOS only, the view renders nothing here" />
      </Show>
      <PickScenario onPicked={setSource} color={color} />
      <LibraryScenario onFound={setSource} color={color} />
      <Player source={source()} color={color} />
    </ScreenShell>
  );
}
