<!--
  @symbiote-native/audio tour stop — an AudioPlayer against a remote MP3 (play/pause/seek, live
  status via PLAYBACK_STATUS_UPDATE), an AudioRecorder gated behind a granted microphone
  permission (matches MediaLibraryScreen's/LocationScreen's permission-gate pattern), and the
  audio-session mode toggle (setAudioModeAsync / setIsAudioActiveAsync). First port of this
  screen across the example suite — no React/Svelte/Solid/Angular twin to mirror yet.
-->
<script setup lang="ts">
import { onUnmounted, ref } from 'vue';
import {} from '@symbiote-native/vue';
import {
  AudioRecorder,
  createAudioPlayer,
  createAudioPlaylist,
  createAudioStream,
  clearAllPreloadedSources,
  clearPreloadedSource,
  getPreloadedSources,
  getRecordingPermissionsAsync,
  preload,
  PLAYBACK_STATUS_UPDATE,
  PLAYLIST_STATUS_UPDATE,
  TRACK_CHANGED,
  AUDIO_STREAM_STATUS,
  AUDIO_STREAM_BUFFER,
  RECORDING_STATUS_UPDATE,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  setIsAudioActiveAsync,
} from '@symbiote-native/audio/vue';
import ActionButton from '../components/ActionButton.vue';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Audio];
const lineColor = LINE_COLOR[lineInfo.line];

// A well-known, framework-neutral public test MP3 — no bundled/local asset, since this package
// deliberately does not support the `number`/asset-module source form (see the package README's
// "Deliberately not ported" section).
const DEMO_TRACK_URL =
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';
const PLAYLIST_TRACK_URLS = [
  DEMO_TRACK_URL,
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
];

// Player — created once (not reactive, a JSI-backed shared-object handle), released on unmount.
const player = createAudioPlayer(DEMO_TRACK_URL);
const playerIsPlayingText = ref('no');
const playerCurrentTimeText = ref('0.0s');
const playerDurationText = ref('0.0s');
const playerError = ref<string | null>(null);
let playerCurrentTime = 0;
let playerDuration = 0;

const playerSubscription = player.addListener(
  PLAYBACK_STATUS_UPDATE,
  status => {
    playerIsPlayingText.value = status.playing ? 'yes' : 'no';
    playerCurrentTime = status.currentTime;
    playerDuration = status.duration;
    playerCurrentTimeText.value = `${status.currentTime.toFixed(1)}s`;
    playerDurationText.value = `${status.duration.toFixed(1)}s`;
  },
);

function handlePlay(): void {
  playerError.value = null;
  try {
    player.play();
  } catch (error) {
    playerError.value = `play failed: ${errorMessage(error)}`;
  }
}

function handlePause(): void {
  playerError.value = null;
  try {
    player.pause();
  } catch (error) {
    playerError.value = `pause failed: ${errorMessage(error)}`;
  }
}

function handleSeekForward(): void {
  playerError.value = null;
  const target =
    playerDuration > 0
      ? Math.min(playerCurrentTime + 10, playerDuration)
      : playerCurrentTime + 10;
  void player.seekTo(target).catch((error: Error) => {
    playerError.value = `seek failed: ${error.message}`;
  });
}

// Recorder — created once, gated behind a granted microphone permission before record()/stop()
// are ever called (same defensive gate MediaLibraryScreen/LocationScreen apply to their own
// permission-backed calls).
const recorder = new AudioRecorder(RecordingPresets.HIGH_QUALITY);
const recordingPermissionStatusText = ref('not checked yet');
const recordingPermissionGranted = ref(false);
const recorderIsRecordingText = ref('no');
const recorderCurrentTimeText = ref('0.0s');
const recorderError = ref<string | null>(null);

function syncRecorderState(): void {
  recorderIsRecordingText.value = recorder.isRecording ? 'yes' : 'no';
  recorderCurrentTimeText.value = `${recorder.currentTime.toFixed(1)}s`;
}

const recorderSubscription = recorder.addListener(
  RECORDING_STATUS_UPDATE,
  () => {
    syncRecorderState();
  },
);

function handleRequestRecordingPermission(): void {
  void requestRecordingPermissionsAsync()
    .then(response => {
      recordingPermissionStatusText.value = response.status;
      recordingPermissionGranted.value = response.granted;
    })
    .catch((error: Error) => {
      recordingPermissionStatusText.value = `request failed: ${error.message}`;
    });
}

