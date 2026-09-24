import { defineComponent, onUnmounted, ref } from 'vue';
import type { Ref } from 'vue';
import {} from '@symbiote-native/vue';
import {
  AudioRecorder,
  RecordingPresets,
  createAudioPlayer,
  createAudioPlaylist,
  createAudioStream,
  clearAllPreloadedSources,
  clearPreloadedSource,
  getPreloadedSources,
  getRecordingPermissionsAsync,
  preload,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  setIsAudioActiveAsync,
  AUDIO_STREAM_BUFFER,
  AUDIO_STREAM_STATUS,
  PLAYBACK_STATUS_UPDATE,
  PLAYLIST_STATUS_UPDATE,
  TRACK_CHANGED,
} from '@symbiote-native/audio/vue';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

// Public, framework-neutral streaming test asset — not a bundled/local asset, since this package
// deliberately doesn't port the `number`/asset-module AudioSource form (see the package README's
// "Deliberately not ported" section).
const AUDIO_URL =
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';
const PLAYLIST_URLS = [
  AUDIO_URL,
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
];
const RECORD_POLL_INTERVAL_MS = 300;

type IAsyncResult<T> =
  { kind: 'success'; value: T } | { kind: 'error'; message: string } | null;
type IPermissionStatus = 'checking' | 'yes' | 'no';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function statusLabel(status: IPermissionStatus): string {
  if (status === 'checking') return 'CHECKING…';
  return status === 'yes' ? 'YES' : 'NO';
}

function formatSeconds(seconds: number): string {
  return `${seconds.toFixed(1)}s`;
}

/**
 * Audio demo: @symbiote-native/audio — a real network-streamed player (play/pause/seek, live
 * status via PLAYBACK_STATUS_UPDATE), a recorder gated behind microphone permission, and the
 * audio-session mode toggles.
 */
