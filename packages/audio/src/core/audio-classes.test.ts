import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Fakes for the native `SharedObject` subclasses `expoAudio.AudioPlayer` / `.AudioRecorder` /
// `.AudioPlaylist` / `.AudioStream` — real prototype methods (not vi.fn() instance fields), so
// `super.replace(...)` / `super.setPlaybackRate(...)` / `super.prepareToRecordAsync(...)` from
// our subclasses in audio-player.ts/audio-recorder.ts resolve correctly through the prototype
// chain. Call args are pushed into these arrays instead of vi.fn() for the same reason.
const replaceCalls: unknown[] = [];
const setPlaybackRateCalls: unknown[][] = [];
const prepareToRecordCalls: unknown[] = [];

class FakeNativeAudioPlayer {
  source: unknown;
  updateInterval: number;
  keepAudioSessionActive: boolean;
  preferredForwardBufferDuration: number;
  constructor(
    source: unknown,
    updateInterval: number,
    keepAudioSessionActive: boolean,
    preferredForwardBufferDuration: number,
  ) {
    this.source = source;
    this.updateInterval = updateInterval;
    this.keepAudioSessionActive = keepAudioSessionActive;
    this.preferredForwardBufferDuration = preferredForwardBufferDuration;
  }
  replace(source: unknown) {
    replaceCalls.push(source);
  }
  setPlaybackRate(...args: unknown[]) {
    setPlaybackRateCalls.push(args);
  }
}

class FakeNativeAudioRecorder {
  options: unknown;
  constructor(options: unknown) {
    this.options = options;
  }
  prepareToRecordAsync(options?: unknown) {
    prepareToRecordCalls.push(options);
    return Promise.resolve();
  }
}

class FakeNativeAudioPlaylist {
  sources: unknown[];
  updateInterval: number;
  loop: unknown;
  constructor(sources: unknown[], updateInterval: number, loop: unknown) {
    this.sources = sources;
    this.updateInterval = updateInterval;
    this.loop = loop;
  }
}

class FakeNativeAudioStream {
  options: unknown;
  constructor(options: unknown) {
    this.options = options;
  }
}

vi.mock('./native-module', () => ({
  expoAudio: {
    AudioPlayer: FakeNativeAudioPlayer,
    AudioRecorder: FakeNativeAudioRecorder,
    AudioPlaylist: FakeNativeAudioPlaylist,
    AudioStream: FakeNativeAudioStream,
  },
}));

const mockPlatform = { OS: 'ios' as 'ios' | 'android' };

// expo-modules-core's real entry transitively imports 'react-native', whose Flow-typed source
// Vitest's Oxc transform can't parse — same fake every core test in this repo uses.
vi.mock('expo-modules-core', () => ({
  Platform: mockPlatform,
}));

const { AudioPlayer, createAudioPlayer } = await import('./audio-player');
const { AudioRecorder } = await import('./audio-recorder');
const { AudioPlaylist, createAudioPlaylist } = await import('./audio-playlist');
const { AudioStream, createAudioStream } = await import('./audio-stream');

beforeEach(() => {
  mockPlatform.OS = 'ios';
  replaceCalls.length = 0;
  setPlaybackRateCalls.length = 0;
  prepareToRecordCalls.length = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AudioPlayer', () => {
  it('replace() resolves a bare string source before delegating to native', () => {
    const player = new AudioPlayer(null, 500, false, 0);
    player.replace('https://example.com/track.mp3');
    expect(replaceCalls).toEqual([{ uri: 'https://example.com/track.mp3' }]);
  });

  it('setPlaybackRate() forwards both args on iOS', () => {
    mockPlatform.OS = 'ios';
    const player = new AudioPlayer(null, 500, false, 0);
    player.setPlaybackRate(1.5, 'high');
    expect(setPlaybackRateCalls).toEqual([[1.5, 'high']]);
  });

  it('setPlaybackRate() drops the pitch-correction arg on Android', () => {
    mockPlatform.OS = 'android';
    const player = new AudioPlayer(null, 500, false, 0);
    player.setPlaybackRate(1.5, 'high');
    expect(setPlaybackRateCalls).toEqual([[1.5]]);
  });
});

describe('createAudioPlayer', () => {
  it('applies defaults and resolves the source', () => {
    const player = createAudioPlayer('track.mp3');
    expect(player).toBeInstanceOf(AudioPlayer);
    expect(player.source).toEqual({ uri: 'track.mp3' });
    expect(player.updateInterval).toBe(500);
    expect(player.keepAudioSessionActive).toBe(false);
    expect(player.preferredForwardBufferDuration).toBe(0);
  });

  it('honors explicit options and a null source', () => {
    const player = createAudioPlayer(null, {
      updateInterval: 100,
      keepAudioSessionActive: true,
      preferredForwardBufferDuration: 20,
    });
    expect(player.source).toBeNull();
    expect(player.updateInterval).toBe(100);
    expect(player.keepAudioSessionActive).toBe(true);
    expect(player.preferredForwardBufferDuration).toBe(20);
  });
});

describe('AudioRecorder.prepareToRecordAsync', () => {
  it('applies the iOS branch of the recording options', async () => {
    mockPlatform.OS = 'ios';
    const recorder = new AudioRecorder({});
    await recorder.prepareToRecordAsync({
      extension: '.m4a',
      sampleRate: 44100,
      numberOfChannels: 2,
      bitRate: 128000,
      directory: 'cache',
      ios: { audioQuality: 0x7f },
    });
    expect(prepareToRecordCalls).toEqual([
      {
        extension: '.m4a',
        sampleRate: 44100,
        numberOfChannels: 2,
        bitRate: 128000,
        isMeteringEnabled: false,
        directory: 'cache',
        audioQuality: 0x7f,
      },
    ]);
  });

  it('passes undefined through when called with no options', async () => {
    const recorder = new AudioRecorder({});
    await recorder.prepareToRecordAsync();
    expect(prepareToRecordCalls).toEqual([undefined]);
  });
});

describe('createAudioPlaylist', () => {
  it('resolves every source and applies defaults', () => {
    const playlist = createAudioPlaylist({ sources: ['a.mp3', null, 'b.mp3'] });
    expect(playlist).toBeInstanceOf(AudioPlaylist);
    expect(playlist.sources).toEqual([{ uri: 'a.mp3' }, { uri: 'b.mp3' }]);
    expect(playlist.updateInterval).toBe(500);
    expect(playlist.loop).toBe('none');
  });
});

describe('createAudioStream', () => {
  it('applies the documented defaults', () => {
    const stream = createAudioStream();
    expect(stream).toBeInstanceOf(AudioStream);
    expect(stream.options).toEqual({
      sampleRate: 48000,
      channels: 1,
      encoding: 'float32',
    });
  });

  it('honors explicit options', () => {
    const stream = createAudioStream({
      sampleRate: 16000,
      channels: 2,
      encoding: 'int16',
    });
    expect(stream.options).toEqual({
      sampleRate: 16000,
      channels: 2,
      encoding: 'int16',
    });
  });
});
