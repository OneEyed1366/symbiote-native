import { Component, OnDestroy, signal } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import type { PermissionResponse } from 'expo-modules-core';
import {
  AudioRecorder,
  PLAYBACK_STATUS_UPDATE,
  RECORDING_STATUS_UPDATE,
  PLAYLIST_STATUS_UPDATE,
  TRACK_CHANGED,
  AUDIO_STREAM_BUFFER,
  AUDIO_STREAM_STATUS,
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
import type { IAudioStatus } from '@symbiote-native/audio';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const TRACK_URL =
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';
const PLAYLIST_TRACK_URLS = [
  TRACK_URL,
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
];
const SEEK_STEP_SECONDS = 10;
const RECORDER_POLL_MS = 250;

/**
 * @symbiote-native/audio canary demo: an AudioPlayer against a remote MP3 (play/pause/seek, live
 * status via PLAYBACK_STATUS_UPDATE), an AudioRecorder gated behind a granted permission (record/
 * pause/stop, live isRecording/currentTime via a short poll while recording), and the audio-mode
 * module functions (setIsAudioActiveAsync/setAudioModeAsync). No Angular service wrapper exists
 * for this package — AudioPlayer/AudioRecorder are SharedObject instances, same imperative shape
 * as FileSystemScreen/MediaLibraryScreen.
 */
@Component({
  selector: 'AudioScreen',
  standalone: true,
  imports: [ActionButton, SYMBIOTE_ELEMENTS],
  template: `
    <safe-area-view class="screen">
      <scroll-view
        testID="audio-scroll"
        class="screen"
        contentContainerStyle="scroll-content"
      >
        <view [class]="lineTagClass">
          <text class="line-tag-text">{{ lineTagLabel }}</text>
        </view>
        <view class="hero-card">
          <view class="hero-badge" [style]="heroBadgeStyle">
            <text class="hero-badge-text">{{ heroBadgeCode }}</text>
          </view>
          <view class="hero-copy">
            <text class="hero-title">Audio</text>
            <text testID="audio-hero" class="hero-body">
              @symbiote-native/audio — AudioPlayer/AudioRecorder shared objects
              and the audio-session mode functions.
            </text>
          </view>
        </view>

        <view testID="audio-player-card" class="capability-card">
          <text class="capability-card-title">Player</text>
          <view class="button-row">
            <ActionButton
              testID="audio-player-play"
              title="Play"
              (press)="playPlayer()"
              [color]="lineColor"
            ></ActionButton>
            <ActionButton
              testID="audio-player-pause"
              title="Pause"
              (press)="pausePlayer()"
              [color]="lineColor"
            ></ActionButton>
            <ActionButton
              testID="audio-player-seek-forward"
              title="Seek +10s"
              (press)="seekForward()"
              [color]="lineColor"
            ></ActionButton>
            <ActionButton
              testID="audio-player-seek-start"
              title="Seek to start"
              (press)="seekToStart()"
              [color]="lineColor"
            ></ActionButton>
          </view>
          <text testID="audio-player-status" class="value-text">{{
            playerStatusLabel()
          }}</text>
        </view>

        <view testID="audio-recorder-card" class="capability-card">
          <text class="capability-card-title">Recorder</text>
          <view class="button-row">
            <ActionButton
              testID="audio-recorder-request-permission"
              title="Request permission"
              (press)="requestRecordingPermission()"
              [color]="lineColor"
            ></ActionButton>
            <ActionButton
              testID="audio-recorder-get-permission"
              title="Get permission"
              (press)="getRecordingPermission()"
              [color]="lineColor"
            ></ActionButton>
          </view>
          <text testID="audio-recorder-permission-status" class="value-text">{{
            recordingPermissionLabel()
          }}</text>
          <view class="button-row">
            <ActionButton
              testID="audio-recorder-start"
              title="Record"
              (press)="startRecording()"
              [color]="lineColor"
            ></ActionButton>
            <ActionButton
              testID="audio-recorder-pause"
              title="Pause"
              (press)="pauseRecording()"
              [color]="lineColor"
            ></ActionButton>
            <ActionButton
              testID="audio-recorder-stop"
              title="Stop"
              (press)="stopRecording()"
              [color]="lineColor"
            ></ActionButton>
          </view>
          <text testID="audio-recorder-status" class="value-text">{{
            recorderStatusLabel()
          }}</text>
        </view>

        <view testID="audio-mode-card" class="capability-card">
          <text class="capability-card-title">Audio mode</text>
          <view class="button-row">
            <ActionButton
              testID="audio-mode-toggle-active"
              [title]="audioActiveToggleTitle()"
              (press)="toggleAudioActive()"
              [color]="lineColor"
            ></ActionButton>
            <ActionButton
              testID="audio-mode-set-silent"
              title="Play in silent mode"
              (press)="applySilentModePlayback()"
              [color]="lineColor"
            ></ActionButton>
          </view>
          <text testID="audio-mode-status" class="value-text">{{
            audioModeLabel()
          }}</text>
        </view>

        <view testID="audio-playlist-card" class="capability-card">
          <text class="capability-card-title">Playlist</text>
          <view class="button-row">
            <ActionButton
              testID="audio-playlist-play"
              title="Play"
              (press)="playPlaylist()"
              [color]="lineColor"
            ></ActionButton>
            <ActionButton
              testID="audio-playlist-pause"
              title="Pause"
              (press)="pausePlaylist()"
              [color]="lineColor"
            ></ActionButton>
            <ActionButton
              testID="audio-playlist-previous"
              title="Previous"
              (press)="previousTrack()"
              [color]="lineColor"
            ></ActionButton>
            <ActionButton
              testID="audio-playlist-next"
              title="Next"
              (press)="nextTrack()"
              [color]="lineColor"
            ></ActionButton>
          </view>
          <text testID="audio-playlist-status" class="value-text">{{
            playlistStatusLabel()
          }}</text>
        </view>

        <view testID="audio-stream-card" class="capability-card">
          <text class="capability-card-title">Stream</text>
          <text class="info-text"
            >Real-time PCM capture — needs microphone permission.</text
          >
          <view class="button-row">
            <ActionButton
              testID="audio-stream-start"
              title="Start"
              (press)="startStream()"
              [color]="lineColor"
            ></ActionButton>
            <ActionButton
              testID="audio-stream-stop"
              title="Stop"
              (press)="stopStream()"
              [color]="lineColor"
            ></ActionButton>
          </view>
          <text testID="audio-stream-status" class="value-text">{{
            streamStatusLabel()
          }}</text>
        </view>

        <view testID="audio-preload-card" class="capability-card">
          <text class="capability-card-title">Preload cache</text>
          <view class="button-row">
            <ActionButton
              testID="audio-preload-add"
              title="Preload"
              (press)="addPreload()"
              [color]="lineColor"
            ></ActionButton>
            <ActionButton
              testID="audio-preload-clear"
              title="Clear"
              (press)="clearOnePreload()"
              [color]="lineColor"
            ></ActionButton>
            <ActionButton
              testID="audio-preload-clear-all"
              title="Clear all"
              (press)="clearEveryPreload()"
              [color]="lineColor"
            ></ActionButton>
          </view>
          <text testID="audio-preload-status" class="value-text">{{
            preloadedSourcesLabel()
          }}</text>
          <text testID="audio-preload-result" class="value-text">{{
            preloadResultLabel()
          }}</text>
        </view>
      </scroll-view>
    </safe-area-view>
  `,
})
export class AudioScreen implements OnDestroy {
  private readonly lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Audio];
  readonly lineTagClass = `line-tag line-tag-${this.lineInfo.line}`;
  readonly lineTagLabel = `${this.lineInfo.code} · ${this.lineInfo.label}`;
  readonly heroBadgeCode = this.lineInfo.code;
  readonly lineColor = LINE_COLOR[this.lineInfo.line];
  readonly heroBadgeStyle = { backgroundColor: this.lineColor };

  // --- player ---
  private readonly player = createAudioPlayer(TRACK_URL);
  private readonly playerStatus = signal<IAudioStatus | null>(null);
  private readonly playerSubscription = this.player.addListener(
    PLAYBACK_STATUS_UPDATE,
    status => this.playerStatus.set(status),
  );

  playPlayer(): void {
    this.player.play();
  }

  pausePlayer(): void {
    this.player.pause();
  }

  async seekForward(): Promise<void> {
    await this.player.seekTo(this.player.currentTime + SEEK_STEP_SECONDS);
  }

  async seekToStart(): Promise<void> {
    await this.player.seekTo(0);
  }

  playerStatusLabel(): string {
    const status = this.playerStatus();
    if (!status) return 'not loaded yet';
    return `${status.currentTime.toFixed(1)}s / ${status.duration.toFixed(1)}s · playing: ${status.playing}`;
  }

  // --- recorder ---
  private readonly recorder = new AudioRecorder(RecordingPresets.HIGH_QUALITY);
  private readonly recordingPermission = signal<PermissionResponse | null>(
    null,
  );
  private readonly recorderError = signal<string | null>(null);
  private readonly recorderTick = signal(0);
  private recorderIntervalId: ReturnType<typeof setInterval> | null = null;
  private readonly recorderSubscription = this.recorder.addListener(
    RECORDING_STATUS_UPDATE,
    status => {
      if (status.hasError) {
        this.recorderError.set(status.error ?? 'recording error');
      }
    },
  );

  async requestRecordingPermission(): Promise<void> {
    try {
      this.recordingPermission.set(await requestRecordingPermissionsAsync());
      this.recorderError.set(null);
    } catch (error) {
      this.recorderError.set(errorMessage(error));
    }
  }

  async getRecordingPermission(): Promise<void> {
    try {
      this.recordingPermission.set(await getRecordingPermissionsAsync());
      this.recorderError.set(null);
    } catch (error) {
      this.recorderError.set(errorMessage(error));
    }
  }

  private isRecordingPermissionGranted(): boolean {
    return this.recordingPermission()?.granted === true;
  }

  async startRecording(): Promise<void> {
    if (!this.isRecordingPermissionGranted()) {
      this.recorderError.set('Request recording permission first.');
      return;
    }
    try {
      await this.recorder.prepareToRecordAsync();
      this.recorder.record();
      this.recorderError.set(null);
      this.startRecorderPolling();
    } catch (error) {
      this.recorderError.set(errorMessage(error));
    }
  }

  pauseRecording(): void {
    this.recorder.pause();
  }

  async stopRecording(): Promise<void> {
    try {
      await this.recorder.stop();
      this.recorderError.set(null);
    } catch (error) {
      this.recorderError.set(errorMessage(error));
    } finally {
      this.stopRecorderPolling();
    }
  }

  private startRecorderPolling(): void {
    this.stopRecorderPolling();
    this.recorderIntervalId = setInterval(() => {
      this.recorderTick.update(tick => tick + 1);
    }, RECORDER_POLL_MS);
  }

  private stopRecorderPolling(): void {
    if (this.recorderIntervalId === null) return;
    clearInterval(this.recorderIntervalId);
    this.recorderIntervalId = null;
  }

  recordingPermissionLabel(): string {
    const response = this.recordingPermission();
    return response
      ? `${response.status} (granted: ${response.granted})`
      : 'not checked yet';
  }

  recorderStatusLabel(): string {
    const error = this.recorderError();
    if (error) return error;
    this.recorderTick();
    return `recording: ${this.recorder.isRecording} · ${this.recorder.currentTime.toFixed(1)}s`;
  }

  // --- audio mode ---
  private readonly isPlaybackActive = signal(true);
  private readonly audioModeError = signal<string | null>(null);

  async toggleAudioActive(): Promise<void> {
    try {
      const next = !this.isPlaybackActive();
      await setIsAudioActiveAsync(next);
      this.isPlaybackActive.set(next);
      this.audioModeError.set(null);
    } catch (error) {
      this.audioModeError.set(errorMessage(error));
    }
  }

  async applySilentModePlayback(): Promise<void> {
    try {
      await setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: false,
        allowsRecording: true,
      });
      this.audioModeError.set(null);
    } catch (error) {
      this.audioModeError.set(errorMessage(error));
    }
  }

  audioActiveToggleTitle(): string {
    return this.isPlaybackActive() ? 'Deactivate audio' : 'Activate audio';
  }

  audioModeLabel(): string {
    const error = this.audioModeError();
    if (error) return error;
    return `audio session: ${this.isPlaybackActive() ? 'active' : 'inactive'}`;
  }

  // --- playlist ---
  private readonly playlist = createAudioPlaylist({
    sources: PLAYLIST_TRACK_URLS,
    loop: 'all',
  });
  private readonly playlistIndex = signal(0);
  private readonly playlistTrackCount = signal(0);
  private readonly playlistPlaying = signal(false);
  private readonly playlistCurrentTime = signal(0);
  private readonly playlistDuration = signal(0);
  private readonly trackChangedCount = signal(0);
  private readonly playlistStatusSubscription = this.playlist.addListener(
    PLAYLIST_STATUS_UPDATE,
    status => {
      this.playlistIndex.set(status.currentIndex);
      this.playlistTrackCount.set(status.trackCount);
      this.playlistPlaying.set(status.playing);
      this.playlistCurrentTime.set(status.currentTime);
      this.playlistDuration.set(status.duration);
    },
  );
  private readonly trackChangedSubscription = this.playlist.addListener(
    TRACK_CHANGED,
    () => this.trackChangedCount.update(count => count + 1),
  );

  playPlaylist(): void {
    this.playlist.play();
  }

  pausePlaylist(): void {
    this.playlist.pause();
  }

  nextTrack(): void {
    this.playlist.next();
  }

  previousTrack(): void {
    this.playlist.previous();
  }

  playlistStatusLabel(): string {
    const index = this.playlistIndex();
    const trackCount = this.playlistTrackCount();
    const currentTime = this.playlistCurrentTime().toFixed(1);
    const duration = this.playlistDuration().toFixed(1);
    const playing = this.playlistPlaying();
    return `Track ${index + 1}/${trackCount} · ${currentTime}s / ${duration}s · playing: ${playing} · changed ${this.trackChangedCount()}×`;
  }

  // --- stream ---
  private readonly stream = createAudioStream();
  private readonly streamIsStreaming = signal(false);
  private readonly streamBufferCount = signal(0);
  private readonly streamError = signal<string | null>(null);
  private readonly streamStatusSubscription = this.stream.addListener(
    AUDIO_STREAM_STATUS,
    status => this.streamIsStreaming.set(status.isStreaming),
  );
  private readonly streamBufferSubscription = this.stream.addListener(
    AUDIO_STREAM_BUFFER,
    () => this.streamBufferCount.update(count => count + 1),
  );

  async startStream(): Promise<void> {
    try {
      await this.stream.start();
      this.streamError.set(null);
    } catch (error) {
      this.streamError.set(errorMessage(error));
    }
  }

  stopStream(): void {
    this.stream.stop();
  }

  streamStatusLabel(): string {
    const error = this.streamError();
    if (error) return error;
    return `streaming: ${this.streamIsStreaming()} · ${this.streamBufferCount()} buffers received`;
  }

  // --- preload cache ---
  private readonly preloadedSources = signal<string[]>([]);
  private readonly preloadError = signal<string | null>(null);
  private readonly preloadResult = signal<string | null>(null);

  constructor() {
    void this.refreshPreloadedSources();
  }

  private async refreshPreloadedSources(): Promise<void> {
    this.preloadedSources.set(await getPreloadedSources());
  }

  async addPreload(): Promise<void> {
    try {
      await preload(TRACK_URL);
      this.preloadError.set(null);
      this.preloadResult.set('preloaded');
      await this.refreshPreloadedSources();
    } catch (error) {
      this.preloadError.set(errorMessage(error));
    }
  }

  async clearOnePreload(): Promise<void> {
    try {
      await clearPreloadedSource(TRACK_URL);
      this.preloadError.set(null);
      this.preloadResult.set('cleared');
      await this.refreshPreloadedSources();
    } catch (error) {
      this.preloadError.set(errorMessage(error));
    }
  }

  async clearEveryPreload(): Promise<void> {
    try {
      await clearAllPreloadedSources();
      this.preloadError.set(null);
      this.preloadResult.set('cleared all');
      await this.refreshPreloadedSources();
    } catch (error) {
      this.preloadError.set(errorMessage(error));
    }
  }

  preloadedSourcesLabel(): string {
    const sources = this.preloadedSources();
    return sources.length > 0 ? sources.join(', ') : 'No preloaded sources';
  }

  preloadResultLabel(): string {
    return this.preloadError() ?? this.preloadResult() ?? 'not changed yet';
  }

  ngOnDestroy(): void {
    this.playerSubscription.remove();
    this.player.remove();
    this.recorderSubscription.remove();
    this.stopRecorderPolling();
    this.playlistStatusSubscription.remove();
    this.trackChangedSubscription.remove();
    this.playlist.destroy();
    this.streamStatusSubscription.remove();
    this.streamBufferSubscription.remove();
  }
}
