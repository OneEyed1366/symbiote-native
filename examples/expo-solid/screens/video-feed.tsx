import { For, createSignal } from 'solid-js';
import { VideoAirPlayButton, VideoView, isPictureInPictureSupported, useVideoPlayer } from '@symbiote-native/video/solid';
import type { IVideoViewHandle } from '@symbiote-native/video/solid';
import { ActionButton } from '../components/ActionButton';
import { Scenario } from '../components/Scenario';
import { ResultRow } from '../components/ScreenShell';
import { usePlayerEvent } from './video-parts';
import { CLIP_URI, FEED_CLIPS, FULLSCREEN_OPTIONS, MP4_URI, TIME_UPDATE_SECONDS, errorLine, pushLog } from './video-shared';

export function FeedScenario(props: { color: string }) {
  const player = useVideoPlayer(
    () => CLIP_URI,
    instance => {
      instance.loop = true;
      instance.muted = true;
      instance.play();
    },
  );
  const muted = usePlayerEvent(player, 'mutedChange', { muted: player().muted });
  const playing = usePlayerEvent(player, 'playingChange', { isPlaying: player().playing });
  return (
    <Scenario
      testID="video-feed-scenario"
      title="Autoplay a muted looping clip, tap to unmute"
      why="Feeds and product pages start a short clip silently and in a loop, and give sound only after a tap, so nothing blares at a user who is scrolling."
      steps={['Open the card and watch the clip start by itself', 'Tap Unmute', 'Press Pause']}
      expect="The clip starts without any tap, repeats when it ends and is silent. Unmute turns the sound on, Pause freezes the picture."
    >
      <view>
        <VideoView testID="video-feed" player={player()} nativeControls={false} contentFit="cover" class="vid-feed" />
        <view class="vid-badge">
          <text class="vid-badge-text">{muted().muted ? 'muted' : 'sound on'}</text>
        </view>
      </view>
      <view class="button-row">
        <ActionButton testID="video-feed-mute" title={muted().muted ? 'Unmute' : 'Mute'} color={props.color} onPress={() => (player().muted = !player().muted)} />
        <ActionButton testID="video-feed-play" title={playing().isPlaying ? 'Pause' : 'Play'} color={props.color} onPress={() => (playing().isPlaying ? player().pause() : player().play())} />
      </view>
    </Scenario>
  );
}

// Only the active item has a source, the others unload, which is what a recycled feed does
function FeedItem(props: { uri: string; isActive: boolean; index: number }) {
  const player = useVideoPlayer(
    () => (props.isActive ? props.uri : null),
    instance => {
      instance.loop = true;
      instance.muted = true;
      instance.play();
    },
  );
  const status = usePlayerEvent(player, 'statusChange', { status: player().status });
  return (
    <view class="vid-feed-item">
      <VideoView testID={`video-reel-${String(props.index)}`} player={player()} nativeControls={false} contentFit="cover" class="vid-small" />
      <ResultRow testID={`video-reel-status-${String(props.index)}`} label={`Clip ${String(props.index + 1)}`} value={props.isActive ? status().status : 'unloaded'} />
    </view>
  );
}

export function ReelsScenario(props: { color: string }) {
  const [active, setActive] = createSignal(0);
  return (
    <Scenario
      testID="video-reels-scenario"
      title="Play one clip at a time in a feed"
      why="Reels and story feeds keep a single player busy: the clip on screen plays and the others hold no source, so memory and data stay low. Swiping hands the player to the next clip."
      steps={['Press Next clip a few times', 'Look at the status line of each clip']}
      expect="Only the active clip is playing, with its status moving to readyToPlay. Every other clip says unloaded."
    >
      <For each={FEED_CLIPS}>
        {(uri, index) => <FeedItem uri={uri} isActive={index() === active()} index={index()} />}
      </For>
      <view class="button-row">
        <ActionButton testID="video-reels-prev" title="Previous clip" color={props.color} onPress={() => setActive(value => Math.max(0, value - 1))} />
        <ActionButton testID="video-reels-next" title="Next clip" color={props.color} onPress={() => setActive(value => Math.min(FEED_CLIPS.length - 1, value + 1))} />
      </view>
    </Scenario>
  );
}

export function FullscreenScenario(props: { color: string }) {
  const [view, setView] = createSignal<IVideoViewHandle>();
  const player = useVideoPlayer(
    () => MP4_URI,
    instance => {
      instance.timeUpdateEventInterval = TIME_UPDATE_SECONDS;
      instance.allowsExternalPlayback = true;
    },
  );
  const external = usePlayerEvent(player, 'isExternalPlaybackActiveChange', { isExternalPlaybackActive: player().isExternalPlaybackActive });
  const [events, setEvents] = createSignal<string[]>([]);
  const log = (line: string) => setEvents(previous => pushLog(previous, line));
  const run = async (action: Promise<void> | undefined, name: string) => {
    try {
      await action;
    } catch (error: unknown) {
      log(`${name} failed: ${errorLine(error)}`);
    }
  };
  return (
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
        testID="video-fullscreen"
        ref={setView}
        player={player()}
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
      <ResultRow testID="video-airplay-active" label="isExternalPlaybackActiveChange" value={String(external().isExternalPlaybackActive)} />
      <view class="button-row">
        <ActionButton testID="video-play" title="Play" color={props.color} onPress={() => player().play()} />
        <ActionButton testID="video-enter-fullscreen" title="Fullscreen" color={props.color} onPress={() => run(view()?.enterFullscreen(), 'enterFullscreen')} />
        <ActionButton testID="video-start-pip" title="Picture in picture" color={props.color} onPress={() => run(view()?.startPictureInPicture(), 'startPictureInPicture')} />
        <ActionButton testID="video-stop-pip" title="Stop PiP" color={props.color} onPress={() => run(view()?.stopPictureInPicture(), 'stopPictureInPicture')} />
      </view>
      <view class="capability-row">
        <text class="capability-label">AirPlay route picker (iOS)</text>
        <VideoAirPlayButton testID="video-airplay" tint="#94a3b8" activeTint={props.color} class="vid-airplay" />
      </view>
      {events().length === 0 ? (
        <ResultRow testID="video-events-empty" label="Events" value="none yet" />
      ) : (
        <For each={events()}>{line => <ResultRow testID="video-event" label="event" value={line} />}</For>
      )}
    </Scenario>
  );
}
