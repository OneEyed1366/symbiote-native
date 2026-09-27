import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AudioRecorder,
  AUDIO_STREAM_BUFFER,
  AUDIO_STREAM_STATUS,
  PLAYBACK_STATUS_UPDATE,
  PLAYLIST_STATUS_UPDATE,
  RecordingPresets,
  TRACK_CHANGED,
  clearAllPreloadedSources,
  clearPreloadedSource,
  createAudioPlayer,
  createAudioPlaylist,
  createAudioStream,
  getPreloadedSources,
  getRecordingPermissionsAsync,
  preload,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  setIsAudioActiveAsync,
} from '@symbiote-native/audio';
import type {
  IAudioPlaylistStatus,
  IAudioStatus,
  IAudioStreamStatus,
} from '@symbiote-native/audio';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const TEST_TRACK_URL =
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';
const PLAYLIST_TRACK_URLS = [
  TEST_TRACK_URL,
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
];
const SEEK_STEP_SECONDS = 10;
const RECORD_POLL_INTERVAL_MS = 500;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type IAsyncResult<TValue> =
  { status: 'success'; value: TValue } | { status: 'error'; message: string };

type ICapabilityStatus = 'checking' | 'yes' | 'no';

function toCapabilityStatus(value: boolean): ICapabilityStatus {
  return value ? 'yes' : 'no';
}

function ResultBlock({
  testID,
  result,
}: {
  testID: string;
  result: IAsyncResult<string> | null;
}) {
  if (!result) {
    return null;
  }
  return (
    <view
      testID={testID}
      className={`auth-result auth-result-${result.status === 'success' ? 'success' : 'error'}`}
    >
      <text className="auth-result-text">
        {result.status === 'success'
          ? result.value
          : `Failed: ${result.message}`}
      </text>
    </view>
  );
}

function CapabilityBadge({ status }: { status: ICapabilityStatus }) {
  const label =
    status === 'checking' ? 'CHECKING…' : status === 'yes' ? 'YES' : 'NO';
  return (
    <view className={`auth-status-badge auth-status-badge-${status}`}>
      <text className="auth-status-text">{label}</text>
    </view>
  );
}

/**
 * @symbiote-native/audio canary demo: a remote-URL AudioPlayer (play/pause/seek, live status
 * via PLAYBACK_STATUS_UPDATE), a permission-gated AudioRecorder (record/pause/stop, polled
 * currentTime while recording), an AudioPlaylist (play/pause/next/previous, live status via
 * PLAYLIST_STATUS_UPDATE/TRACK_CHANGED), an AudioStream (start/stop, live status via
 * AUDIO_STREAM_STATUS/AUDIO_STREAM_BUFFER), the preload cache (preload/getPreloadedSources/
 * clearPreloadedSource/clearAllPreloadedSources), and the audio-session toggle
 * (setIsAudioActiveAsync/setAudioModeAsync). No bundled/local asset — this package deliberately
 * does not support the `number` asset-module source form, see its README's "Deliberately not
 * ported" section.
 */
