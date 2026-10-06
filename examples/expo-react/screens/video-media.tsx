import { useState } from 'react';
import { Image } from '@symbiote-native/image/react';
import {
  VideoView,
  clearVideoCacheAsync,
  getCurrentVideoCacheSize,
  setVideoCacheSizeAsync,
  useVideoPlayer,
} from '@symbiote-native/video/react';
import type { IVideoAudioMixingMode, IVideoContentFit, IVideoSourceObject, VideoPlayer, VideoThumbnail } from '@symbiote-native/video/react';
import { ActionButton } from '../components/ActionButton';
import { Explorer, Scenario } from '../components/Scenario';
import { Card, ChoiceRow, ResultRow, ToggleRow } from '../components/ScreenShell';
import { CLIP_URI, HLS_URI, MP4_URI, PlayerStatusRows, TIME_UPDATE_SECONDS, formatTime, usePlayerEvent, usePlayerEventOrNull } from './video-parts';

const MIXING_MODES: readonly IVideoAudioMixingMode[] = ['auto', 'mixWithOthers', 'duckOthers', 'doNotMix'];
const METADATA_SOURCE: IVideoSourceObject = {
  uri: MP4_URI,
  metadata: { title: 'Big Buck Bunny', artist: 'Blender Foundation', artwork: 'https://picsum.photos/id/1025/300/300' },
};
const THUMB_TIMES = [1, 10, 30, 60];
const THUMB_MAX_WIDTH = 192;
const CACHE_LIMIT_BYTES = 100_000_000;
const BYTES_PER_MB = 1_000_000;
const FITS: readonly IVideoContentFit[] = ['contain', 'cover', 'fill'];
const NO_TRACK = 'off';