function handleGetRecordingPermission(): void {
  void getRecordingPermissionsAsync()
    .then(response => {
      recordingPermissionStatusText.value = response.status;
      recordingPermissionGranted.value = response.granted;
    })
    .catch((error: Error) => {
      recordingPermissionStatusText.value = `get failed: ${error.message}`;
    });
}

function handleStartRecording(): void {
  recorderError.value = null;
  if (!recordingPermissionGranted.value) {
    recorderError.value = 'Request microphone permission first.';
    return;
  }
  void recorder
    .prepareToRecordAsync()
    .then(() => {
      recorder.record();
      syncRecorderState();
    })
    .catch((error: Error) => {
      recorderError.value = `record failed: ${error.message}`;
    });
}

function handlePauseRecording(): void {
  recorderError.value = null;
  if (!recordingPermissionGranted.value) {
    recorderError.value = 'Request microphone permission first.';
    return;
  }
  try {
    recorder.pause();
    syncRecorderState();
  } catch (error) {
    recorderError.value = `pause failed: ${errorMessage(error)}`;
  }
}

function handleStopRecording(): void {
  recorderError.value = null;
  if (!recordingPermissionGranted.value) {
    recorderError.value = 'Request microphone permission first.';
    return;
  }
  void recorder
    .stop()
    .then(() => {
      syncRecorderState();
    })
    .catch((error: Error) => {
      recorderError.value = `stop failed: ${error.message}`;
    });
}

// Audio-session mode.
const audioActive = ref(true);
const audioModeResultText = ref('not set yet');
const audioModeError = ref<string | null>(null);

function handleToggleAudioActive(): void {
  audioModeError.value = null;
  const next = !audioActive.value;
  void setIsAudioActiveAsync(next)
    .then(() => {
      audioActive.value = next;
      audioModeResultText.value = `active: ${next}`;
    })
    .catch((error: Error) => {
      audioModeError.value = `set active failed: ${error.message}`;
    });
}

function handleEnableSilentModePlayback(): void {
  audioModeError.value = null;
  void setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: false,
    allowsRecording: true,
  })
    .then(() => {
      audioModeResultText.value = 'silent-mode playback enabled';
    })
    .catch((error: Error) => {
      audioModeError.value = `set mode failed: ${error.message}`;
    });
}

onUnmounted(() => {
  playerSubscription.remove();
  recorderSubscription.remove();
  player.remove();
});

// Playlist — two tracks, looped, released on unmount.
const playlist = createAudioPlaylist({
  sources: PLAYLIST_TRACK_URLS,
  loop: 'all',
});
const playlistIndexText = ref('1');
const playlistTrackCountText = ref('0');
const playlistPlayingText = ref('no');
const playlistCurrentTimeText = ref('0.0s');
const playlistDurationText = ref('0.0s');
const trackChangedCount = ref(0);

const playlistStatusSubscription = playlist.addListener(
  PLAYLIST_STATUS_UPDATE,
  status => {
    playlistIndexText.value = `${status.currentIndex + 1}`;
    playlistTrackCountText.value = `${status.trackCount}`;
    playlistPlayingText.value = status.playing ? 'yes' : 'no';
    playlistCurrentTimeText.value = `${status.currentTime.toFixed(1)}s`;
    playlistDurationText.value = `${status.duration.toFixed(1)}s`;
  },
);
const trackChangedSubscription = playlist.addListener(TRACK_CHANGED, () => {
  trackChangedCount.value += 1;
});

function handlePlaylistPlay(): void {
  playlist.play();
}
function handlePlaylistPause(): void {
  playlist.pause();
}
function handlePlaylistNext(): void {
  playlist.next();
}
function handlePlaylistPrevious(): void {
  playlist.previous();
}

onUnmounted(() => {
  playlistStatusSubscription.remove();
  trackChangedSubscription.remove();
  playlist.destroy();
});

// Stream — real-time PCM capture, needs microphone permission.
const stream = createAudioStream();
const streamIsStreamingText = ref('no');
const streamBufferCount = ref(0);
const streamError = ref<string | null>(null);

const streamStatusSubscription = stream.addListener(
  AUDIO_STREAM_STATUS,
  status => {
    streamIsStreamingText.value = status.isStreaming ? 'yes' : 'no';
  },
);
const streamBufferSubscription = stream.addListener(AUDIO_STREAM_BUFFER, () => {
  streamBufferCount.value += 1;
});

