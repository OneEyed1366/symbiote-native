<script lang="ts">
  import { VideoAirPlayButton, VideoView, isPictureInPictureSupported, useVideoPlayer } from '@symbiote-native/video/svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import ResultRow from '../components/ResultRow.svelte';
  import Scenario from '../components/Scenario.svelte';
  import { usePlayerEvent } from './video-parts';
  import { FULLSCREEN_OPTIONS, MP4_URI, TIME_UPDATE_SECONDS, errorLine, pushLog } from './video-shared';

  const { color }: { color: string } = $props();

  type IViewHandle = {
    enterFullscreen: () => Promise<void>;
    startPictureInPicture: () => Promise<void>;
    stopPictureInPicture: () => Promise<void>;
  };

  let view = $state<IViewHandle | undefined>();
  const player = useVideoPlayer(
    () => MP4_URI,
    instance => {
      instance.timeUpdateEventInterval = TIME_UPDATE_SECONDS;
      instance.allowsExternalPlayback = true;
    },
  );
  const external = usePlayerEvent(player, 'isExternalPlaybackActiveChange', { isExternalPlaybackActive: player.current.isExternalPlaybackActive });
  let events = $state<string[]>([]);

  const log = (line: string) => (events = pushLog(events, line));

  async function run(action: Promise<void> | undefined, name: string): Promise<void> {
    try {
      await action;
    } catch (error) {
      log(`${name} failed: ${errorLine(error)}`);
    }
  }
</script>

<Scenario
  testID="video-fullscreen-scenario"
  title="Go fullscreen, keep watching in a corner window, or cast"
  why="Players offer fullscreen for movies, picture in picture to keep a video over other apps, and AirPlay to send it to a TV."
  steps={[
    'Press Fullscreen, then leave it with the system button',
    'Start playing, press Picture in picture and go to the home screen',
    'On iOS tap the AirPlay button and pick a device',
  ]}
  expect="Each action adds a line to the event log: fullscreen enter and exit, picture in picture start and stop. The video keeps playing in its small window, and AirPlay shows true while casting."
>
  <VideoView
    bind:this={view}
    testID="video-fullscreen"
    player={player.current}
    nativeControls
    allowsPictureInPicture
    startsPictureInPictureAutomatically
    fullscreenOptions={FULLSCREEN_OPTIONS}
    onFullscreenEnter={() => log('fullscreen enter')}
    onFullscreenExit={() => log('fullscreen exit')}
    onPictureInPictureStart={() => log('picture in picture start')}
    onPictureInPictureStop={() => log('picture in picture stop')}
    onFirstFrameRender={() => log('first frame rendered')}
    class="vid-video"
  />
  <ResultRow testID="video-pip-supported" label="isPictureInPictureSupported()" value={String(isPictureInPictureSupported())} />
  <ResultRow testID="video-airplay-active" label="isExternalPlaybackActiveChange" value={String(external.current.isExternalPlaybackActive)} />
  <view class="button-row">
    <ActionButton testID="video-play" title="Play" {color} onPress={() => player.current.play()} />
    <ActionButton testID="video-enter-fullscreen" title="Fullscreen" {color} onPress={() => run(view?.enterFullscreen(), 'enterFullscreen')} />
    <ActionButton testID="video-start-pip" title="Picture in picture" {color} onPress={() => run(view?.startPictureInPicture(), 'startPictureInPicture')} />
    <ActionButton testID="video-stop-pip" title="Stop PiP" {color} onPress={() => run(view?.stopPictureInPicture(), 'stopPictureInPicture')} />
  </view>
  <view class="capability-row">
    <text class="capability-label">AirPlay route picker (iOS)</text>
    <VideoAirPlayButton testID="video-airplay" tint="#94a3b8" activeTint={color} class="vid-airplay" />
  </view>
  {#if events.length === 0}
    <ResultRow testID="video-events-empty" label="Events" value="none yet" />
  {:else}
    {#each events as line (line)}
      <ResultRow testID="video-event" label="event" value={line} />
    {/each}
  {/if}
</Scenario>
