<script lang="ts">
  // @symbiote-native/audio tour stop — player (a remote MP3), recorder (permission-gated), and the
  // audio-session mode toggle. AudioPlayer/AudioRecorder are per-instance native SharedObjects, not
  // one-shot functions, so this screen owns their lifecycle itself: created in $effect, removed on
  // unmount. Svelte twin of examples/expo-vue-sfc/screens/AudioScreen.vue.
  import {
    AudioPlayer,
    AudioRecorder,
    AudioPlaylist,
    AudioStream,
    PLAYBACK_STATUS_UPDATE,
    RECORDING_STATUS_UPDATE,
    PLAYLIST_STATUS_UPDATE,
    TRACK_CHANGED,
    AUDIO_STREAM_STATUS,
    AUDIO_STREAM_BUFFER,
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
  } from '@symbiote-native/audio';
  import ActionButton from '../components/ActionButton.svelte';
  import { ROUTE_NAME } from '../routes';
  import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

  // A well-known, framework-neutral public test asset — the package deliberately does not support
  // a bundled/local asset source (README's "Deliberately not ported": no expo-asset dependency).
  const AUDIO_URL =
    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';
  const PLAYLIST_URLS = [
    AUDIO_URL,
    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
  ];

  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Audio];
  const lineColor = LINE_COLOR[lineInfo.line];

  type ICapabilityStatus = 'checking' | 'yes' | 'no';

  function toCapabilityStatus(value: boolean): ICapabilityStatus {
    return value ? 'yes' : 'no';
  }

  function capabilityStatusText(status: ICapabilityStatus): string {
    if (status === 'checking') return 'CHECKING…';
    return status === 'yes' ? 'YES' : 'NO';
  }

  // Player
  let player: AudioPlayer | null = null;
  let playerSubscription: ReturnType<AudioPlayer['addListener']> | null = null;
  let playerCurrentTime = $state(0);
  let playerDuration = $state(0);
  let playerPlaying = $state(false);
  let playerError = $state<string | null>(null);

  $effect(() => {
    const created = createAudioPlayer(AUDIO_URL);
    player = created;
    playerSubscription = created.addListener(PLAYBACK_STATUS_UPDATE, status => {
      playerCurrentTime = status.currentTime;
      playerDuration = status.duration;
      playerPlaying = status.playing;
    });
    return () => {
      playerSubscription?.remove();
      playerSubscription = null;
      created.remove();
      player = null;
    };
  });

  function handlePlayerPlay(): void {
    playerError = null;
    try {
      player?.play();
    } catch (reason) {
      playerError = String(reason);
    }
  }

  function handlePlayerPause(): void {
    playerError = null;
    try {
      player?.pause();
    } catch (reason) {
      playerError = String(reason);
    }
  }

  async function handlePlayerSeekToStart(): Promise<void> {
    playerError = null;
    try {
      await player?.seekTo(0);
    } catch (reason) {
      playerError = String(reason);
    }
  }

  const playerTimeText = $derived(
    `${playerCurrentTime.toFixed(1)}s / ${playerDuration.toFixed(1)}s`,
  );

  // Recorder — gated behind a granted permission check, same defensive shape
  // MediaLibraryScreen/LocationScreen use before a hardware call.
  let recorder: AudioRecorder | null = null;
  let recorderSubscription: ReturnType<AudioRecorder['addListener']> | null =
    null;
  let recorderPollHandle: ReturnType<typeof setInterval> | null = null;
  let recordingPermission = $state<ICapabilityStatus>('checking');
  let recordingPermissionError = $state<string | null>(null);
  let isRecording = $state(false);
  let recorderCurrentTime = $state(0);
  let recorderError = $state<string | null>(null);

  async function handleGetRecordingPermission(): Promise<void> {
    recordingPermissionError = null;
    try {
      const response = await getRecordingPermissionsAsync();
      recordingPermission = toCapabilityStatus(response.granted);
    } catch (reason) {
      recordingPermissionError = String(reason);
    }
  }

  async function handleRequestRecordingPermission(): Promise<void> {
    recordingPermissionError = null;
    try {
      const response = await requestRecordingPermissionsAsync();
      recordingPermission = toCapabilityStatus(response.granted);
    } catch (reason) {
      recordingPermissionError = String(reason);
    }
  }

  function ensureRecorder(): AudioRecorder {
    if (recorder) return recorder;
    const created = new AudioRecorder(RecordingPresets.HIGH_QUALITY);
    recorder = created;
    recorderSubscription = created.addListener(
      RECORDING_STATUS_UPDATE,
      status => {
        if (status.hasError) recorderError = status.error;
      },
    );
    recorderPollHandle = setInterval(() => {
      isRecording = created.isRecording;
      recorderCurrentTime = created.currentTime;
    }, 250);
    return created;
  }

  async function handleStartRecording(): Promise<void> {
    recorderError = null;
    if (recordingPermission !== 'yes') {
      recorderError = 'Grant microphone permission first.';
      return;
    }
    try {
      const activeRecorder = ensureRecorder();
      await activeRecorder.prepareToRecordAsync();
      activeRecorder.record();
    } catch (reason) {
      recorderError = String(reason);
    }
  }

  function handlePauseRecording(): void {
    recorderError = null;
    try {
      recorder?.pause();
    } catch (reason) {
      recorderError = String(reason);
    }
  }

  async function handleStopRecording(): Promise<void> {
    recorderError = null;
    try {
      await recorder?.stop();
    } catch (reason) {
      recorderError = String(reason);
    }
  }

  $effect(() => {
    return () => {
      recorderSubscription?.remove();
      if (recorderPollHandle !== null) clearInterval(recorderPollHandle);
    };
  });

  const recorderStatusText = $derived(
    `${isRecording ? 'recording' : 'idle'} · ${recorderCurrentTime.toFixed(1)}s`,
  );

  // Audio-session mode
  let audioActive = $state(true);
  let audioModeError = $state<string | null>(null);
  let audioModeDone = $state(false);

  async function handleToggleAudioActive(): Promise<void> {
    audioModeError = null;
    try {
      audioActive = !audioActive;
      await setIsAudioActiveAsync(audioActive);
      audioModeDone = true;
    } catch (reason) {
      audioModeError = String(reason);
    }
  }

  async function handleSetAudioMode(): Promise<void> {
    audioModeError = null;
    try {
      await setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: false,
        interruptionMode: 'mixWithOthers',
        allowsRecording: true,
      });
      audioModeDone = true;
    } catch (reason) {
      audioModeError = String(reason);
    }
  }

  // Playlist
  let playlist: AudioPlaylist | null = null;
  let playlistIndex = $state(0);
  let playlistTrackCount = $state(0);
  let playlistPlaying = $state(false);
  let playlistCurrentTime = $state(0);
  let playlistDuration = $state(0);
  let trackChangedCount = $state(0);

  $effect(() => {
    const created = createAudioPlaylist({ sources: PLAYLIST_URLS, loop: 'all' });
    playlist = created;
    const statusSubscription = created.addListener(
      PLAYLIST_STATUS_UPDATE,
      status => {
        playlistIndex = status.currentIndex;
        playlistTrackCount = status.trackCount;
        playlistPlaying = status.playing;
        playlistCurrentTime = status.currentTime;
        playlistDuration = status.duration;
      },
    );
    const trackChangedSubscription = created.addListener(TRACK_CHANGED, () => {
      trackChangedCount += 1;
    });
    return () => {
      statusSubscription.remove();
      trackChangedSubscription.remove();
      created.destroy();
      playlist = null;
    };
  });

  function handlePlaylistPlay(): void {
    playlist?.play();
  }
  function handlePlaylistPause(): void {
    playlist?.pause();
  }
  function handlePlaylistNext(): void {
    playlist?.next();
  }
  function handlePlaylistPrevious(): void {
    playlist?.previous();
  }

  const playlistStatusText = $derived(
    `Track ${playlistIndex + 1}/${playlistTrackCount} · ${playlistCurrentTime.toFixed(1)}s / ${playlistDuration.toFixed(1)}s · ${playlistPlaying ? 'playing' : 'paused'} · changed ${trackChangedCount}×`,
  );

  // Stream
  let stream: AudioStream | null = null;
  let streamIsStreaming = $state(false);
  let streamBufferCount = $state(0);
  let streamError = $state<string | null>(null);

  $effect(() => {
    const created = createAudioStream();
    stream = created;
    const statusSubscription = created.addListener(AUDIO_STREAM_STATUS, status => {
      streamIsStreaming = status.isStreaming;
    });
    const bufferSubscription = created.addListener(AUDIO_STREAM_BUFFER, () => {
      streamBufferCount += 1;
    });
    return () => {
      statusSubscription.remove();
      bufferSubscription.remove();
      stream = null;
    };
  });

  async function handleStreamStart(): Promise<void> {
    streamError = null;
    try {
      await stream?.start();
    } catch (reason) {
      streamError = String(reason);
    }
  }
  function handleStreamStop(): void {
    stream?.stop();
  }

  const streamStatusText = $derived(
    `${streamIsStreaming ? 'STREAMING' : 'idle'} · ${streamBufferCount} buffers received`,
  );

  // Preload cache
  let preloadedSources = $state<string[]>([]);
  let preloadError = $state<string | null>(null);
  let preloadResultText = $state<string | null>(null);

  async function refreshPreloadedSources(): Promise<void> {
    preloadedSources = await getPreloadedSources();
  }
  refreshPreloadedSources();

  async function handlePreload(): Promise<void> {
    preloadError = null;
    try {
      await preload(AUDIO_URL);
      preloadResultText = 'preloaded';
      await refreshPreloadedSources();
    } catch (reason) {
      preloadError = String(reason);
    }
  }
  async function handleClearPreloaded(): Promise<void> {
    preloadError = null;
    try {
      await clearPreloadedSource(AUDIO_URL);
      preloadResultText = 'cleared';
      await refreshPreloadedSources();
    } catch (reason) {
      preloadError = String(reason);
    }
  }
  async function handleClearAllPreloaded(): Promise<void> {
    preloadError = null;
    try {
      await clearAllPreloadedSources();
      preloadResultText = 'cleared all';
      await refreshPreloadedSources();
    } catch (reason) {
      preloadError = String(reason);
    }
  }
