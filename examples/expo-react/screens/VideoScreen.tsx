import { useState } from 'react';
import { VideoView, useVideoPlayer } from '@symbiote-native/video/react';
import { ActionButton } from '../components/ActionButton';
import { Scenario } from '../components/Scenario';
import { Card, ChoiceRow, ResultRow, ScreenShell, ToggleRow, lineColorOf } from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';
import { FeedScenario, FullscreenScenario, ReelsScenario } from './video-feed';
import { VideoMedia } from './video-media';
import { MP4_URI, PlayerStatusRows, TIME_UPDATE_SECONDS, usePlayerEvent } from './video-parts';

const ROUTE = ROUTE_NAME.Video;
const SEEK_SECONDS = 10;
const RATES = [0.5, 1, 1.5, 2].map(rate => ({ label: `${rate}x`, value: rate }));

function BasicScenario() {
  const player = useVideoPlayer(MP4_URI, instance => {
    instance.timeUpdateEventInterval = TIME_UPDATE_SECONDS;
  });
  return (
    <Scenario
      testID="video-basic-scenario"
      title="Play a video with the system controls"
      why="The quickest video screen: one source, native play, seek, fullscreen and subtitles buttons. Lessons, trailers and tutorials need nothing more."
      steps={['Press play on the native controls', 'Drag the progress bar', 'Press pause']}
      expect="The video plays with sound, the lines below follow it live: status goes loading, readyToPlay, playing turns true, the time moves, and pause turns playing back to false."
    >
      <VideoView testID="video-basic" player={player} nativeControls contentFit="contain" className="vid-video" />
      <PlayerStatusRows player={player} prefix="video-basic" />
    </Scenario>
  );
}

function CustomControlsScenario({ color }: { color: string }) {
  const player = useVideoPlayer(MP4_URI, instance => {
    instance.timeUpdateEventInterval = TIME_UPDATE_SECONDS;
    instance.volume = 0.8;
  });
  const playing = usePlayerEvent(player, 'playingChange', { isPlaying: player.playing });
  const rate = usePlayerEvent(player, 'playbackRateChange', { playbackRate: player.playbackRate });
  const muted = usePlayerEvent(player, 'mutedChange', { muted: player.muted });
  const [isLooping, setIsLooping] = useState(false);
  return (
    <Scenario
      testID="video-custom-scenario"
      title="Build your own player controls"
      why="Branded players, lesson apps and short-video feeds hide the system bar and draw their own buttons over the video, driven by the player object."
      steps={['Press Play, then Seek +10 s and Seek -10 s', 'Change the speed to 2x', 'Press Mute, then Replay']}
      expect="The picture jumps 10 seconds each way, plays twice as fast at 2x, goes silent when muted, and Replay starts again from 0:00."
    >
      <VideoView testID="video-custom" player={player} nativeControls={false} contentFit="cover" className="vid-video" />
      <PlayerStatusRows player={player} prefix="video-custom" />
      <view className="button-row">
        <ActionButton testID="video-custom-play" title={playing.isPlaying ? 'Pause' : 'Play'} color={color} onPress={() => (playing.isPlaying ? player.pause() : player.play())} />
        <ActionButton testID="video-custom-back" title={`-${SEEK_SECONDS} s`} color={color} onPress={() => player.seekBy(-SEEK_SECONDS)} />
        <ActionButton testID="video-custom-forward" title={`+${SEEK_SECONDS} s`} color={color} onPress={() => player.seekBy(SEEK_SECONDS)} />
        <ActionButton testID="video-custom-replay" title="Replay" color={color} onPress={() => player.replay()} />
      </view>
      <ChoiceRow testID="video-custom-rate" label="playbackRate" color={color} value={rate.playbackRate} options={RATES} onChange={value => (player.playbackRate = value)} />
      <ToggleRow testID="video-custom-muted" label="muted" value={muted.muted} onChange={value => (player.muted = value)} color={color} />
      <ToggleRow
        testID="video-custom-loop"
        label="loop"
        value={isLooping}
        onChange={value => {
          player.loop = value;
          setIsLooping(value);
        }}
        color={color}
      />
    </Scenario>
  );
}

export function VideoScreen() {
  const color = lineColorOf(ROUTE);
  const [isMounted, setIsMounted] = useState(true);
  return (
    <ScreenShell
      route={ROUTE}
      testID="video-scroll"
      title="Video"
      body="expo-video: a native player object plus a view. System or custom controls, feeds, fullscreen, picture in picture, thumbnails, tracks and an on-disk cache."
    >
      <Card testID="video-mount-card" title="Players on this screen">
        <ToggleRow testID="video-mount" label="Mount the players below" value={isMounted} onChange={setIsMounted} color={color} />
        <ResultRow testID="video-mount-state" label="Why" value="the cache calls work only while no player exists" />
      </Card>
      {isMounted && (
        <>
          <BasicScenario />
          <CustomControlsScenario color={color} />
          <FeedScenario color={color} />
          <ReelsScenario color={color} />
          <FullscreenScenario color={color} />
        </>
      )}
      <VideoMedia color={color} isMounted={isMounted} />
    </ScreenShell>
  );
}
