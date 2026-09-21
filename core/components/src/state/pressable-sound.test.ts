// Pressability.js:749-757 — the Android system touch-sound feedback. Right before `onPress` fires,
// on Android, unless `android_disableSound === true`, RN calls `SoundManager.playTouchSound()`. Its
// own file because `Platform.OS` is read at module load, matching
// `touchable-native-feedback-android.test.ts`'s pattern for the same reason.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ISymbioteEvent } from '@symbiote-native/engine';
import type { IPressHost, IPressMachineConfig } from './pressable';

const { playTouchSound } = vi.hoisted(() => ({ playTouchSound: vi.fn() }));

vi.mock('@symbiote-native/engine', async () => {
  const actual = await vi.importActual<
    typeof import('@symbiote-native/engine')
  >('@symbiote-native/engine');
  return {
    ...actual,
    Platform: { ...actual.Platform, OS: 'android' },
    SoundManager: { playTouchSound },
  };
});

const { createPressHandlers, createPressRuntime } = await import('./pressable');

function eventAt(x = 0, y = 0): ISymbioteEvent {
  const target = createElement('RCTView');
  return {
    type: 'press',
    target,
    currentTarget: target,
    nativeEvent: { pageX: x, pageY: y },
    stopPropagation: () => {},
  };
}

beforeEach(() => {
  playTouchSound.mockClear();
});

describe('Pressable Android touch sound', () => {
  it('plays the touch sound before onPress fires', () => {
    const runtime = createPressRuntime();
    const onPress = vi.fn();
    const host: IPressHost = {
      setPressed: () => {},
      getMeasureFn: () => undefined,
      schedule: callback => {
        callback();
        return () => {};
      },
      now: () => 0,
    };
    const config: IPressMachineConfig = {
      delayLongPress: 500,
      unstable_pressDelay: 0,
      onPress,
    };
    const handlers = createPressHandlers(config, runtime, host);

    handlers.handlePressIn(eventAt());
    handlers.handlePress(eventAt());

    expect(playTouchSound).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('suppresses the sound when android_disableSound is true', () => {
    const runtime = createPressRuntime();
    const onPress = vi.fn();
    const host: IPressHost = {
      setPressed: () => {},
      getMeasureFn: () => undefined,
      schedule: callback => {
        callback();
        return () => {};
      },
      now: () => 0,
    };
    const config: IPressMachineConfig = {
      delayLongPress: 500,
      unstable_pressDelay: 0,
      onPress,
      android_disableSound: true,
    };
    const handlers = createPressHandlers(config, runtime, host);

    handlers.handlePressIn(eventAt());
    handlers.handlePress(eventAt());

    expect(playTouchSound).not.toHaveBeenCalled();
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not play a sound for a press suppressed by a prior long press', () => {
    const runtime = createPressRuntime();
    const onPress = vi.fn();
    const onLongPress = vi.fn();
    let due: (() => void) | undefined;
    const host: IPressHost = {
      setPressed: () => {},
      getMeasureFn: () => undefined,
      schedule: callback => {
        due = callback;
        return () => {
          due = undefined;
        };
      },
      now: () => 0,
    };
    const config: IPressMachineConfig = {
      delayLongPress: 500,
      unstable_pressDelay: 0,
      onPress,
      onLongPress,
    };
    const handlers = createPressHandlers(config, runtime, host);

    handlers.handlePressIn(eventAt());
    due?.();
    handlers.handlePress(eventAt());

    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
    expect(playTouchSound).not.toHaveBeenCalled();
  });
});
