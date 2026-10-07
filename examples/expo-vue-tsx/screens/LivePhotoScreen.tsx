import { defineComponent, ref } from 'vue';
import { Platform } from '@symbiote-native/vue';
import { LivePhotoView } from '@symbiote-native/live-photo/vue';
import type { ILivePhotoAsset, ILivePhotoContentFit, ILivePhotoViewHandle } from '@symbiote-native/live-photo/vue';
import { ActionButton } from '../components/ActionButton';
import { Explorer, Scenario } from '../components/Scenario';
import { Card, ChoiceRow, ResultRow, ScreenShell, ToggleRow, lineColorOf } from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';
import { FIT_OPTIONS, errorLine, findNewestLivePhoto, pickLivePhoto, pushLogLine } from './live-photo-shared';

const ROUTE = ROUTE_NAME.LivePhoto;
const IS_IOS = Platform.select({ ios: true, default: false });
const color = lineColorOf(ROUTE);

const EventLog = defineComponent<{ lines: readonly string[] }>(
  props => () =>
    props.lines.length === 0 ? (
      <ResultRow testID="live-photo-log-empty" label="Events" value="none yet" />
    ) : (
      <>
        {props.lines.map(line => (
          <ResultRow key={line} testID="live-photo-log" label="event" value={line} />
        ))}
      </>
    ),
  { name: 'EventLog', props: ['lines'] },
);

type ISourceProps = { onSource: (asset: ILivePhotoAsset) => void };

const PickScenario = defineComponent<ISourceProps>(
  props => {
    const line = ref('nothing picked');
    const pick = async () => {
      line.value = 'opening the library…';
      const result = await pickLivePhoto();
      if (result.asset !== null) {
        props.onSource(result.asset);
      }
      line.value = result.line;
    };
    return () => (
      <Scenario
        testID="live-photo-pick-scenario"
        title="Let the user choose a Live Photo to view"
        why="A Live Photo is a still with a few seconds of motion around it. A gallery, a profile editor or a chat shows the chosen one and plays it on a press, as the Photos app does."
        steps={['Press Pick a Live Photo and choose one with the LIVE badge', 'Press and hold the picture below']}
        expect="The picked Live Photo shows as a still. While you hold a finger on it the motion plays with sound, and on release it settles back to the still."
      >
        <ActionButton testID="live-photo-pick" title="Pick a Live Photo" color={color} onPress={() => void pick()} />
        <ResultRow testID="live-photo-pick-result" label="Picker" value={line.value} />
      </Scenario>
    );
  },
  { name: 'PickScenario', props: ['onSource'] },
);

const LibraryScenario = defineComponent<ISourceProps>(
  props => {
    const line = ref('not loaded');
    const load = async () => {
      line.value = 'asking for access…';
      const result = await findNewestLivePhoto();
      if (result.asset !== null) {
        props.onSource(result.asset);
      }
      line.value = result.line;
    };
    return () => (
      <Scenario
        testID="live-photo-library-scenario"
        title="Show the newest Live Photo without a picker"
        why="A memories widget or a latest-photo header reads the library itself: it finds the newest Live Photo and shows it, with no picker sheet."
        steps={['Press Load the newest Live Photo and allow access']}
        expect="The newest Live Photo of the device appears in the view below, ready to play. Without a Live Photo the line explains it."
      >
        <ActionButton testID="live-photo-library" title="Load the newest Live Photo" color={color} onPress={() => void load()} />
        <ResultRow testID="live-photo-library-result" label="Library" value={line.value} />
      </Scenario>
    );
  },
  { name: 'LibraryScenario', props: ['onSource'] },
);

const Player = defineComponent<{ source: ILivePhotoAsset | null }>(
  props => {
    const handle = ref<ILivePhotoViewHandle | null>(null);
    const lines = ref<string[]>([]);
    const isMuted = ref(true);
    const isGesture = ref(true);
    const fit = ref<ILivePhotoContentFit>('contain');
    const log = (line: string) => {
      lines.value = pushLogLine(lines.value, line);
    };
    const guard = (action: () => void) => {
      try {
        action();
      } catch (error: unknown) {
        log(`failed: ${errorLine(error)}`);
      }
    };
    return () => (
      <Card testID="live-photo-player-card" title="The Live Photo view">
        {props.source === null ? (
          <view testID="live-photo-placeholder" class="live-placeholder">
            <text class="hero-body">Pick or load a Live Photo above, it is shown here.</text>
          </view>
        ) : (
          <LivePhotoView
            testID="live-photo-view"
            ref={handle}
            class="live-view"
            source={props.source}
            isMuted={isMuted.value}
            contentFit={fit.value}
            useDefaultGestureRecognizer={isGesture.value}
            onLoadStart={() => log('load start')}
            onPreviewPhotoLoad={() => log('preview photo loaded')}
            onLoadComplete={() => log('ready to play')}
            onLoadError={error => log(`load error: ${error.message}`)}
            onPlaybackStart={() => log('playback start')}
            onPlaybackStop={() => log('playback stop')}
          />
        )}
        <view class="button-row">
          <ActionButton testID="live-photo-hint" title="Play a hint" color={color} onPress={() => guard(() => handle.value?.startPlayback('hint'))} />
          <ActionButton testID="live-photo-full" title="Play fully" color={color} onPress={() => guard(() => handle.value?.startPlayback('full'))} />
          <ActionButton testID="live-photo-stop" title="Stop" color={color} onPress={() => guard(() => handle.value?.stopPlayback())} />
        </view>
        <EventLog lines={lines.value} />
        <Explorer testID="live-photo-explorer" color={color}>
          <ToggleRow testID="live-photo-muted" label="isMuted" value={isMuted.value} onChange={value => { isMuted.value = value; }} color={color} />
          <ToggleRow testID="live-photo-gesture" label="useDefaultGestureRecognizer: press and hold plays" value={isGesture.value} onChange={value => { isGesture.value = value; }} color={color} />
          <ChoiceRow testID="live-photo-fit" label="contentFit" color={color} value={fit.value} options={FIT_OPTIONS} onChange={value => { fit.value = value; }} />
        </Explorer>
      </Card>
    );
  },
  { name: 'Player', props: ['source'] },
);

export const LivePhotoScreen = defineComponent(
  () => {
    const source = ref<ILivePhotoAsset | null>(null);
    const setSource = (asset: ILivePhotoAsset) => {
      source.value = asset;
    };
    return () => (
      <ScreenShell
        route={ROUTE}
        testID="live-photo-scroll"
        title="Live Photo"
        body="iOS only: show an Apple Live Photo, play its motion on a press and react to loading and playback events. It needs a Live Photo on the device, take one with the Camera app."
      >
        {!IS_IOS && <ResultRow testID="live-photo-platform" label="Platform" value="Live Photos exist on iOS only, the view renders nothing here" />}
        <PickScenario onSource={setSource} />
        <LibraryScenario onSource={setSource} />
        <Player source={source.value} />
      </ScreenShell>
    );
  },
  { name: 'LivePhotoScreen' },
);
