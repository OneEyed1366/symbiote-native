import { createSignal, onCleanup } from 'solid-js';
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
} from '@symbiote-native/audio';
import type { IAudioStatus } from '@symbiote-native/audio';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

// Well-known, framework-neutral public test MP3 — see .claude/rules/canary-flavor-self-reference.md.
// AudioSource intentionally never accepts a bundled/local asset (the package's README's
// "Deliberately not ported" section), so every canary uses a remote URL.
const AUDIO_URL =
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';
const PLAYLIST_URLS = [
  AUDIO_URL,
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
];
const SEEK_STEP_SECONDS = 10;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type IMicPermission = Awaited<ReturnType<typeof getRecordingPermissionsAsync>>;

function formatPermission(response: IMicPermission): string {
  return `${response.status} · granted=${response.granted}`;
}

/**
 * @symbiote-native/audio canary demo: a remote-URL AudioPlayer with play/pause/seek and a live
 * status readout via PLAYBACK_STATUS_UPDATE, an AudioRecorder gated behind microphone permission,
 * and the audio-session mode toggles (setAudioModeAsync / setIsAudioActiveAsync).
 */
export function AudioScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Audio];
  const lineColor = LINE_COLOR[lineInfo.line];

  // --- Player ---
  const player = createAudioPlayer(AUDIO_URL);
  const [playerStatus, setPlayerStatus] = createSignal<IAudioStatus | null>(
    null,
  );
  const playerSubscription = player.addListener(
    PLAYBACK_STATUS_UPDATE,
    status => {
      setPlayerStatus(status);
    },
  );
  onCleanup(() => {
    playerSubscription.remove();
    player.remove();
  });

  const playerStatusDisplay = () => {
    const status = playerStatus();
    if (status === null) {
      return 'not loaded yet';
    }
    return `${status.currentTime.toFixed(1)}s / ${status.duration.toFixed(1)}s · playing=${status.playing}`;
  };

  const handlePlay = () => player.play();
  const handlePause = () => player.pause();
  const handleSeekForward = () =>
    void player.seekTo(player.currentTime + SEEK_STEP_SECONDS);

  // --- Recorder ---
  const recorder = new AudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [micPermission, setMicPermission] = createSignal<IMicPermission | null>(
    null,
  );
  const [micPermissionError, setMicPermissionError] = createSignal<
    string | null
  >(null);
  const [recorderStatus, setRecorderStatus] = createSignal('not recording');
  const [recorderError, setRecorderError] = createSignal<string | null>(null);

  const micPermissionDisplay = () =>
    micPermissionError() ??
    (micPermission() === null
      ? 'not checked yet'
      : formatPermission(micPermission()!));

  let recorderPollInterval: ReturnType<typeof setInterval> | null = null;
  const startRecorderPoll = () => {
    if (recorderPollInterval !== null) return;
    recorderPollInterval = setInterval(() => {
      setRecorderStatus(
        `isRecording=${recorder.isRecording} · currentTime=${recorder.currentTime.toFixed(1)}s`,
      );
    }, 500);
  };
  const stopRecorderPoll = () => {
    if (recorderPollInterval === null) return;
    clearInterval(recorderPollInterval);
    recorderPollInterval = null;
  };
  onCleanup(stopRecorderPoll);

  const handleRequestMicPermission = async () => {
    try {
      const result = await requestRecordingPermissionsAsync();
      setMicPermissionError(null);
      setMicPermission(result);
    } catch (error) {
      setMicPermission(null);
      setMicPermissionError(errorMessage(error));
    }
  };
  const handleGetMicPermission = async () => {
    try {
      const result = await getRecordingPermissionsAsync();
      setMicPermissionError(null);
      setMicPermission(result);
    } catch (error) {
      setMicPermission(null);
      setMicPermissionError(errorMessage(error));
    }
  };

  const handleStartRecording = async () => {
    const permission = micPermission();
    if (!permission || !permission.granted) {
      setRecorderError(
        'microphone permission not granted — use "Request permission" first',
      );
      return;
    }
    try {
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecorderError(null);
      startRecorderPoll();
    } catch (error) {
      setRecorderError(errorMessage(error));
    }
  };
  const handlePauseRecording = () => {
    try {
      recorder.pause();
      setRecorderError(null);
    } catch (error) {
      setRecorderError(errorMessage(error));
    }
  };
  const handleStopRecording = async () => {
    try {
      await recorder.stop();
      setRecorderError(null);
      stopRecorderPoll();
      setRecorderStatus(
        `isRecording=${recorder.isRecording} · currentTime=${recorder.currentTime.toFixed(1)}s`,
      );
    } catch (error) {
      setRecorderError(errorMessage(error));
    }
  };

  // --- Audio mode ---
  const [silentPlaybackEnabled, setSilentPlaybackEnabled] = createSignal(true);
  const [audioActive, setAudioActive] = createSignal(true);
  const [modeStatus, setModeStatus] = createSignal<string | null>(null);
  const [modeError, setModeError] = createSignal<string | null>(null);

  const modeStatusDisplay = () =>
    modeError() ?? modeStatus() ?? 'not changed yet';

  const handleToggleSilentPlayback = async () => {
    try {
      const next = !silentPlaybackEnabled();
      await setAudioModeAsync({ playsInSilentMode: next, allowsRecording: true });
      setModeError(null);
      setSilentPlaybackEnabled(next);
      setModeStatus(`playsInSilentMode=${next}`);
    } catch (error) {
      setModeError(errorMessage(error));
    }
  };
  const handleToggleAudioActive = async () => {
    try {
      const next = !audioActive();
      await setIsAudioActiveAsync(next);
      setModeError(null);
      setAudioActive(next);
      setModeStatus(`isAudioActive=${next}`);
    } catch (error) {
      setModeError(errorMessage(error));
    }
  };

  // --- Playlist ---
  const playlist = createAudioPlaylist({ sources: PLAYLIST_URLS, loop: 'all' });
  const [playlistIndex, setPlaylistIndex] = createSignal(0);
  const [playlistTrackCount, setPlaylistTrackCount] = createSignal(0);
  const [playlistPlaying, setPlaylistPlaying] = createSignal(false);
  const [playlistCurrentTime, setPlaylistCurrentTime] = createSignal(0);
  const [playlistDuration, setPlaylistDuration] = createSignal(0);
  const [trackChangedCount, setTrackChangedCount] = createSignal(0);

  const playlistStatusSubscription = playlist.addListener(
    PLAYLIST_STATUS_UPDATE,
    status => {
      setPlaylistIndex(status.currentIndex);
      setPlaylistTrackCount(status.trackCount);
      setPlaylistPlaying(status.playing);
      setPlaylistCurrentTime(status.currentTime);
      setPlaylistDuration(status.duration);
    },
  );
  const trackChangedSubscription = playlist.addListener(TRACK_CHANGED, () => {
    setTrackChangedCount(count => count + 1);
  });
  onCleanup(() => {
    playlistStatusSubscription.remove();
    trackChangedSubscription.remove();
    playlist.destroy();
  });

  const playlistStatusDisplay = () =>
    `Track ${playlistIndex() + 1}/${playlistTrackCount()} · ${playlistCurrentTime().toFixed(1)}s / ${playlistDuration().toFixed(1)}s · playing=${playlistPlaying()} · changed ${trackChangedCount()}×`;

  const handlePlaylistPlay = () => playlist.play();
  const handlePlaylistPause = () => playlist.pause();
  const handlePlaylistNext = () => playlist.next();
  const handlePlaylistPrevious = () => playlist.previous();

  // --- Stream ---
  const stream = createAudioStream();
  const [streamIsStreaming, setStreamIsStreaming] = createSignal(false);
  const [streamBufferCount, setStreamBufferCount] = createSignal(0);
  const [streamError, setStreamError] = createSignal<string | null>(null);

  const streamStatusSubscription = stream.addListener(
    AUDIO_STREAM_STATUS,
    status => setStreamIsStreaming(status.isStreaming),
  );
  const streamBufferSubscription = stream.addListener(AUDIO_STREAM_BUFFER, () => {
    setStreamBufferCount(count => count + 1);
  });
  onCleanup(() => {
    streamStatusSubscription.remove();
    streamBufferSubscription.remove();
  });

  const handleStreamStart = async () => {
    try {
      await stream.start();
      setStreamError(null);
    } catch (error) {
      setStreamError(errorMessage(error));
    }
  };
  const handleStreamStop = () => stream.stop();

  // --- Preload cache ---
  const [preloadedSources, setPreloadedSources] = createSignal<string[]>([]);
  const [preloadError, setPreloadError] = createSignal<string | null>(null);
  const [preloadResult, setPreloadResult] = createSignal<string | null>(null);

  const refreshPreloadedSources = async () => {
    setPreloadedSources(await getPreloadedSources());
  };
  void refreshPreloadedSources();

  const preloadedSourcesDisplay = () =>
    preloadedSources().length > 0
      ? preloadedSources().join(', ')
      : 'No preloaded sources';

  const handlePreload = async () => {
    try {
      await preload(AUDIO_URL);
      setPreloadError(null);
      setPreloadResult('preloaded');
      await refreshPreloadedSources();
    } catch (error) {
      setPreloadError(errorMessage(error));
    }
  };
  const handleClearPreloaded = async () => {
    try {
      await clearPreloadedSource(AUDIO_URL);
      setPreloadError(null);
      setPreloadResult('cleared');
      await refreshPreloadedSources();
    } catch (error) {
      setPreloadError(errorMessage(error));
    }
  };
  const handleClearAllPreloaded = async () => {
    try {
      await clearAllPreloadedSources();
      setPreloadError(null);
      setPreloadResult('cleared all');
      await refreshPreloadedSources();
    } catch (error) {
      setPreloadError(errorMessage(error));
    }
  };

  return (
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
              @symbiote-native/audio — a remote-URL AudioPlayer, an
              AudioRecorder gated behind microphone permission, and the
              audio-session mode toggles.
            </text>
          </view>
        </view>

        <view testID="audio-player-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Player</text>
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
            title={`Seek +${SEEK_STEP_SECONDS}s`}
            onPress={handleSeekForward}
            color={lineColor}
          />
          <view class="capability-row">
            <text class="capability-label">Status</text>
            <text testID="audio-player-status" class="value-text">
              {playerStatusDisplay()}
            </text>
          </view>
        </view>

        <view testID="audio-recorder-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Recorder</text>
          </view>
          <ActionButton
            testID="audio-recorder-request-permission"
            title="Request permission"
            onPress={() => void handleRequestMicPermission()}
            color={lineColor}
          />
          <ActionButton
            testID="audio-recorder-get-permission"
            title="Get permission"
            onPress={() => void handleGetMicPermission()}
            color={lineColor}
          />
          <view class="capability-row">
            <text class="capability-label">Permission</text>
            <text testID="audio-recorder-permission-status" class="value-text">
              {micPermissionDisplay()}
            </text>
          </view>
          <ActionButton
            testID="audio-recorder-start"
            title="Record"
            onPress={() => void handleStartRecording()}
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
            onPress={() => void handleStopRecording()}
            color={lineColor}
          />
          <view class="capability-row">
            <text class="capability-label">Status</text>
            <text testID="audio-recorder-status" class="value-text">
              {recorderError() ?? recorderStatus()}
            </text>
          </view>
        </view>

        <view testID="audio-mode-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Audio session mode</text>
          </view>
          <ActionButton
            testID="audio-mode-toggle-silent-playback"
            title={
              silentPlaybackEnabled()
                ? 'Disable silent-mode playback'
                : 'Enable silent-mode playback'
            }
            onPress={() => void handleToggleSilentPlayback()}
            color={lineColor}
          />
          <ActionButton
            testID="audio-mode-toggle-active"
            title={
              audioActive()
                ? 'Deactivate audio session'
                : 'Activate audio session'
            }
            onPress={() => void handleToggleAudioActive()}
            color={lineColor}
          />
          <view class="capability-row">
            <text class="capability-label">Result</text>
            <text testID="audio-mode-status" class="value-text">
              {modeStatusDisplay()}
            </text>
          </view>
        </view>

        <view testID="audio-playlist-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Playlist</text>
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
          <view class="capability-row">
            <text class="capability-label">Status</text>
            <text testID="audio-playlist-status" class="value-text">
              {playlistStatusDisplay()}
            </text>
          </view>
        </view>

        <view testID="audio-stream-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Stream</text>
          </view>
          <text class="info-text">
            Real-time PCM capture — needs microphone permission.
          </text>
          <ActionButton
            testID="audio-stream-start"
            title="Start"
            onPress={() => void handleStreamStart()}
            color={lineColor}
          />
          <ActionButton
            testID="audio-stream-stop"
            title="Stop"
            onPress={handleStreamStop}
            color={lineColor}
          />
          <view class="capability-row">
            <text class="capability-label">Status</text>
            <text testID="audio-stream-status" class="value-text">
              {streamError() ??
                `streaming=${streamIsStreaming()} · ${streamBufferCount()} buffers received`}
            </text>
          </view>
        </view>

        <view testID="audio-preload-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Preload cache</text>
          </view>
          <ActionButton
            testID="audio-preload-add"
            title="Preload"
            onPress={() => void handlePreload()}
            color={lineColor}
          />
          <ActionButton
            testID="audio-preload-clear"
            title="Clear"
            onPress={() => void handleClearPreloaded()}
            color={lineColor}
          />
          <ActionButton
            testID="audio-preload-clear-all"
            title="Clear all"
            onPress={() => void handleClearAllPreloaded()}
            color={lineColor}
          />
          <view class="capability-row">
            <text class="capability-label">Sources</text>
            <text testID="audio-preload-status" class="value-text">
              {preloadedSourcesDisplay()}
            </text>
          </view>
          <view class="capability-row">
            <text class="capability-label">Result</text>
            <text testID="audio-preload-result" class="value-text">
              {preloadError() ?? preloadResult() ?? 'not changed yet'}
            </text>
          </view>
        </view>
      </scroll-view>
    </safe-area-view>
  );
}
