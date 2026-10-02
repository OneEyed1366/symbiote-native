import { beforeEach, describe, expect, it, vi } from 'vitest';

type IListener = (params: never) => void;

class FakeSpeechModule {
  speak = vi.fn(async () => undefined);
  getVoices?: () => Promise<unknown[]>;
  isSpeaking = vi.fn(async () => false);
  stop = vi.fn(async () => undefined);
  pause?: () => Promise<void>;
  resume?: () => Promise<void>;
  maxSpeechInputLength?: number;

  private readonly listenersByName = new Map<string, Set<IListener>>();

  addListener(name: string, listener: IListener): { remove: () => void } {
    let listeners = this.listenersByName.get(name);
    if (!listeners) {
      listeners = new Set();
      this.listenersByName.set(name, listeners);
    }
    listeners.add(listener);
    return { remove: () => listeners.delete(listener) };
  }

  removeAllListeners(name: string): void {
    this.listenersByName.delete(name);
  }

  listenerCount(name: string): number {
    return this.listenersByName.get(name)?.size ?? 0;
  }

  emit(name: string, params: never): void {
    for (const listener of this.listenersByName.get(name) ?? [])
      listener(params);
  }
}

let fakeSpeechModule: FakeSpeechModule;

// requireNativeModule() only resolves on-device - faked in place of expo-modules-core's runtime
// resolution, same pattern as packages/print/src/core/print.test.ts.
vi.mock('./native-module', () => ({
  get expoSpeech() {
    return fakeSpeechModule;
  },
}));

// expo-modules-core's real entry transitively imports 'react-native' for Platform/
// TurboModuleRegistry, whose Flow-typed source Vitest's Oxc transform can't parse - same fake
// packages/application/src/core/application.test.ts uses.
vi.mock('expo-modules-core', () => ({
  UnavailabilityError: class UnavailabilityError extends Error {
    constructor(moduleName: string, propertyName: string) {
      super(`${propertyName} is not available on ${moduleName}`);
    }
  },
}));

let getAvailableVoicesAsync: typeof import('./speech').getAvailableVoicesAsync;
let isSpeakingAsync: typeof import('./speech').isSpeakingAsync;
let pause: typeof import('./speech').pause;
let resume: typeof import('./speech').resume;
let speak: typeof import('./speech').speak;
let stop: typeof import('./speech').stop;

// speech.ts keeps its callback registry as module-level state, so every test gets a fresh module
// instance (and a fresh fake) to avoid one test's in-flight callback leaking into the next.
beforeEach(async () => {
  vi.resetModules();
  fakeSpeechModule = new FakeSpeechModule();
  ({ getAvailableVoicesAsync, isSpeakingAsync, pause, resume, speak, stop } =
    await import('./speech'));
});

function lastSpokenId(): string {
  const call = fakeSpeechModule.speak.mock.calls.at(-1);
  if (!call) throw new Error('speak() was not called');
  return call[0];
}

describe('speak', () => {
  it('forwards text and options to the native module with a generated id', () => {
    speak('hello', { pitch: 1.2 });
    expect(fakeSpeechModule.speak).toHaveBeenCalledWith(
      expect.any(String),
      'hello',
      {
        pitch: 1.2,
      },
    );
  });

  it('invokes onStart when the native module reports speaking started for that id', () => {
    const onStart = vi.fn();
    speak('hello', { onStart });
    fakeSpeechModule.emit('Exponent.speakingStarted', {
      id: lastSpokenId(),
    } as never);
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('invokes onBoundary with charIndex/charLength', () => {
    const onBoundary = vi.fn();
    speak('hello', { onBoundary });
    fakeSpeechModule.emit('Exponent.speakingWillSayNextString', {
      id: lastSpokenId(),
      charIndex: 3,
      charLength: 2,
    } as never);
    expect(onBoundary).toHaveBeenCalledWith({ charIndex: 3, charLength: 2 });
  });

  it('invokes onDone and stops listening once the last callback is cleared', () => {
    const onDone = vi.fn();
    speak('hello', { onDone });
    const id = lastSpokenId();
    fakeSpeechModule.emit('Exponent.speakingDone', { id } as never);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(fakeSpeechModule.listenerCount('Exponent.speakingDone')).toBe(0);
  });

  it('invokes onStopped', () => {
    const onStopped = vi.fn();
    speak('hello', { onStopped });
    fakeSpeechModule.emit('Exponent.speakingStopped', {
      id: lastSpokenId(),
    } as never);
    expect(onStopped).toHaveBeenCalledTimes(1);
  });

  it('invokes onError with a real Error built from the native error string', () => {
    const onError = vi.fn();
    speak('hello', { onError });
    fakeSpeechModule.emit('Exponent.speakingError', {
      id: lastSpokenId(),
      error: 'boom',
    } as never);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'boom' }),
    );
  });

  it('keeps a second in-flight utterance callback isolated from the first', () => {
    const onDoneA = vi.fn();
    const onDoneB = vi.fn();
    speak('a', { onDone: onDoneA });
    const idA = lastSpokenId();
    speak('b', { onDone: onDoneB });
    const idB = lastSpokenId();

    fakeSpeechModule.emit('Exponent.speakingDone', { id: idB } as never);
    expect(onDoneB).toHaveBeenCalledTimes(1);
    expect(onDoneA).not.toHaveBeenCalled();

    fakeSpeechModule.emit('Exponent.speakingDone', { id: idA } as never);
    expect(onDoneA).toHaveBeenCalledTimes(1);
  });
});

describe('getAvailableVoicesAsync', () => {
  it('delegates to the native module when present', async () => {
    fakeSpeechModule.getVoices = vi.fn(async () => [{ identifier: 'v1' }]);
    await expect(getAvailableVoicesAsync()).resolves.toEqual([
      { identifier: 'v1' },
    ]);
  });

  it('throws UnavailabilityError when the native module has no getVoices', async () => {
    await expect(getAvailableVoicesAsync()).rejects.toThrow(/getVoices/);
  });
});

describe('isSpeakingAsync / stop', () => {
  it('delegates to the native module', async () => {
    await isSpeakingAsync();
    await stop();
    expect(fakeSpeechModule.isSpeaking).toHaveBeenCalledTimes(1);
    expect(fakeSpeechModule.stop).toHaveBeenCalledTimes(1);
  });
});

describe('pause / resume', () => {
  it('delegates to the native module when present (iOS)', async () => {
    fakeSpeechModule.pause = vi.fn(async () => undefined);
    fakeSpeechModule.resume = vi.fn(async () => undefined);
    await pause();
    await resume();
    expect(fakeSpeechModule.pause).toHaveBeenCalledTimes(1);
    expect(fakeSpeechModule.resume).toHaveBeenCalledTimes(1);
  });

  it('throws UnavailabilityError when absent (Android)', async () => {
    await expect(pause()).rejects.toThrow(/pause/);
    await expect(resume()).rejects.toThrow(/resume/);
  });
});
