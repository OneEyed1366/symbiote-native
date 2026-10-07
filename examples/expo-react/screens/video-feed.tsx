import { useRef, useState } from 'react';
import { VideoAirPlayButton, VideoView, isPictureInPictureSupported, useVideoPlayer } from '@symbiote-native/video/react';
import type { IVideoViewHandle } from '@symbiote-native/video/react';
import { ActionButton } from '../components/ActionButton';
import { Scenario } from '../components/Scenario';
import { ResultRow } from '../components/ScreenShell';
import { CLIP_URI, MP4_URI, TIME_UPDATE_SECONDS, usePlayerEvent } from './video-parts';

export function FeedScenario({ color }: { color: string }) {
  const player = useVideoPlayer(CLIP_URI, instance => {
    instance.loop = true;
    instance.muted = true;
    instance.play();
  });
  const muted = usePlayerEvent(player, 'mutedChange', { muted: player.muted });
  const playing = usePlayerEvent(player, 'playingChange', { isPlaying: player.playing });
  return (
    <Scenario
      testID="video-feed-scenario"
      title="Autoplay a muted looping clip, tap to unmute"
      why="Feeds and product pages start a short clip silently and in a loop, and give sound only after a tap, so nothing blares at a user who is scrolling."
      steps={['Open the card and watch the clip start by itself', 'Tap Unmute', 'Press Pause']}
      expect="The clip starts without any tap, repeats when it ends and is silent. Unmute turns the sound on, Pause freezes the picture."
    >
      <view>
        <VideoView testID="video-feed" player={player} nativeControls={false} contentFit="cover" className="vid-feed" />
        <view className="vid-badge">
          <text className="vid-badge-text">{muted.muted ? 'muted' : 'sound on'}</text>
        </view>
      </view>
      <view className="button-row">
        <ActionButton testID="video-feed-mute" title={muted.muted ? 'Unmute' : 'Mute'} color={color} onPress={() => (player.muted = !player.muted)} />
        <ActionButton testID="video-feed-play" title={playing.isPlaying ? 'Pause' : 'Play'} color={color} onPress={() => (playing.isPlaying ? player.pause() : player.play())} />
      </view>
    </Scenario>
  );
}

const FEED_CLIPS = [CLIP_URI, MP4_URI, CLIP_URI];

// Only the active item has a source, the others unload, which is what a recycled feed does
function FeedItem({ uri, isActive, index }: { uri: string; isActive: boolean; index: number }) {
  const player = useVideoPlayer(isActive ? uri : null, instance => {
    instance.loop = true;
    instance.muted = true;
    instance.play();
  });
  const status = usePlayerEvent(player, 'statusChange', { status: player.status });
  return (
    <view className="vid-feed-item">
      <VideoView testID={`video-reel-${String(index)}`} player={player} nativeControls={false} contentFit="cover" className="vid-small" />
      <ResultRow testID={`video-reel-status-${String(index)}`} label={`Clip ${String(index + 1)}`} value={isActive ? status.status : 'unloaded'} />
    </view>
  );
}

export function ReelsScenario({ color }: { color: string }) {
  const [active, setActive] = useState(0);
  return (
    <Scenario
      testID="video-reels-scenario"
      title="Play one clip at a time in a feed"
      why="Reels and story feeds keep a single player busy: the clip on screen plays and the others hold no source, so memory and data stay low. Swiping hands the player to the next clip."
      steps={['Press Next clip a few times', 'Look at the status line of each clip']}
      expect="Only the active clip is playing, with its status moving to readyToPlay. Every other clip says unloaded."
    >
      {FEED_CLIPS.map((uri, index) => (
        // eslint-disable-next-line react/no-array-index-key
        <FeedItem key={`${uri}-${String(index)}`} uri={uri} isActive={index === active} index={index} />
      ))}
      <view className="button-row">
        <ActionButton testID="video-reels-prev" title="Previous clip" color={color} onPress={() => setActive(value => Math.max(0, value - 1))} />
        <ActionButton testID="video-reels-next" title="Next clip" color={color} onPress={() => setActive(value => Math.min(FEED_CLIPS.length - 1, value + 1))} />
      </view>
    </Scenario>
  );
}

export function FullscreenScenario({ color }: { color: string }) {
  const view = useRef<IVideoViewHandle>(null);
  const player = useVideoPlayer(MP4_URI, instance => {
    instance.timeUpdateEventInterval = TIME_UPDATE_SECONDS;
    instance.allowsExternalPlayback = true;
  });
  const external = usePlayerEvent(player, 'isExternalPlaybackActiveChange', { isExternalPlaybackActive: player.isExternalPlaybackActive });
  const [events, setEvents] = useState<string[]>([]);
  const log = (line: string) => setEvents(previous => [`${new Date().toLocaleTimeString()} ${line}`, ...previous].slice(0, 4));
  const run = (action: Promise<void> | undefined, name: string) =>
    action?.catch((error: Error) => log(`${name} failed: ${error.message}`));
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
        ref={view}
        player={player}
        nativeControls
        allowsPictureInPicture
        startsPictureInPictureAutomatically
        fullscreenOptions={{ enable: true, orientation: 'landscape', autoExitOnRotate: false }}
        onFullscreenEnter={() => log('fullscreen enter')}
        onFullscreenExit={() => log('fullscreen exit')}
        onPictureInPictureStart={() => log('picture in picture start')}
        onPictureInPictureStop={() => log('picture in picture stop')}
        onFirstFrameRender={() => log('first frame rendered')}
        className="vid-video"
      />
      <ResultRow testID="video-pip-supported" label="isPictureInPictureSupported()" value={String(isPictureInPictureSupported())} />
      <ResultRow testID="video-airplay-active" label="isExternalPlaybackActiveChange" value={String(external.isExternalPlaybackActive)} />
      <view className="button-row">
        <ActionButton testID="video-play" title="Play" color={color} onPress={() => player.play()} />
        <ActionButton testID="video-enter-fullscreen" title="Fullscreen" color={color} onPress={() => run(view.current?.enterFullscreen(), 'enterFullscreen')} />
        <ActionButton testID="video-start-pip" title="Picture in picture" color={color} onPress={() => run(view.current?.startPictureInPicture(), 'startPictureInPicture')} />
        <ActionButton testID="video-stop-pip" title="Stop PiP" color={color} onPress={() => run(view.current?.stopPictureInPicture(), 'stopPictureInPicture')} />
      </view>
      <view className="capability-row">
        <text className="capability-label">AirPlay route picker (iOS)</text>
        <VideoAirPlayButton testID="video-airplay" tint="#94a3b8" activeTint={color} className="vid-airplay" />
      </view>
      {events.length === 0 ? <ResultRow testID="video-events-empty" label="Events" value="none yet" /> : events.map(line => <ResultRow key={line} testID="video-event" label="event" value={line} />)}
    </Scenario>
  );
}
