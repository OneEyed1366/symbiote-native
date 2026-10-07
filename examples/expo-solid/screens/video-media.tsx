import { For, Show, createSignal } from 'solid-js';
import { Image } from '@symbiote-native/image/solid';
import {
  VideoView,
  clearVideoCacheAsync,
  getCurrentVideoCacheSize,
  setVideoCacheSizeAsync,
  useVideoPlayer,
} from '@symbiote-native/video/solid';
import type { IVideoAudioMixingMode, IVideoContentFit, VideoThumbnail } from '@symbiote-native/video/solid';
import { ActionButton } from '../components/ActionButton';
import { Explorer, Scenario } from '../components/Scenario';
import { Card, ChoiceRow, ResultRow, ToggleRow } from '../components/ScreenShell';
import { PlayerStatusRows, usePlayerEvent, usePlayerEventOrNull } from './video-parts';
import {
  BYTES_PER_MB,
  CACHED_SOURCE,
  CACHE_LIMIT_BYTES,
  FIT_OPTIONS,
  HLS_URI,
  METADATA_SOURCE,
  MIXING_OPTIONS,
  MP4_URI,
  THUMB_MAX_WIDTH,
  THUMB_TIMES,
  TIME_UPDATE_SECONDS,
  errorLine,
  formatTime,
  trackLabel,
  trackSummary,
} from './video-shared';

function ThumbnailsScenario(props: { color: string }) {
  const player = useVideoPlayer(() => MP4_URI);
  const [thumbnails, setThumbnails] = createSignal<VideoThumbnail[]>([]);
  const [line, setLine] = createSignal('not generated');
  const generate = async () => {
    setLine('generating…');
    try {
      const result = await player().generateThumbnailsAsync(THUMB_TIMES, { maxWidth: THUMB_MAX_WIDTH });
      setThumbnails(result);
      setLine(`${result.length} frames, ${result[0]?.width ?? 0}x${result[0]?.height ?? 0}`);
    } catch (error: unknown) {
      setLine(`failed: ${errorLine(error)}`);
    }
  };
  return (
    <Scenario
      testID="video-thumbs-scenario"
      title="Show preview frames for a seek bar or a gallery"
      why="Players show a frame under the finger while scrubbing and galleries show a cover picture. The frames come from the player itself, no extra download."
      steps={['Press Generate frames and wait a few seconds']}
      expect="Four pictures appear in a row, taken at 1, 10, 30 and 60 seconds, each with its requested time under it."
    >
      <ActionButton testID="video-thumbs-generate" title="generateThumbnailsAsync" color={props.color} onPress={generate} />
      <ResultRow testID="video-thumbs-result" label="Result" value={line()} />
      <view class="vid-thumb-row">
        <For each={thumbnails()}>
          {thumbnail => (
            <view>
              <Image testID={`video-thumb-${thumbnail.requestedTime}`} source={thumbnail} contentFit="cover" class="vid-thumb" />
              <text class="capability-label">{formatTime(thumbnail.requestedTime)}</text>
            </view>
          )}
        </For>
      </view>
    </Scenario>
  );
}

function TracksScenario(props: { color: string }) {
  const player = useVideoPlayer(
    () => HLS_URI,
    instance => {
      instance.timeUpdateEventInterval = TIME_UPDATE_SECONDS;
    },
  );
  const load = usePlayerEventOrNull(player, 'sourceLoad');
  const subtitle = usePlayerEvent(player, 'subtitleTrackChange', { subtitleTrack: player().subtitleTrack });
  const audio = usePlayerEvent(player, 'audioTrackChange', { audioTrack: player().audioTrack });
  const video = usePlayerEvent(player, 'videoTrackChange', { videoTrack: player().videoTrack });
  const [source, setSource] = createSignal('adaptive stream');
  const switchTo = async (name: string, uri: string) => {
    setSource(`loading ${name}…`);
    try {
      await player().replaceAsync(uri);
      setSource(name);
    } catch (error: unknown) {
      setSource(`failed: ${errorLine(error)}`);
    }
  };
  const subtitles = () => load()?.availableSubtitleTracks ?? [];
  const audios = () => load()?.availableAudioTracks ?? [];
  return (
    <Scenario
      testID="video-tracks-scenario"
      title="Pick a subtitle, a language and see the quality"
      why="Streams ship several audio languages, subtitles and bitrates. An app lists them from the player and lets the user choose, or swaps the whole source for the next episode."
      steps={['Press play on the native controls', 'Press a subtitle button, then an audio button', 'Press Switch to the MP4 and back']}
      expect="The lists show what the stream offers. Choosing a subtitle shows its text on the picture and updates the line below, and the quality line shows the current resolution."
    >
      <VideoView testID="video-tracks" player={player()} nativeControls class="vid-video" />
      <PlayerStatusRows player={player} prefix="video-tracks" />
      <ResultRow testID="video-tracks-source" label="Source" value={source()} />
      <ResultRow testID="video-tracks-duration" label="sourceLoad" value={load() === null ? 'not loaded' : trackSummary(load()?.duration ?? 0, load()?.availableVideoTracks.length ?? 0, audios().length, subtitles().length)} />
      <ResultRow testID="video-tracks-quality" label="videoTrack" value={video().videoTrack === null ? 'unknown' : `${video().videoTrack?.size.width}x${video().videoTrack?.size.height}`} />
      <ResultRow testID="video-tracks-subtitle" label="subtitleTrack" value={trackLabel(subtitle().subtitleTrack)} />
      <ResultRow testID="video-tracks-audio" label="audioTrack" value={trackLabel(audio().audioTrack)} />
      <view class="button-row">
        <ActionButton testID="video-subtitle-off" title="Subtitles off" color={props.color} onPress={() => (player().subtitleTrack = null)} />
        <For each={subtitles()}>
          {track => (
            <ActionButton testID={`video-subtitle-${track.language}`} title={track.label} color={props.color} onPress={() => (player().subtitleTrack = track)} />
          )}
        </For>
      </view>
      <view class="button-row">
        <For each={audios()}>
          {track => (
            <ActionButton testID={`video-audio-${track.language}`} title={track.label} color={props.color} onPress={() => (player().audioTrack = track)} />
          )}
        </For>
      </view>
      <view class="button-row">
        <ActionButton testID="video-switch-mp4" title="Switch to the MP4" color={props.color} onPress={() => switchTo('MP4', MP4_URI)} />
        <ActionButton testID="video-switch-hls" title="Switch back to the stream" color={props.color} onPress={() => switchTo('adaptive stream', HLS_URI)} />
      </view>
    </Scenario>
  );
}

