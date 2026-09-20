// Co-located unit test for SoundManager: JS -> native only. A fake __turboModuleProxy returns a
// SoundManager module that records playTouchSound calls. Degrades to a no-op when the module is
// absent — never throws — so "no module" is its own describe below rather than a Negative group.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let SoundManager: typeof import('./index').SoundManager;
let calls: number;

beforeEach(async () => {
  calls = 0;

  const fakeSoundManager = {
    playTouchSound: (): void => {
      calls += 1;
    },
  };

  const registeredModules: Record<string, unknown> = {
    SoundManager: fakeSoundManager,
  };
  globalThis.__turboModuleProxy = <T>(name: string): T | null => {
    const module = registeredModules[name];
    return isPresent<T>(module) ? module : null;
  };

  vi.resetModules();
  ({ SoundManager } = await import('./index'));
});

afterEach(() => {
  globalThis.__turboModuleProxy = undefined;
});

function isPresent<T>(value: unknown): value is T {
  return value !== undefined;
}

describe('SoundManager', () => {
  it('calls the native module once per playTouchSound', () => {
    SoundManager.playTouchSound();
    SoundManager.playTouchSound();

    expect(calls).toBe(2);
  });
});

describe('SoundManager, module absent', () => {
  beforeEach(async () => {
    globalThis.__turboModuleProxy = <T>(): T | null => null;
    vi.resetModules();
    ({ SoundManager } = await import('./index'));
  });

  it('no-ops rather than throwing', () => {
    expect(() => SoundManager.playTouchSound()).not.toThrow();
  });
});