function handleStreamStart(): void {
  streamError.value = null;
  void stream.start().catch((error: Error) => {
    streamError.value = `start failed: ${error.message}`;
  });
}
function handleStreamStop(): void {
  stream.stop();
}

onUnmounted(() => {
  streamStatusSubscription.remove();
  streamBufferSubscription.remove();
});

// Preload cache.
const preloadedSourcesText = ref('No preloaded sources');
const preloadError = ref<string | null>(null);
const preloadResultText = ref<string | null>(null);

async function refreshPreloadedSources(): Promise<void> {
  const sources = await getPreloadedSources();
  preloadedSourcesText.value =
    sources.length > 0 ? sources.join(', ') : 'No preloaded sources';
}
void refreshPreloadedSources();

function handlePreload(): void {
  preloadError.value = null;
  void preload(DEMO_TRACK_URL)
    .then(() => {
      preloadResultText.value = 'preloaded';
      return refreshPreloadedSources();
    })
    .catch((error: Error) => {
      preloadError.value = `preload failed: ${error.message}`;
    });
}
function handleClearPreloaded(): void {
  preloadError.value = null;
  void clearPreloadedSource(DEMO_TRACK_URL)
    .then(() => {
      preloadResultText.value = 'cleared';
      return refreshPreloadedSources();
    })
    .catch((error: Error) => {
      preloadError.value = `clear failed: ${error.message}`;
    });
}
function handleClearAllPreloaded(): void {
  preloadError.value = null;
  void clearAllPreloadedSources()
    .then(() => {
      preloadResultText.value = 'cleared all';
      return refreshPreloadedSources();
    })
    .catch((error: Error) => {
      preloadError.value = `clear all failed: ${error.message}`;
    });
}
</script>