export function AudioScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Audio];
  const lineColor = LINE_COLOR[lineInfo.line];

  // --- player ---
  const playerRef = useRef<ReturnType<typeof createAudioPlayer> | null>(null);
  if (!playerRef.current) {
    playerRef.current = createAudioPlayer(TEST_TRACK_URL);
  }
  const [playerStatus, setPlayerStatus] = useState<{
    currentTime: number;
    duration: number;
    playing: boolean;
  }>({ currentTime: 0, duration: 0, playing: false });
  const [seekResult, setSeekResult] = useState<IAsyncResult<string> | null>(
    null,
  );

  useEffect(() => {
    const player = playerRef.current;
    if (!player) {
      return;
    }
    const subscription = player.addListener(
      PLAYBACK_STATUS_UPDATE,
      (update: IAudioStatus) => {
        setPlayerStatus({
          currentTime: update.currentTime,
          duration: update.duration,
          playing: update.playing,
        });
      },
    );
    return () => {
      subscription.remove();
      player.remove();
    };
  }, []);

  const handlePlay = useCallback(() => {
    playerRef.current?.play();
  }, []);

  const handlePause = useCallback(() => {
    playerRef.current?.pause();
  }, []);

  const handleSeek = useCallback((deltaSeconds: number) => {
    const player = playerRef.current;
    if (!player) {
      return;
    }
    player
      .seekTo(Math.max(0, player.currentTime + deltaSeconds))
      .then(() => setSeekResult({ status: 'success', value: 'Seeked' }))
      .catch(error =>
        setSeekResult({ status: 'error', message: errorMessage(error) }),
      );
  }, []);

  // --- recorder ---
  const recorderRef = useRef<AudioRecorder | null>(null);
  if (!recorderRef.current) {
    recorderRef.current = new AudioRecorder(RecordingPresets.HIGH_QUALITY);
  }
  const [recordPermission, setRecordPermission] =
    useState<ICapabilityStatus>('checking');
  const [isRecordingUi, setIsRecordingUi] = useState(false);
  const [recordCurrentTime, setRecordCurrentTime] = useState(0);
  const [recordResult, setRecordResult] = useState<IAsyncResult<string> | null>(
    null,
  );

  useEffect(() => {
    let isMounted = true;
    getRecordingPermissionsAsync().then(response => {
      if (isMounted) {
        setRecordPermission(toCapabilityStatus(response.granted));
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const handleRequestRecordPermission = useCallback(() => {
    requestRecordingPermissionsAsync()
      .then(response =>
        setRecordPermission(toCapabilityStatus(response.granted)),
      )
      .catch(() => setRecordPermission('no'));
  }, []);

  const handleGetRecordPermission = useCallback(() => {
    getRecordingPermissionsAsync()
      .then(response =>
        setRecordPermission(toCapabilityStatus(response.granted)),
      )
      .catch(() => setRecordPermission('no'));
  }, []);

  const handleStartRecording = useCallback(() => {
    if (recordPermission !== 'yes') {
      setRecordResult({
        status: 'error',
        message: 'Request microphone permission first',
      });
      return;
    }
    const recorder = recorderRef.current;
    if (!recorder) {
      return;
    }
    recorder
      .prepareToRecordAsync()
      .then(() => {
        recorder.record();
        setIsRecordingUi(true);
        setRecordResult({ status: 'success', value: 'Recording started' });
      })
      .catch(error =>
        setRecordResult({ status: 'error', message: errorMessage(error) }),
      );
  }, [recordPermission]);

  const handlePauseRecording = useCallback(() => {
    recorderRef.current?.pause();
  }, []);

  const handleStopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder) {
      return;
    }
    recorder
      .stop()
      .then(() => {
        setIsRecordingUi(false);
        setRecordResult({
          status: 'success',
          value: `Stopped · ${recorder.uri ?? 'no uri'}`,
        });
      })
      .catch(error =>
        setRecordResult({ status: 'error', message: errorMessage(error) }),
      );
  }, []);

  useEffect(() => {
    if (!isRecordingUi) {
      return;
    }
    const interval = setInterval(() => {
      setRecordCurrentTime(recorderRef.current?.currentTime ?? 0);
    }, RECORD_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isRecordingUi]);

  // --- audio session mode ---
  const [modeResult, setModeResult] = useState<IAsyncResult<string> | null>(
    null,
  );

  const handleActivateSession = useCallback(() => {
    Promise.all([
      setIsAudioActiveAsync(true),
      setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: false,
        allowsRecording: true,
      }),
    ])
      .then(() =>
        setModeResult({ status: 'success', value: 'Session activated' }),
      )
      .catch(error =>
        setModeResult({ status: 'error', message: errorMessage(error) }),
      );
  }, []);

  const handleDeactivateSession = useCallback(() => {
    setIsAudioActiveAsync(false)
      .then(() =>
        setModeResult({ status: 'success', value: 'Session deactivated' }),
      )
      .catch(error =>
        setModeResult({ status: 'error', message: errorMessage(error) }),
      );
  }, []);

  // --- playlist ---
  const playlistRef = useRef<ReturnType<typeof createAudioPlaylist> | null>(
    null,
  );
  if (!playlistRef.current) {
    playlistRef.current = createAudioPlaylist({
      sources: PLAYLIST_TRACK_URLS,
      loop: 'all',
    });
  }
  const [playlistStatus, setPlaylistStatus] = useState<{
    currentIndex: number;
    trackCount: number;
    currentTime: number;
    duration: number;
    playing: boolean;
  }>({ currentIndex: 0, trackCount: 0, currentTime: 0, duration: 0, playing: false });
  const [trackChangedAt, setTrackChangedAt] = useState(0);

  useEffect(() => {
    const playlist = playlistRef.current;
    if (!playlist) {
      return;
    }
    const statusSubscription = playlist.addListener(
      PLAYLIST_STATUS_UPDATE,
      (update: IAudioPlaylistStatus) => {
        setPlaylistStatus({
          currentIndex: update.currentIndex,
          trackCount: update.trackCount,
          currentTime: update.currentTime,
          duration: update.duration,
          playing: update.playing,
        });
      },
    );
    const trackChangedSubscription = playlist.addListener(TRACK_CHANGED, () => {
      setTrackChangedAt(count => count + 1);
    });
    return () => {
      statusSubscription.remove();
      trackChangedSubscription.remove();
      playlist.destroy();
    };
  }, []);

  const handlePlaylistPlay = useCallback(() => {
    playlistRef.current?.play();
  }, []);

  const handlePlaylistPause = useCallback(() => {
    playlistRef.current?.pause();
  }, []);

  const handlePlaylistNext = useCallback(() => {
    playlistRef.current?.next();
  }, []);

  const handlePlaylistPrevious = useCallback(() => {
    playlistRef.current?.previous();
  }, []);

  // --- stream ---
  const streamRef = useRef<ReturnType<typeof createAudioStream> | null>(null);
  if (!streamRef.current) {
    streamRef.current = createAudioStream();
  }
  const [streamStatus, setStreamStatus] = useState<IAudioStreamStatus>({
    isStreaming: false,
  });
  const [streamBufferCount, setStreamBufferCount] = useState(0);
  const [streamResult, setStreamResult] = useState<IAsyncResult<string> | null>(
    null,
  );

  useEffect(() => {
    const stream = streamRef.current;
    if (!stream) {
      return;
    }
    const statusSubscription = stream.addListener(
      AUDIO_STREAM_STATUS,
      (update: IAudioStreamStatus) => setStreamStatus(update),
    );
    const bufferSubscription = stream.addListener(AUDIO_STREAM_BUFFER, () => {
      setStreamBufferCount(count => count + 1);
    });
    return () => {
      statusSubscription.remove();
      bufferSubscription.remove();
    };
  }, []);

  const handleStreamStart = useCallback(() => {
    streamRef.current
      ?.start()
      .then(() => setStreamResult({ status: 'success', value: 'Started' }))
      .catch(error =>
        setStreamResult({ status: 'error', message: errorMessage(error) }),
      );
  }, []);

  const handleStreamStop = useCallback(() => {
    streamRef.current?.stop();
  }, []);

  // --- preload cache ---
  const [preloadedSources, setPreloadedSources] = useState<string[]>([]);
  const [preloadResult, setPreloadResult] = useState<IAsyncResult<string> | null>(
    null,
  );

  const refreshPreloadedSources = useCallback(() => {
    getPreloadedSources().then(setPreloadedSources);
  }, []);

  useEffect(() => {
    refreshPreloadedSources();
  }, [refreshPreloadedSources]);

  const handlePreload = useCallback(() => {
    preload(TEST_TRACK_URL)
      .then(() => {
        setPreloadResult({ status: 'success', value: 'Preloaded' });
        refreshPreloadedSources();
      })
      .catch(error =>
        setPreloadResult({ status: 'error', message: errorMessage(error) }),
      );
  }, [refreshPreloadedSources]);

  const handleClearPreloaded = useCallback(() => {
    clearPreloadedSource(TEST_TRACK_URL)
      .then(() => {
        setPreloadResult({ status: 'success', value: 'Cleared' });
        refreshPreloadedSources();
      })
      .catch(error =>
        setPreloadResult({ status: 'error', message: errorMessage(error) }),
      );
  }, [refreshPreloadedSources]);

  const handleClearAllPreloaded = useCallback(() => {
    clearAllPreloadedSources()
      .then(() => {
        setPreloadResult({ status: 'success', value: 'Cleared all' });
        refreshPreloadedSources();
      })
      .catch(error =>
        setPreloadResult({ status: 'error', message: errorMessage(error) }),
      );
  }, [refreshPreloadedSources]);

  return (
    <safe-area-view className="screen">
      <scroll-view
        testID="audio-scroll"
        className="screen"
        contentContainerStyle="scroll-content"
      >
        <view className={`line-tag line-tag-${lineInfo.line}`}>
          <text className="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</text>
        </view>
        <view testID="audio-hero" className="hero-card">
          <view className="hero-badge" style={{ backgroundColor: lineColor }}>
            <text className="hero-badge-text">{lineInfo.code}</text>
          </view>
          <view className="hero-copy">
            <text className="hero-title">Audio</text>
            <text className="hero-body">
              @symbiote-native/audio — a remote-URL player, a permission-gated
              recorder, and the audio-session mode toggle. Every class here is a
              JSI-backed SharedObject, not a Fabric view.
            </text>
          </view>
        </view>

        <view testID="audio-player-card" className="auth-card">
          <view className="auth-card-header">
            <text className="auth-card-title">Player</text>
          </view>
          <text className="info-text">{TEST_TRACK_URL}</text>
          <view className="button-row">
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
              testID="audio-player-seek-back"
              title={`-${SEEK_STEP_SECONDS}s`}
              onPress={() => handleSeek(-SEEK_STEP_SECONDS)}
              color={lineColor}
            />
            <ActionButton
              testID="audio-player-seek-forward"
              title={`+${SEEK_STEP_SECONDS}s`}
              onPress={() => handleSeek(SEEK_STEP_SECONDS)}
              color={lineColor}
            />
          </view>
          <text testID="audio-player-status" className="auth-value-text">
            {`${playerStatus.currentTime.toFixed(1)}s / ${playerStatus.duration.toFixed(1)}s · ${playerStatus.playing ? 'playing' : 'paused'}`}
          </text>
          <ResultBlock testID="audio-player-seek-result" result={seekResult} />
        </view>

        <view testID="audio-recorder-card" className="auth-card">
          <view className="auth-card-header">
            <text className="auth-card-title">Recorder</text>
          </view>
          <view className="auth-capability-row">
            <text className="auth-capability-label">Microphone permission</text>
            <view className="location-permission-actions">
              <CapabilityBadge status={recordPermission} />
            </view>
          </view>
          <view className="button-row">
            <ActionButton
              testID="audio-recorder-request-permission"
              title="Request permission"
              onPress={handleRequestRecordPermission}
              color={lineColor}
            />
            <ActionButton
              testID="audio-recorder-get-permission"
              title="Get permission"
              onPress={handleGetRecordPermission}
              color={lineColor}
            />
          </view>
          <view className="button-row">
            <ActionButton
              testID="audio-recorder-start"
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
          </view>
          <text testID="audio-recorder-status" className="auth-value-text">
            {`${isRecordingUi ? 'RECORDING' : 'idle'} · ${recordCurrentTime.toFixed(1)}s`}
          </text>
          <ResultBlock testID="audio-recorder-result" result={recordResult} />
        </view>

        <view testID="audio-mode-card" className="auth-card">
          <view className="auth-card-header">
            <text className="auth-card-title">Audio session</text>
          </view>
          <view className="button-row">
            <ActionButton
              testID="audio-mode-activate"
              title="Activate"
              onPress={handleActivateSession}
              color={lineColor}
            />
            <ActionButton
              testID="audio-mode-deactivate"
              title="Deactivate"
              onPress={handleDeactivateSession}
              color={lineColor}
            />
          </view>
          <ResultBlock testID="audio-mode-result" result={modeResult} />
        </view>

        <view testID="audio-playlist-card" className="auth-card">
          <view className="auth-card-header">
            <text className="auth-card-title">Playlist</text>
          </view>
          <view className="button-row">
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
          <text testID="audio-playlist-status" className="auth-value-text">
            {`Track ${playlistStatus.currentIndex + 1}/${playlistStatus.trackCount} · ${playlistStatus.currentTime.toFixed(1)}s / ${playlistStatus.duration.toFixed(1)}s · ${playlistStatus.playing ? 'playing' : 'paused'} · changed ${trackChangedAt}×`}
          </text>
        </view>

        <view testID="audio-stream-card" className="auth-card">
          <view className="auth-card-header">
            <text className="auth-card-title">Stream</text>
          </view>
          <text className="info-text">Real-time PCM capture — needs microphone permission.</text>
          <view className="button-row">
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
          <text testID="audio-stream-status" className="auth-value-text">
            {`${streamStatus.isStreaming ? 'STREAMING' : 'idle'} · ${streamBufferCount} buffers received`}
          </text>
          <ResultBlock testID="audio-stream-result" result={streamResult} />
        </view>

        <view testID="audio-preload-card" className="auth-card">
          <view className="auth-card-header">
            <text className="auth-card-title">Preload cache</text>
          </view>
          <view className="button-row">
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
          <text testID="audio-preload-status" className="auth-value-text">
            {preloadedSources.length > 0
              ? preloadedSources.join(', ')
              : 'No preloaded sources'}
          </text>
          <ResultBlock testID="audio-preload-result" result={preloadResult} />
        </view>
      </scroll-view>
    </safe-area-view>
  );
}
