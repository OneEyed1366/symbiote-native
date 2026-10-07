import { defineComponent, ref } from 'vue';
import { VideoAirPlayButton, VideoView, isPictureInPictureSupported, useVideoPlayer } from '@symbiote-native/video/vue';
import type { IVideoViewHandle } from '@symbiote-native/video/vue';
import { ActionButton } from '../components/ActionButton';
import { Scenario } from '../components/Scenario';
import { ResultRow, lineColorOf } from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';
import { usePlayerEvent } from './video-parts';
import { CLIP_URI, FEED_CLIPS, FULLSCREEN_OPTIONS, MP4_URI, TIME_UPDATE_SECONDS, errorLine, pushLog } from './video-shared';

const color = lineColorOf(ROUTE_NAME.Video);

export const FeedScenario = defineComponent(
  () => {
    const player = useVideoPlayer(
      () => CLIP_URI,
      instance => {
        instance.loop = true;
        instance.muted = true;
        instance.play();
      },
    );
    const muted = usePlayerEvent(player, 'mutedChange', { muted: player.value.muted });
    const playing = usePlayerEvent(player, 'playingChange', { isPlaying: player.value.playing });
    return () => (
      <Scenario
        testID="video-feed-scenario"
        title="Autoplay a muted looping clip, tap to unmute"
        why="Feeds and product pages start a short clip silently and in a loop, and give sound only after a tap, so nothing blares at a user who is scrolling."
        steps={['Open the card and watch the clip start by itself', 'Tap Unmute', 'Press Pause']}
        expect="The clip starts without any tap, repeats when it ends and is silent. Unmute turns the sound on, Pause freezes the picture."
      >
        <view>
          <VideoView testID="video-feed" player={player.value} nativeControls={false} contentFit="cover" class="vid-feed" />
          <view class="vid-badge">
            <text class="vid-badge-text">{muted.value.muted ? 'muted' : 'sound on'}</text>
          </view>
        </view>
        <view class="button-row">
          <ActionButton testID="video-feed-mute" title={muted.value.muted ? 'Unmute' : 'Mute'} color={color} onPress={() => { player.value.muted = !player.value.muted; }} />
          <ActionButton testID="video-feed-play" title={playing.value.isPlaying ? 'Pause' : 'Play'} color={color} onPress={() => (playing.value.isPlaying ? player.value.pause() : player.value.play())} />
        </view>
      </Scenario>
    );
  },
  { name: 'FeedScenario' },
);

type IFeedItemProps = { uri: string; isActive: boolean; index: number };

// Only the active item has a source, the others unload, which is what a recycled feed does
const FeedItem = defineComponent<IFeedItemProps>(
  props => {
    const player = useVideoPlayer(
      () => (props.isActive ? props.uri : null),
      instance => {
        instance.loop = true;
        instance.muted = true;
        instance.play();
      },
    );
    const status = usePlayerEvent(player, 'statusChange', { status: player.value.status });
    return () => (
      <view class="vid-feed-item">
        <VideoView testID={`video-reel-${String(props.index)}`} player={player.value} nativeControls={false} contentFit="cover" class="vid-small" />
        <ResultRow testID={`video-reel-status-${String(props.index)}`} label={`Clip ${String(props.index + 1)}`} value={props.isActive ? status.value.status : 'unloaded'} />
      </view>
    );
  },
  { name: 'FeedItem', props: ['uri', 'isActive', 'index'] },
);

export const ReelsScenario = defineComponent(
  () => {
    const active = ref(0);
    return () => (
      <Scenario
        testID="video-reels-scenario"
        title="Play one clip at a time in a feed"
        why="Reels and story feeds keep a single player busy: the clip on screen plays and the others hold no source, so memory and data stay low. Swiping hands the player to the next clip."
        steps={['Press Next clip a few times', 'Look at the status line of each clip']}
        expect="Only the active clip is playing, with its status moving to readyToPlay. Every other clip says unloaded."
      >
        {FEED_CLIPS.map((uri, index) => (
          <FeedItem key={`${uri}-${String(index)}`} uri={uri} isActive={index === active.value} index={index} />
        ))}
        <view class="button-row">
          <ActionButton testID="video-reels-prev" title="Previous clip" color={color} onPress={() => { active.value = Math.max(0, active.value - 1); }} />
          <ActionButton testID="video-reels-next" title="Next clip" color={color} onPress={() => { active.value = Math.min(FEED_CLIPS.length - 1, active.value + 1); }} />
        </view>
      </Scenario>
    );
  },
  { name: 'ReelsScenario' },
);

export const FullscreenScenario = defineComponent(
  () => {
    const view = ref<IVideoViewHandle | null>(null);
    const player = useVideoPlayer(
      () => MP4_URI,
      instance => {
        instance.timeUpdateEventInterval = TIME_UPDATE_SECONDS;
        instance.allowsExternalPlayback = true;
      },
    );
    const external = usePlayerEvent(player, 'isExternalPlaybackActiveChange', { isExternalPlaybackActive: player.value.isExternalPlaybackActive });
    const events = ref<string[]>([]);
    const log = (line: string) => {
      events.value = pushLog(events.value, line);
    };
    const run = async (action: Promise<void> | undefined, name: string) => {
      try {
        await action;
      } catch (error: unknown) {
        log(`${name} failed: ${errorLine(error)}`);
      }
    };
    return () => (
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
          ref={view}
          player={player.value}
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
        <ResultRow testID="video-airplay-active" label="isExternalPlaybackActiveChange" value={String(external.value.isExternalPlaybackActive)} />
        <view class="button-row">
          <ActionButton testID="video-play" title="Play" color={color} onPress={() => player.value.play()} />
          <ActionButton testID="video-enter-fullscreen" title="Fullscreen" color={color} onPress={() => run(view.value?.enterFullscreen(), 'enterFullscreen')} />
          <ActionButton testID="video-start-pip" title="Picture in picture" color={color} onPress={() => run(view.value?.startPictureInPicture(), 'startPictureInPicture')} />
          <ActionButton testID="video-stop-pip" title="Stop PiP" color={color} onPress={() => run(view.value?.stopPictureInPicture(), 'stopPictureInPicture')} />
        </view>
        <view class="capability-row">
          <text class="capability-label">AirPlay route picker (iOS)</text>
          <VideoAirPlayButton testID="video-airplay" tint="#94a3b8" activeTint={color} class="vid-airplay" />
        </view>
        {events.value.length === 0 ? (
          <ResultRow testID="video-events-empty" label="Events" value="none yet" />
        ) : (
          events.value.map(line => <ResultRow key={line} testID="video-event" label="event" value={line} />)
        )}
      </Scenario>
    );
  },
  { name: 'FullscreenScenario' },
);
