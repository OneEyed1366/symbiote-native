import { defineComponent, ref } from 'vue';
import { Image } from '@symbiote-native/image/vue';
import {
  VideoView,
  clearVideoCacheAsync,
  getCurrentVideoCacheSize,
  setVideoCacheSizeAsync,
  useVideoPlayer,
} from '@symbiote-native/video/vue';
import type { IVideoAudioMixingMode, IVideoContentFit, VideoThumbnail } from '@symbiote-native/video/vue';
import { ActionButton } from '../components/ActionButton';
import { Explorer, Scenario } from '../components/Scenario';
import { Card, ChoiceRow, ResultRow, ToggleRow, lineColorOf } from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';
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

const color = lineColorOf(ROUTE_NAME.Video);

const ThumbnailsScenario = defineComponent(
  () => {
    const player = useVideoPlayer(() => MP4_URI);
    const thumbnails = ref<VideoThumbnail[]>([]);
    const line = ref('not generated');
    const generate = async () => {
      line.value = 'generating…';
      try {
        const result = await player.value.generateThumbnailsAsync(THUMB_TIMES, { maxWidth: THUMB_MAX_WIDTH });
        thumbnails.value = result;
        line.value = `${result.length} frames, ${result[0]?.width ?? 0}x${result[0]?.height ?? 0}`;
      } catch (error: unknown) {
        line.value = `failed: ${errorLine(error)}`;
      }
    };
    return () => (
      <Scenario
        testID="video-thumbs-scenario"
        title="Show preview frames for a seek bar or a gallery"
        why="Players show a frame under the finger while scrubbing and galleries show a cover picture. The frames come from the player itself, no extra download."
        steps={['Press Generate frames and wait a few seconds']}
        expect="Four pictures appear in a row, taken at 1, 10, 30 and 60 seconds, each with its requested time under it."
      >
        <ActionButton testID="video-thumbs-generate" title="generateThumbnailsAsync" color={color} onPress={generate} />
        <ResultRow testID="video-thumbs-result" label="Result" value={line.value} />
        <view class="vid-thumb-row">
          {thumbnails.value.map(thumbnail => (
            <view key={thumbnail.requestedTime}>
              <Image testID={`video-thumb-${thumbnail.requestedTime}`} source={thumbnail} contentFit="cover" class="vid-thumb" />
              <text class="capability-label">{formatTime(thumbnail.requestedTime)}</text>
            </view>
          ))}
        </view>
      </Scenario>
    );
  },
  { name: 'ThumbnailsScenario' },
);

const TracksScenario = defineComponent(
  () => {
    const player = useVideoPlayer(
      () => HLS_URI,
      instance => {
        instance.timeUpdateEventInterval = TIME_UPDATE_SECONDS;
      },
    );
    const load = usePlayerEventOrNull(player, 'sourceLoad');
    const subtitle = usePlayerEvent(player, 'subtitleTrackChange', { subtitleTrack: player.value.subtitleTrack });
    const audio = usePlayerEvent(player, 'audioTrackChange', { audioTrack: player.value.audioTrack });
    const video = usePlayerEvent(player, 'videoTrackChange', { videoTrack: player.value.videoTrack });
    const source = ref('adaptive stream');
    const switchTo = async (name: string, uri: string) => {
      source.value = `loading ${name}…`;
      try {
        await player.value.replaceAsync(uri);
        source.value = name;
      } catch (error: unknown) {
        source.value = `failed: ${errorLine(error)}`;
      }
    };
    return () => {
      const subtitles = load.value?.availableSubtitleTracks ?? [];
      const audios = load.value?.availableAudioTracks ?? [];
      const track = video.value.videoTrack;
      return (
        <Scenario
          testID="video-tracks-scenario"
          title="Pick a subtitle, a language and see the quality"
          why="Streams ship several audio languages, subtitles and bitrates. An app lists them from the player and lets the user choose, or swaps the whole source for the next episode."
          steps={['Press play on the native controls', 'Press a subtitle button, then an audio button', 'Press Switch to the MP4 and back']}
          expect="The lists show what the stream offers. Choosing a subtitle shows its text on the picture and updates the line below, and the quality line shows the current resolution."
        >
          <VideoView testID="video-tracks" player={player.value} nativeControls class="vid-video" />
          <PlayerStatusRows player={player} prefix="video-tracks" />
          <ResultRow testID="video-tracks-source" label="Source" value={source.value} />
          <ResultRow testID="video-tracks-duration" label="sourceLoad" value={load.value === null ? 'not loaded' : trackSummary(load.value.duration, load.value.availableVideoTracks.length, audios.length, subtitles.length)} />
          <ResultRow testID="video-tracks-quality" label="videoTrack" value={track === null ? 'unknown' : `${track.size.width}x${track.size.height}`} />
          <ResultRow testID="video-tracks-subtitle" label="subtitleTrack" value={trackLabel(subtitle.value.subtitleTrack)} />
          <ResultRow testID="video-tracks-audio" label="audioTrack" value={trackLabel(audio.value.audioTrack)} />
          <view class="button-row">
            <ActionButton testID="video-subtitle-off" title="Subtitles off" color={color} onPress={() => { player.value.subtitleTrack = null; }} />
            {subtitles.map(item => (
              <ActionButton key={item.id ?? item.label} testID={`video-subtitle-${item.language}`} title={item.label} color={color} onPress={() => { player.value.subtitleTrack = item; }} />
            ))}
          </view>
          <view class="button-row">
            {audios.map(item => (
              <ActionButton key={item.id ?? item.label} testID={`video-audio-${item.language}`} title={item.label} color={color} onPress={() => { player.value.audioTrack = item; }} />
            ))}
          </view>
          <view class="button-row">
            <ActionButton testID="video-switch-mp4" title="Switch to the MP4" color={color} onPress={() => switchTo('MP4', MP4_URI)} />
            <ActionButton testID="video-switch-hls" title="Switch back to the stream" color={color} onPress={() => switchTo('adaptive stream', HLS_URI)} />
          </view>
        </Scenario>
      );
    };
  },
  { name: 'TracksScenario' },
);