<template>
  <safe-area-view class="screen">
    <scroll-view
      testID="audio-scroll"
      class="screen"
      content-container-style="scroll-content"
    >
      <view :class="`line-tag line-tag-${lineInfo.line}`">
        <text class="line-tag-text">{{
          `${lineInfo.code} · ${lineInfo.label}`
        }}</text>
      </view>
      <view class="hero-card">
        <view class="hero-badge" :style="{ backgroundColor: lineColor }">
          <text class="hero-badge-text">{{ lineInfo.code }}</text>
        </view>
        <view class="hero-copy">
          <text class="hero-title">Audio</text>
          <text testID="audio-hero" class="hero-body"
            >@symbiote-native/audio — AudioPlayer playback of a remote track,
            AudioRecorder microphone capture, an AudioPlaylist, an AudioStream,
            the preload cache, and the audio-session mode toggle.</text
          >
        </view>
      </view>

      <view testID="audio-player-card" class="auth-card">
        <view class="auth-card-header">
          <text class="auth-card-title">Player</text>
        </view>
        <view class="button-row">
          <ActionButton
            testID="audio-player-play"
            title="Play"
            :onPress="handlePlay"
            :color="lineColor"
          />
          <ActionButton
            testID="audio-player-pause"
            title="Pause"
            :onPress="handlePause"
            :color="lineColor"
          />
          <ActionButton
            testID="audio-player-seek-forward"
            title="Seek +10s"
            :onPress="handleSeekForward"
            :color="lineColor"
          />
        </view>
        <text testID="audio-player-status" class="auth-value-text">{{
          `playing: ${playerIsPlayingText} · ${playerCurrentTimeText} / ${playerDurationText}`
        }}</text>
        <view v-if="playerError" class="auth-result auth-result-error">
          <text class="auth-result-text">{{ playerError }}</text>
        </view>
      </view>

      <view testID="audio-recorder-card" class="auth-card">
        <view class="auth-card-header">
          <text class="auth-card-title">Recorder</text>
        </view>
        <text
          testID="audio-recorder-permission-status"
          class="auth-value-text"
          >{{ recordingPermissionStatusText }}</text
        >
        <view class="button-row">
          <ActionButton
            testID="audio-recorder-request-permission"
            title="Request mic permission"
            :onPress="handleRequestRecordingPermission"
            :color="lineColor"
          />
          <ActionButton
            testID="audio-recorder-get-permission"
            title="Get mic permission"
            :onPress="handleGetRecordingPermission"
            :color="lineColor"
          />
        </view>
        <view class="button-row">
          <ActionButton
            testID="audio-recorder-start"
            title="Record"
            :onPress="handleStartRecording"
            :color="lineColor"
          />
          <ActionButton
            testID="audio-recorder-pause"
            title="Pause"
            :onPress="handlePauseRecording"
            :color="lineColor"
          />
          <ActionButton
            testID="audio-recorder-stop"
            title="Stop"
            :onPress="handleStopRecording"
            :color="lineColor"
          />
        </view>
        <text testID="audio-recorder-status" class="auth-value-text">{{
          `recording: ${recorderIsRecordingText} · ${recorderCurrentTimeText}`
        }}</text>
        <view v-if="recorderError" class="auth-result auth-result-error">
          <text class="auth-result-text">{{ recorderError }}</text>
        </view>
      </view>

      <view testID="audio-mode-card" class="auth-card">
        <view class="auth-card-header">
          <text class="auth-card-title">Audio session mode</text>
        </view>
        <view class="button-row">
          <ActionButton
            testID="audio-mode-toggle-active"
            title="Toggle session active"
            :onPress="handleToggleAudioActive"
            :color="lineColor"
          />
          <ActionButton
            testID="audio-mode-enable-silent"
            title="Enable silent-mode playback"
            :onPress="handleEnableSilentModePlayback"
            :color="lineColor"
          />
        </view>
        <text testID="audio-mode-result" class="auth-value-text">{{
          audioModeResultText
        }}</text>
        <view v-if="audioModeError" class="auth-result auth-result-error">
          <text class="auth-result-text">{{ audioModeError }}</text>
        </view>
      </view>

      <view testID="audio-playlist-card" class="auth-card">
        <view class="auth-card-header">
          <text class="auth-card-title">Playlist</text>
        </view>
        <view class="button-row">
          <ActionButton
            testID="audio-playlist-play"
            title="Play"
            :onPress="handlePlaylistPlay"
            :color="lineColor"
          />
          <ActionButton
            testID="audio-playlist-pause"
            title="Pause"
            :onPress="handlePlaylistPause"
            :color="lineColor"
          />
          <ActionButton
            testID="audio-playlist-previous"
            title="Previous"
            :onPress="handlePlaylistPrevious"
            :color="lineColor"
          />
          <ActionButton
            testID="audio-playlist-next"
            title="Next"
            :onPress="handlePlaylistNext"
            :color="lineColor"
          />
        </view>
        <text testID="audio-playlist-status" class="auth-value-text">{{
          `Track ${playlistIndexText}/${playlistTrackCountText} · ${playlistCurrentTimeText} / ${playlistDurationText} · playing: ${playlistPlayingText} · changed ${trackChangedCount}×`
        }}</text>
      </view>

      <view testID="audio-stream-card" class="auth-card">
        <view class="auth-card-header">
          <text class="auth-card-title">Stream</text>
        </view>
        <text class="info-text"
          >Real-time PCM capture — needs microphone permission.</text
        >
        <view class="button-row">
          <ActionButton
            testID="audio-stream-start"
            title="Start"
            :onPress="handleStreamStart"
            :color="lineColor"
          />
          <ActionButton
            testID="audio-stream-stop"
            title="Stop"
            :onPress="handleStreamStop"
            :color="lineColor"
          />
        </view>
        <text testID="audio-stream-status" class="auth-value-text">{{
          `streaming: ${streamIsStreamingText} · ${streamBufferCount} buffers received`
        }}</text>
        <view v-if="streamError" class="auth-result auth-result-error">
          <text class="auth-result-text">{{ streamError }}</text>
        </view>
      </view>

      <view testID="audio-preload-card" class="auth-card">
        <view class="auth-card-header">
          <text class="auth-card-title">Preload cache</text>
        </view>
        <view class="button-row">
          <ActionButton
            testID="audio-preload-add"
            title="Preload"
            :onPress="handlePreload"
            :color="lineColor"
          />
          <ActionButton
            testID="audio-preload-clear"
            title="Clear"
            :onPress="handleClearPreloaded"
            :color="lineColor"
          />
          <ActionButton
            testID="audio-preload-clear-all"
            title="Clear all"
            :onPress="handleClearAllPreloaded"
            :color="lineColor"
          />
        </view>
        <text testID="audio-preload-status" class="auth-value-text">{{
          preloadedSourcesText
        }}</text>
        <view v-if="preloadError" class="auth-result auth-result-error">
          <text class="auth-result-text">{{ preloadError }}</text>
        </view>
        <view
          v-else-if="preloadResultText"
          testID="audio-preload-result"
          class="auth-value-text"
        >
          <text>{{ preloadResultText }}</text>
        </view>
      </view>
    </scroll-view>
  </safe-area-view>
</template>