function CachedClip() {
  const player = useVideoPlayer(
    () => CACHED_SOURCE,
    instance => {
      instance.loop = true;
    },
  );
  return <VideoView testID="video-cached" player={player()} nativeControls class="vid-small" />;
}

function CacheCard(props: { color: string; isMounted: boolean }) {
  const [line, setLine] = createSignal('press Read size');
  const run = async (name: string, action: () => Promise<void> | void) => {
    try {
      await action();
      setLine(`${name} ok, cache is ${(getCurrentVideoCacheSize() / BYTES_PER_MB).toFixed(1)} MB`);
    } catch (error: unknown) {
      setLine(`${name} failed: ${errorLine(error)}`);
    }
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
      <Show when={props.isMounted}>
        <CachedClip />
      </Show>
      <ResultRow testID="video-cache-line" label="Cache" value={line()} />
      <view class="button-row">
        <ActionButton testID="video-cache-size" title="Read size" color={props.color} onPress={() => run('getCurrentVideoCacheSize', () => undefined)} />
        <ActionButton testID="video-cache-limit" title="Set limit 100 MB" color={props.color} onPress={() => run('setVideoCacheSizeAsync', () => setVideoCacheSizeAsync(CACHE_LIMIT_BYTES))} />
        <ActionButton testID="video-cache-clear" title="Clear cache" color={props.color} onPress={() => run('clearVideoCacheAsync', clearVideoCacheAsync)} />
      </view>
    </Scenario>
  );
}

function PlayerExplorer(props: { color: string }) {
  const player = useVideoPlayer(() => METADATA_SOURCE);
  const [isNowPlaying, setIsNowPlaying] = createSignal(false);
  const [mixing, setMixing] = createSignal<IVideoAudioMixingMode>('auto');
  const [fit, setFit] = createSignal<IVideoContentFit>('contain');
  const [isTimecodes, setIsTimecodes] = createSignal(true);
  const [isLinear, setIsLinear] = createSignal(false);
  const [isPitchKept, setIsPitchKept] = createSignal(true);
  const [isScreenOn, setIsScreenOn] = createSignal(true);
  const [isBackground, setIsBackground] = createSignal(false);
  return (
    <Explorer testID="video-explorer" color={props.color}>
      <Card testID="video-playground" title="Every option">
        <VideoView
          testID="video-playground-view"
          player={player()}
          nativeControls
          contentFit={fit()}
          showsTimecodes={isTimecodes()}
          requiresLinearPlayback={isLinear()}
          class="vid-video"
        />
        <ChoiceRow testID="video-fit" label="contentFit" color={props.color} value={fit()} options={FIT_OPTIONS} onChange={setFit} />
        <ToggleRow testID="video-timecodes" label="showsTimecodes (iOS)" value={isTimecodes()} onChange={setIsTimecodes} color={props.color} />
        <ToggleRow testID="video-linear" label="requiresLinearPlayback: no skipping" value={isLinear()} onChange={setIsLinear} color={props.color} />
        <ToggleRow
          testID="video-pitch"
          label="preservesPitch (try 2x speed)"
          value={isPitchKept()}
          onChange={value => {
            player().preservesPitch = value;
            setIsPitchKept(value);
          }}
          color={props.color}
        />
        <ToggleRow
          testID="video-keep-awake"
          label="keepScreenOnWhilePlaying"
          value={isScreenOn()}
          onChange={value => {
            player().keepScreenOnWhilePlaying = value;
            setIsScreenOn(value);
          }}
          color={props.color}
        />
        <ToggleRow
          testID="video-background"
          label="staysActiveInBackground (needs the audio background mode)"
          value={isBackground()}
          onChange={value => {
            player().staysActiveInBackground = value;
            setIsBackground(value);
          }}
          color={props.color}
        />
        <ToggleRow
          testID="video-now-playing"
          label="showNowPlayingNotification (lock screen card with the metadata)"
          value={isNowPlaying()}
          onChange={value => {
            player().showNowPlayingNotification = value;
            setIsNowPlaying(value);
          }}
          color={props.color}
        />
        <ChoiceRow
          testID="video-mixing"
          label="audioMixingMode: how it shares audio with other apps"
          color={props.color}
          value={mixing()}
          options={MIXING_OPTIONS}
          onChange={value => {
            player().audioMixingMode = value;
            setMixing(value);
          }}
        />
      </Card>
    </Explorer>
  );
}

export function VideoMedia(props: { color: string; isMounted: boolean }) {
  return (
    <>
      <Show when={props.isMounted}>
        <ThumbnailsScenario color={props.color} />
        <TracksScenario color={props.color} />
      </Show>
      <CacheCard color={props.color} isMounted={props.isMounted} />
      <Show when={props.isMounted}>
        <PlayerExplorer color={props.color} />
      </Show>
    </>
  );
}