export const AudioScreen = defineComponent(
  () => {
    const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Audio];
    const lineColor = LINE_COLOR[lineInfo.line];

    // --- player ---
    const player = createAudioPlayer(AUDIO_URL);
    const playerPlaying = ref(false);
    const playerCurrentTime = ref(0);
    const playerDuration = ref(0);
    const playerSubscription = player.addListener(
      PLAYBACK_STATUS_UPDATE,
      status => {
        playerPlaying.value = status.playing;
        playerCurrentTime.value = status.currentTime;
        playerDuration.value = status.duration;
      },
    );

    function handlePlay() {
      player.play();
    }
    function handlePause() {
      player.pause();
    }
    async function handleSeekForward() {
      await player.seekTo(player.currentTime + 10);
    }

    onUnmounted(() => {
      playerSubscription.remove();
      player.remove();
    });

    // --- recorder ---
    const recordPermissionStatus = ref<IPermissionStatus>('checking');
    const recordResult: Ref<IAsyncResult<string>> = ref(null);
    const isRecording = ref(false);
    const recordCurrentTime = ref(0);
    const recorder = new AudioRecorder(RecordingPresets.HIGH_QUALITY);
    let recordPollHandle: ReturnType<typeof setInterval> | null = null;

    function startRecordPoll() {
      if (recordPollHandle !== null) return;
      recordPollHandle = setInterval(() => {
        isRecording.value = recorder.isRecording;
        recordCurrentTime.value = recorder.currentTime;
      }, RECORD_POLL_INTERVAL_MS);
    }

    getRecordingPermissionsAsync().then(response => {
      recordPermissionStatus.value = response.granted ? 'yes' : 'no';
    });

    async function handleGetRecordPermission() {
      const response = await getRecordingPermissionsAsync();
      recordPermissionStatus.value = response.granted ? 'yes' : 'no';
    }
    async function handleRequestRecordPermission() {
      const response = await requestRecordingPermissionsAsync();
      recordPermissionStatus.value = response.granted ? 'yes' : 'no';
    }

    async function handleRecord() {
      if (recordPermissionStatus.value !== 'yes') {
        recordResult.value = {
          kind: 'error',
          message: 'Microphone permission not granted',
        };
        return;
      }
      try {
        await recorder.prepareToRecordAsync();
        recorder.record();
        startRecordPoll();
        recordResult.value = { kind: 'success', value: 'recording…' };
      } catch (error) {
        recordResult.value = { kind: 'error', message: errorMessage(error) };
      }
    }
    function handlePauseRecording() {
      recorder.pause();
    }
    async function handleStopRecording() {
      try {
        await recorder.stop();
        if (recordPollHandle !== null) {
          clearInterval(recordPollHandle);
          recordPollHandle = null;
        }
        isRecording.value = false;
        recordResult.value = {
          kind: 'success',
          value: recorder.uri ?? 'no uri',
        };
      } catch (error) {
        recordResult.value = { kind: 'error', message: errorMessage(error) };
      }
    }

    onUnmounted(() => {
      if (recordPollHandle !== null) clearInterval(recordPollHandle);
    });

    // --- audio mode ---
    const audioActive = ref(true);
    const modeResult: Ref<IAsyncResult<string>> = ref(null);

    async function handleToggleAudioActive() {
      try {
        const nextActive = !audioActive.value;
        await setIsAudioActiveAsync(nextActive);
        audioActive.value = nextActive;
        modeResult.value = { kind: 'success', value: `active: ${nextActive}` };
      } catch (error) {
        modeResult.value = { kind: 'error', message: errorMessage(error) };
      }
    }
    async function handleSetPlaybackMode() {
      try {
        await setAudioModeAsync({
          playsInSilentMode: true,
          shouldPlayInBackground: false,
          interruptionMode: 'mixWithOthers',
          allowsRecording: true,
        });
        modeResult.value = {
          kind: 'success',
          value: 'mode set: mixWithOthers, silent-mode ok',
        };
      } catch (error) {
        modeResult.value = { kind: 'error', message: errorMessage(error) };
      }
    }

    // --- playlist ---
    const playlist = createAudioPlaylist({ sources: PLAYLIST_URLS, loop: 'all' });
    const playlistIndex = ref(0);
    const playlistTrackCount = ref(0);
    const playlistPlaying = ref(false);
    const playlistCurrentTime = ref(0);
    const playlistDuration = ref(0);
    const trackChangedCount = ref(0);
    const playlistStatusSubscription = playlist.addListener(
      PLAYLIST_STATUS_UPDATE,
      status => {
        playlistIndex.value = status.currentIndex;
        playlistTrackCount.value = status.trackCount;
        playlistPlaying.value = status.playing;
        playlistCurrentTime.value = status.currentTime;
        playlistDuration.value = status.duration;
      },
    );
    const trackChangedSubscription = playlist.addListener(TRACK_CHANGED, () => {
      trackChangedCount.value += 1;
    });

    function handlePlaylistPlay() {
      playlist.play();
    }
    function handlePlaylistPause() {
      playlist.pause();
    }
    function handlePlaylistNext() {
      playlist.next();
    }
    function handlePlaylistPrevious() {
      playlist.previous();
    }

    onUnmounted(() => {
      playlistStatusSubscription.remove();
      trackChangedSubscription.remove();
      playlist.destroy();
    });

    // --- stream ---
    const stream = createAudioStream();
    const streamIsStreaming = ref(false);
    const streamBufferCount = ref(0);
    const streamResult: Ref<IAsyncResult<string>> = ref(null);
    const streamStatusSubscription = stream.addListener(
      AUDIO_STREAM_STATUS,
      status => {
        streamIsStreaming.value = status.isStreaming;
      },
    );
    const streamBufferSubscription = stream.addListener(
      AUDIO_STREAM_BUFFER,
      () => {
        streamBufferCount.value += 1;
      },
    );

    async function handleStreamStart() {
      try {
        await stream.start();
        streamResult.value = { kind: 'success', value: 'started' };
      } catch (error) {
        streamResult.value = { kind: 'error', message: errorMessage(error) };
      }
    }
    function handleStreamStop() {
      stream.stop();
    }

    onUnmounted(() => {
      streamStatusSubscription.remove();
      streamBufferSubscription.remove();
    });

    // --- preload cache ---
    const preloadedSources = ref<string[]>([]);
    const preloadResult: Ref<IAsyncResult<string>> = ref(null);

    async function refreshPreloadedSources() {
      preloadedSources.value = await getPreloadedSources();
    }
    refreshPreloadedSources();

    async function handlePreload() {
      try {
        await preload(AUDIO_URL);
        preloadResult.value = { kind: 'success', value: 'preloaded' };
        await refreshPreloadedSources();
      } catch (error) {
        preloadResult.value = { kind: 'error', message: errorMessage(error) };
      }
    }
    async function handleClearPreloaded() {
      try {
        await clearPreloadedSource(AUDIO_URL);
        preloadResult.value = { kind: 'success', value: 'cleared' };
        await refreshPreloadedSources();
      } catch (error) {
        preloadResult.value = { kind: 'error', message: errorMessage(error) };
      }
    }
    async function handleClearAllPreloaded() {
      try {
        await clearAllPreloadedSources();
        preloadResult.value = { kind: 'success', value: 'cleared all' };
        await refreshPreloadedSources();
      } catch (error) {
        preloadResult.value = { kind: 'error', message: errorMessage(error) };
      }
    }

    return () => (
      <safe-area-view class="screen">
        <scroll-view
          testID="audio-scroll"
          class="screen"
          contentContainerStyle="scroll-content"
        >
          <view class={`line-tag line-tag-${lineInfo.line}`}>
            <text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</text>
          </view>
          <view testID="audio-hero" class="hero-card">
            <view class="hero-badge" style={{ backgroundColor: lineColor }}>
              <text class="hero-badge-text">{lineInfo.code}</text>
            </view>
            <view class="hero-copy">
              <text class="hero-title">Audio</text>
              <text class="hero-body">
                @symbiote-native/audio — network playback, microphone recording,
                and the audio-session mode, all driven by real per-instance
                native objects.
              </text>
            </view>
          </view>

          <view testID="audio-player-card" class="auth-card">
            <view class="auth-card-header">
              <text class="auth-card-title">Player</text>
            </view>
            <ActionButton
              testID="audio-player-play"
              title="Play"
              onPress={handlePlay}
              color={lineColor}
            />
            <ActionButton
              testID="audio-player-pause"
              title="Pause"
              onPress={handlePause}
              color={lineColor}
            />
            <ActionButton
              testID="audio-player-seek"
              title="Seek +10s"
              onPress={handleSeekForward}
              color={lineColor}
            />
            <view class="auth-capability-row">
              <text class="auth-capability-label">Playing</text>
              <text testID="audio-player-status" class="auth-value-text">
                {`${playerPlaying.value} · ${formatSeconds(playerCurrentTime.value)} / ${formatSeconds(playerDuration.value)}`}
              </text>
            </view>
          </view>

          <view testID="audio-recorder-card" class="auth-card">
            <view class="auth-card-header">
              <text class="auth-card-title">Recorder</text>
            </view>
            <view class="auth-capability-row">
              <text class="auth-capability-label">Mic permission</text>
              <view
                class={`auth-status-badge auth-status-badge-${recordPermissionStatus.value}`}
              >
                <text class="auth-status-text">
                  {statusLabel(recordPermissionStatus.value)}
                </text>
              </view>
            </view>
            <ActionButton
              testID="audio-recorder-get-permission"
              title="Get permission"
              onPress={handleGetRecordPermission}
              color={lineColor}
            />
            <ActionButton
              testID="audio-recorder-request-permission"
              title="Request permission"
              onPress={handleRequestRecordPermission}
              color={lineColor}
            />
            <ActionButton
              testID="audio-recorder-record"
              title="Record"
              onPress={handleRecord}
              color={lineColor}
            />
            <ActionButton
              testID="audio-recorder-pause"
              title="Pause"
              onPress={handlePauseRecording}
              color={lineColor}
            />
            <ActionButton
              testID="audio-recorder-stop"
              title="Stop"
              onPress={handleStopRecording}
              color={lineColor}
            />
            <view class="auth-capability-row">
              <text class="auth-capability-label">Recording</text>
              <text testID="audio-recorder-status" class="auth-value-text">
                {`${isRecording.value} · ${formatSeconds(recordCurrentTime.value)}`}
              </text>
            </view>
            {recordResult.value && (
              <view
                testID="audio-recorder-result"
                class={`auth-result auth-result-${recordResult.value.kind === 'error' ? 'error' : 'success'}`}
              >
                <text class="auth-result-text">
                  {recordResult.value.kind === 'error'
                    ? `Failed: ${recordResult.value.message}`
                    : recordResult.value.value}
                </text>
              </view>
            )}
          </view>

          <view testID="audio-mode-card" class="auth-card">
            <view class="auth-card-header">
              <text class="auth-card-title">Audio mode</text>
            </view>
            <ActionButton
              testID="audio-mode-toggle-active"
              title={
                audioActive.value
                  ? 'Deactivate audio session'
                  : 'Activate audio session'
              }
              onPress={handleToggleAudioActive}
              color={lineColor}
            />
            <ActionButton
              testID="audio-mode-set-playback"
              title="Set playback mode"
              onPress={handleSetPlaybackMode}
              color={lineColor}
            />
            {modeResult.value && (
              <view
                testID="audio-mode-result"
                class={`auth-result auth-result-${modeResult.value.kind === 'error' ? 'error' : 'success'}`}
              >
                <text class="auth-result-text">
                  {modeResult.value.kind === 'error'
                    ? `Failed: ${modeResult.value.message}`
                    : modeResult.value.value}
                </text>
              </view>
            )}
          </view>

          <view testID="audio-playlist-card" class="auth-card">
            <view class="auth-card-header">
              <text class="auth-card-title">Playlist</text>
            </view>
            <ActionButton
              testID="audio-playlist-play"
              title="Play"
              onPress={handlePlaylistPlay}
              color={lineColor}
            />
            <ActionButton
              testID="audio-playlist-pause"
              title="Pause"
              onPress={handlePlaylistPause}
              color={lineColor}
            />
            <ActionButton
              testID="audio-playlist-previous"
              title="Previous"
              onPress={handlePlaylistPrevious}
              color={lineColor}
            />
            <ActionButton
              testID="audio-playlist-next"
              title="Next"
              onPress={handlePlaylistNext}
              color={lineColor}
            />
            <text testID="audio-playlist-status" class="auth-value-text">
              {`Track ${playlistIndex.value + 1}/${playlistTrackCount.value} · ${formatSeconds(playlistCurrentTime.value)} / ${formatSeconds(playlistDuration.value)} · ${playlistPlaying.value ? 'playing' : 'paused'} · changed ${trackChangedCount.value}×`}
            </text>
          </view>

          <view testID="audio-stream-card" class="auth-card">
            <view class="auth-card-header">
              <text class="auth-card-title">Stream</text>
            </view>
            <text class="info-text">Real-time PCM capture — needs microphone permission.</text>
            <ActionButton
              testID="audio-stream-start"
              title="Start"
              onPress={handleStreamStart}
              color={lineColor}
            />
            <ActionButton
              testID="audio-stream-stop"
              title="Stop"
              onPress={handleStreamStop}
              color={lineColor}
            />
            <text testID="audio-stream-status" class="auth-value-text">
              {`${streamIsStreaming.value ? 'STREAMING' : 'idle'} · ${streamBufferCount.value} buffers received`}
            </text>
            {streamResult.value && (
              <view
                testID="audio-stream-result"
                class={`auth-result auth-result-${streamResult.value.kind === 'error' ? 'error' : 'success'}`}
              >
                <text class="auth-result-text">
                  {streamResult.value.kind === 'error'
                    ? `Failed: ${streamResult.value.message}`
                    : streamResult.value.value}
                </text>
              </view>
            )}
          </view>

          <view testID="audio-preload-card" class="auth-card">
            <view class="auth-card-header">
              <text class="auth-card-title">Preload cache</text>
            </view>
            <ActionButton
              testID="audio-preload-add"
              title="Preload"
              onPress={handlePreload}
              color={lineColor}
            />
            <ActionButton
              testID="audio-preload-clear"
              title="Clear"
              onPress={handleClearPreloaded}
              color={lineColor}
            />
            <ActionButton
              testID="audio-preload-clear-all"
              title="Clear all"
              onPress={handleClearAllPreloaded}
              color={lineColor}
            />
            <text testID="audio-preload-status" class="auth-value-text">
              {preloadedSources.value.length > 0
                ? preloadedSources.value.join(', ')
                : 'No preloaded sources'}
            </text>
            {preloadResult.value && (
              <view
                testID="audio-preload-result"
                class={`auth-result auth-result-${preloadResult.value.kind === 'error' ? 'error' : 'success'}`}
              >
                <text class="auth-result-text">
                  {preloadResult.value.kind === 'error'
                    ? `Failed: ${preloadResult.value.message}`
                    : preloadResult.value.value}
                </text>
              </view>
            )}
          </view>
        </scroll-view>
      </safe-area-view>
    );
  },
  { name: 'AudioScreen' },
);