const CachedClip = defineComponent(
  () => {
    const player = useVideoPlayer(
      () => CACHED_SOURCE,
      instance => {
        instance.loop = true;
      },
    );
    return () => <VideoView testID="video-cached" player={player.value} nativeControls class="vid-small" />;
  },
  { name: 'CachedClip' },
);

const CacheCard = defineComponent<{ isMounted: boolean }>(
  props => {
    const line = ref('press Read size');
    const run = async (name: string, action: () => Promise<void> | void) => {
      try {
        await action();
        line.value = `${name} ok, cache is ${(getCurrentVideoCacheSize() / BYTES_PER_MB).toFixed(1)} MB`;
      } catch (error: unknown) {
        line.value = `${name} failed: ${errorLine(error)}`;
      }
    };
    return () => (
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
        {props.isMounted && <CachedClip />}
        <ResultRow testID="video-cache-line" label="Cache" value={line.value} />
        <view class="button-row">
          <ActionButton testID="video-cache-size" title="Read size" color={color} onPress={() => run('getCurrentVideoCacheSize', () => undefined)} />
          <ActionButton testID="video-cache-limit" title="Set limit 100 MB" color={color} onPress={() => run('setVideoCacheSizeAsync', () => setVideoCacheSizeAsync(CACHE_LIMIT_BYTES))} />
          <ActionButton testID="video-cache-clear" title="Clear cache" color={color} onPress={() => run('clearVideoCacheAsync', clearVideoCacheAsync)} />
        </view>
      </Scenario>
    );
  },
  { name: 'CacheCard', props: ['isMounted'] },
);

const PlayerExplorer = defineComponent(
  () => {
    const player = useVideoPlayer(() => METADATA_SOURCE);
    const isNowPlaying = ref(false);
    const mixing = ref<IVideoAudioMixingMode>('auto');
    const fit = ref<IVideoContentFit>('contain');
    const isTimecodes = ref(true);
    const isLinear = ref(false);
    const isPitchKept = ref(true);
    const isScreenOn = ref(true);
    const isBackground = ref(false);
    return () => (
      <Explorer testID="video-explorer" color={color}>
        <Card testID="video-playground" title="Every option">
          <VideoView
            testID="video-playground-view"
            player={player.value}
            nativeControls
            contentFit={fit.value}
            showsTimecodes={isTimecodes.value}
            requiresLinearPlayback={isLinear.value}
            class="vid-video"
          />
          <ChoiceRow testID="video-fit" label="contentFit" color={color} value={fit.value} options={FIT_OPTIONS} onChange={value => { fit.value = value; }} />
          <ToggleRow testID="video-timecodes" label="showsTimecodes (iOS)" value={isTimecodes.value} onChange={value => { isTimecodes.value = value; }} color={color} />
          <ToggleRow testID="video-linear" label="requiresLinearPlayback: no skipping" value={isLinear.value} onChange={value => { isLinear.value = value; }} color={color} />
          <ToggleRow
            testID="video-pitch"
            label="preservesPitch (try 2x speed)"
            value={isPitchKept.value}
            onChange={value => {
              player.value.preservesPitch = value;
              isPitchKept.value = value;
            }}
            color={color}
          />
          <ToggleRow
            testID="video-keep-awake"
            label="keepScreenOnWhilePlaying"
            value={isScreenOn.value}
            onChange={value => {
              player.value.keepScreenOnWhilePlaying = value;
              isScreenOn.value = value;
            }}
            color={color}
          />
          <ToggleRow
            testID="video-background"
            label="staysActiveInBackground (needs the audio background mode)"
            value={isBackground.value}
            onChange={value => {
              player.value.staysActiveInBackground = value;
              isBackground.value = value;
            }}
            color={color}
          />
          <ToggleRow
            testID="video-now-playing"
            label="showNowPlayingNotification (lock screen card with the metadata)"
            value={isNowPlaying.value}
            onChange={value => {
              player.value.showNowPlayingNotification = value;
              isNowPlaying.value = value;
            }}
            color={color}
          />
          <ChoiceRow
            testID="video-mixing"
            label="audioMixingMode: how it shares audio with other apps"
            color={color}
            value={mixing.value}
            options={MIXING_OPTIONS}
            onChange={value => {
              player.value.audioMixingMode = value;
              mixing.value = value;
            }}
          />
        </Card>
      </Explorer>
    );
  },
  { name: 'PlayerExplorer' },
);

export const VideoMedia = defineComponent<{ isMounted: boolean }>(
  props => () => (
    <>
      {props.isMounted && <ThumbnailsScenario />}
      {props.isMounted && <TracksScenario />}
      <CacheCard isMounted={props.isMounted} />
      {props.isMounted && <PlayerExplorer />}
    </>
  ),
  { name: 'VideoMedia', props: ['isMounted'] },
);