</script>

<safe-area-view class="screen">
  <scroll-view
    testID="audio-scroll"
    class="screen"
    contentContainerStyle="scroll-content"
  >
    <view class={`line-tag line-tag-${lineInfo.line}`}>
      <text class="line-tag-text">
        {`${lineInfo.code} · ${lineInfo.label}`}
      </text>
    </view>
    <view class="hero-card">
      <view class="hero-badge" style={{ backgroundColor: lineColor }}>
        <text class="hero-badge-text">{lineInfo.code}</text>
      </view>
      <view class="hero-copy">
        <text class="hero-title">Audio</text>
        <text testID="audio-hero" class="hero-body">
          @symbiote-native/audio — playback of a remote source, permission-gated
          recording, and the global audio-session mode, over a JSI-backed
          SharedObject with no hook/composable wrapper of its own.
        </text>
      </view>
    </view>

    <view testID="audio-player-card" class="auth-card">
      <view class="auth-card-header">
        <text class="auth-card-title">Player</text>
      </view>
      <text class="info-text">{AUDIO_URL}</text>
      <view class="button-row">
        <ActionButton
          testID="audio-player-play"
          title="Play"
          onPress={handlePlayerPlay}
          color={lineColor}
        />
        <ActionButton
          testID="audio-player-pause"
          title="Pause"
          onPress={handlePlayerPause}
          color={lineColor}
        />
        <ActionButton
          testID="audio-player-seek-start"
          title="Seek to start"
          onPress={handlePlayerSeekToStart}
          color={lineColor}
        />
      </view>{#if playerError}<text class="auth-result-text">
          {playerError}
        </text>{:else}<text
          testID="audio-player-status"
          class="auth-value-text"
        >
          {`${playerPlaying ? 'playing' : 'paused'} · ${playerTimeText}`}
        </text>{/if}
    </view>

    <view testID="audio-recorder-card" class="auth-card">
      <view class="auth-card-header">
        <text class="auth-card-title">Recorder</text>
        <view
          class={`auth-status-badge auth-status-badge-${recordingPermission}`}
        >
          <text class="auth-status-text">
            {capabilityStatusText(recordingPermission)}
          </text>
        </view>
      </view>
      <view class="button-row">
        <ActionButton
          testID="audio-recorder-get-permission"
          title="Get permission"
          onPress={handleGetRecordingPermission}
          color={lineColor}
        />
        <ActionButton
          testID="audio-recorder-request-permission"
          title="Request permission"
          onPress={handleRequestRecordingPermission}
          color={lineColor}
        />
      </view>{#if recordingPermissionError}<text class="auth-result-text">
          {recordingPermissionError}
        </text>{/if}
      <view class="button-row">
        <ActionButton
          testID="audio-recorder-record"
          title="Record"
          onPress={handleStartRecording}
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
      </view>{#if recorderError}<text class="auth-result-text">
          {recorderError}
        </text>{:else}<text
          testID="audio-recorder-status"
          class="auth-value-text"
        >
          {recorderStatusText}
        </text>{/if}
    </view>

    <view testID="audio-mode-card" class="auth-card">
      <view class="auth-card-header">
        <text class="auth-card-title">Audio session mode</text>
      </view>
      <view class="button-row">
        <ActionButton
          testID="audio-mode-toggle-active"
          title={audioActive ? 'Deactivate session' : 'Activate session'}
          onPress={handleToggleAudioActive}
          color={lineColor}
        />
        <ActionButton
          testID="audio-mode-set"
          title="Set silent-mode playback"
          onPress={handleSetAudioMode}
          color={lineColor}
        />
      </view>{#if audioModeError}<text class="auth-result-text">
          {audioModeError}
        </text>{:else if audioModeDone}<text
          testID="audio-mode-result"
          class="auth-value-text"
        >
          applied
        </text>{/if}
    </view>

    <view testID="audio-playlist-card" class="auth-card">
      <view class="auth-card-header">
        <text class="auth-card-title">Playlist</text>
      </view>
      <view class="button-row">
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
      </view>
      <text testID="audio-playlist-status" class="auth-value-text">
        {playlistStatusText}
      </text>
    </view>

    <view testID="audio-stream-card" class="auth-card">
      <view class="auth-card-header">
        <text class="auth-card-title">Stream</text>
      </view>
      <text class="info-text">Real-time PCM capture — needs microphone permission.</text>
      <view class="button-row">
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
      </view>
      {#if streamError}
        <text class="auth-result-text">{streamError}</text>
      {:else}
        <text testID="audio-stream-status" class="auth-value-text">
          {streamStatusText}
        </text>
      {/if}
    </view>

    <view testID="audio-preload-card" class="auth-card">
      <view class="auth-card-header">
        <text class="auth-card-title">Preload cache</text>
      </view>
      <view class="button-row">
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
      </view>
      <text testID="audio-preload-status" class="auth-value-text">
        {preloadedSources.length > 0
          ? preloadedSources.join(', ')
          : 'No preloaded sources'}
      </text>
      {#if preloadError}
        <text class="auth-result-text">{preloadError}</text>
      {:else if preloadResultText}
        <text testID="audio-preload-result" class="auth-value-text">
          {preloadResultText}
        </text>
      {/if}
    </view>
  </scroll-view>
</safe-area-view>