function errorLine(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function ThumbnailsScenario({ color }: { color: string }) {
  const player = useVideoPlayer(MP4_URI);
  const [thumbnails, setThumbnails] = useState<VideoThumbnail[]>([]);
  const [line, setLine] = useState('not generated');
  const generate = () => {
    setLine('generating…');
    player
      .generateThumbnailsAsync(THUMB_TIMES, { maxWidth: THUMB_MAX_WIDTH })
      .then(result => {
        setThumbnails(result);
        setLine(`${result.length} frames, ${result[0]?.width ?? 0}x${result[0]?.height ?? 0}`);
      })
      .catch((error: unknown) => setLine(`failed: ${errorLine(error)}`));
  };
  return (
    <Scenario
      testID="video-thumbs-scenario"
      title="Show preview frames for a seek bar or a gallery"
      why="Players show a frame under the finger while scrubbing and galleries show a cover picture. The frames come from the player itself, no extra download."
      steps={['Press Generate frames and wait a few seconds']}
      expect="Four pictures appear in a row, taken at 1, 10, 30 and 60 seconds, each with its requested time under it."
    >
      <ActionButton testID="video-thumbs-generate" title="generateThumbnailsAsync" color={color} onPress={generate} />
      <ResultRow testID="video-thumbs-result" label="Result" value={line} />
      <view className="vid-thumb-row">
        {thumbnails.map(thumbnail => (
          <view key={thumbnail.requestedTime}>
            <Image testID={`video-thumb-${thumbnail.requestedTime}`} source={thumbnail} contentFit="cover" className="vid-thumb" />
            <text className="capability-label">{formatTime(thumbnail.requestedTime)}</text>
          </view>
        ))}
      </view>
    </Scenario>
  );
}

function trackLabel(track: { label: string; language: string } | null): string {
  return track === null ? NO_TRACK : `${track.label} (${track.language})`;
}

function TracksScenario({ color }: { color: string }) {
  const player = useVideoPlayer(HLS_URI, instance => {
    instance.timeUpdateEventInterval = TIME_UPDATE_SECONDS;
  });
  const load = usePlayerEventOrNull(player, 'sourceLoad');
  const subtitle = usePlayerEvent(player, 'subtitleTrackChange', { subtitleTrack: player.subtitleTrack });
  const audio = usePlayerEvent(player, 'audioTrackChange', { audioTrack: player.audioTrack });
  const video = usePlayerEvent(player, 'videoTrackChange', { videoTrack: player.videoTrack });
  const [source, setSource] = useState('adaptive stream');
  const switchTo = (name: string, uri: string) => {
    setSource(`loading ${name}…`);
    player
      .replaceAsync(uri)
      .then(() => setSource(name))
      .catch((error: unknown) => setSource(`failed: ${errorLine(error)}`));
  };
  const subtitles = load?.availableSubtitleTracks ?? [];
  const audios = load?.availableAudioTracks ?? [];
  return (
    <Scenario
      testID="video-tracks-scenario"
      title="Pick a subtitle, a language and see the quality"
      why="Streams ship several audio languages, subtitles and bitrates. An app lists them from the player and lets the user choose, or swaps the whole source for the next episode."
      steps={['Press play on the native controls', 'Press a subtitle button, then an audio button', 'Press Switch to the MP4 and back']}
      expect="The lists show what the stream offers. Choosing a subtitle shows its text on the picture and updates the line below, and the quality line shows the current resolution."
    >
      <VideoView testID="video-tracks" player={player} nativeControls className="vid-video" />
      <PlayerStatusRows player={player} prefix="video-tracks" />
      <ResultRow testID="video-tracks-source" label="Source" value={source} />
      <ResultRow testID="video-tracks-duration" label="sourceLoad" value={load === null ? 'not loaded' : `${formatTime(load.duration)}, ${load.availableVideoTracks.length} video, ${audios.length} audio, ${subtitles.length} subtitle tracks`} />
      <ResultRow testID="video-tracks-quality" label="videoTrack" value={video.videoTrack === null ? 'unknown' : `${video.videoTrack.size.width}x${video.videoTrack.size.height}`} />
      <ResultRow testID="video-tracks-subtitle" label="subtitleTrack" value={trackLabel(subtitle.subtitleTrack)} />
      <ResultRow testID="video-tracks-audio" label="audioTrack" value={trackLabel(audio.audioTrack)} />
      <view className="button-row">
        <ActionButton testID="video-subtitle-off" title="Subtitles off" color={color} onPress={() => (player.subtitleTrack = null)} />
        {subtitles.map(track => (
          <ActionButton key={track.id ?? track.label} testID={`video-subtitle-${track.language}`} title={track.label} color={color} onPress={() => (player.subtitleTrack = track)} />
        ))}
      </view>
      <view className="button-row">
        {audios.map(track => (
          <ActionButton key={track.id ?? track.label} testID={`video-audio-${track.language}`} title={track.label} color={color} onPress={() => (player.audioTrack = track)} />
        ))}
      </view>
      <view className="button-row">
        <ActionButton testID="video-switch-mp4" title="Switch to the MP4" color={color} onPress={() => switchTo('MP4', MP4_URI)} />
        <ActionButton testID="video-switch-hls" title="Switch back to the stream" color={color} onPress={() => switchTo('adaptive stream', HLS_URI)} />
      </view>
    </Scenario>
  );
}

function CachedClip() {
  const player = useVideoPlayer({ uri: CLIP_URI, useCaching: true }, instance => {
    instance.loop = true;
  });
  return <VideoView testID="video-cached" player={player} nativeControls className="vid-small" />;
}

function CacheCard({ color, isMounted }: { color: string; isMounted: boolean }) {
  const [line, setLine] = useState('press Read size');
  const run = (name: string, action: () => Promise<void> | void) => {
    Promise.resolve()
      .then(action)
      .then(() => setLine(`${name} ok, cache is ${(getCurrentVideoCacheSize() / BYTES_PER_MB).toFixed(1)} MB`))
      .catch((error: unknown) => setLine(`${name} failed: ${errorLine(error)}`));
  };
  return (
    <Scenario
      testID="video-cache-scenario"
      title="Replay a video without downloading it again"
      why="With useCaching a source is stored on disk while it plays, so a repeat view works on a poor connection and costs no traffic. The cache has a size limit the app can set."
      steps={[
        'With the players mounted, play the small clip to the end, then Read size',
        'Turn the players off at the top of the screen',
        'Press Set limit 100 MB, then Clear cache, then Read size',
      ]}
      expect="The size grows after playing the clip. With players mounted the limit and clear calls report an error, with players off they succeed and the size drops to 0."
    >
      {isMounted && <CachedClip />}
      <ResultRow testID="video-cache-line" label="Cache" value={line} />
      <view className="button-row">
        <ActionButton testID="video-cache-size" title="Read size" color={color} onPress={() => run('getCurrentVideoCacheSize', () => undefined)} />
        <ActionButton testID="video-cache-limit" title="Set limit 100 MB" color={color} onPress={() => run('setVideoCacheSizeAsync', () => setVideoCacheSizeAsync(CACHE_LIMIT_BYTES))} />
        <ActionButton testID="video-cache-clear" title="Clear cache" color={color} onPress={() => run('clearVideoCacheAsync', clearVideoCacheAsync)} />
      </view>
    </Scenario>
  );
}

function PlayerExplorer({ color }: { color: string }) {
  const player: VideoPlayer = useVideoPlayer(METADATA_SOURCE);
  const [isNowPlaying, setIsNowPlaying] = useState(false);
  const [mixing, setMixing] = useState<IVideoAudioMixingMode>('auto');
  const [fit, setFit] = useState<IVideoContentFit>('contain');
  const [isTimecodes, setIsTimecodes] = useState(true);
  const [isLinear, setIsLinear] = useState(false);
  const [isPitchKept, setIsPitchKept] = useState(true);
  const [isScreenOn, setIsScreenOn] = useState(true);
  const [isBackground, setIsBackground] = useState(false);
  return (
    <Explorer testID="video-explorer" color={color}>
      <Card testID="video-playground" title="Every option">
        <VideoView
          testID="video-playground-view"
          player={player}
          nativeControls
          contentFit={fit}
          showsTimecodes={isTimecodes}
          requiresLinearPlayback={isLinear}
          className="vid-video"
        />
        <ChoiceRow testID="video-fit" label="contentFit" color={color} value={fit} options={FITS.map(item => ({ label: item, value: item }))} onChange={setFit} />
        <ToggleRow testID="video-timecodes" label="showsTimecodes (iOS)" value={isTimecodes} onChange={setIsTimecodes} color={color} />
        <ToggleRow testID="video-linear" label="requiresLinearPlayback: no skipping" value={isLinear} onChange={setIsLinear} color={color} />
        <ToggleRow
          testID="video-pitch"
          label="preservesPitch (try 2x speed)"
          value={isPitchKept}
          onChange={value => {
            player.preservesPitch = value;
            setIsPitchKept(value);
          }}
          color={color}
        />
        <ToggleRow
          testID="video-keep-awake"
          label="keepScreenOnWhilePlaying"
          value={isScreenOn}
          onChange={value => {
            player.keepScreenOnWhilePlaying = value;
            setIsScreenOn(value);
          }}
          color={color}
        />
        <ToggleRow
          testID="video-background"
          label="staysActiveInBackground (needs the audio background mode)"
          value={isBackground}
          onChange={value => {
            player.staysActiveInBackground = value;
            setIsBackground(value);
          }}
          color={color}
        />
        <ToggleRow
          testID="video-now-playing"
          label="showNowPlayingNotification (lock screen card with the metadata)"
          value={isNowPlaying}
          onChange={value => {
            player.showNowPlayingNotification = value;
            setIsNowPlaying(value);
          }}
          color={color}
        />
        <ChoiceRow
          testID="video-mixing"
          label="audioMixingMode: how it shares audio with other apps"
          color={color}
          value={mixing}
          options={MIXING_MODES.map(item => ({ label: item, value: item }))}
          onChange={value => {
            player.audioMixingMode = value;
            setMixing(value);
          }}
        />
      </Card>
    </Explorer>
  );
}

export function VideoMedia({ color, isMounted }: { color: string; isMounted: boolean }) {
  return (
    <>
      {isMounted && <ThumbnailsScenario color={color} />}
      {isMounted && <TracksScenario color={color} />}
      <CacheCard color={color} isMounted={isMounted} />
      {isMounted && <PlayerExplorer color={color} />}
    </>
  );
}
