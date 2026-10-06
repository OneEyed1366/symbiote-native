// Нажимаемый `<Text>` идёт через машину нажатия, как `usePressability` у RN
// Отмену за `pressRetentionOffset` здесь не проверить, т.к. рамку нажатия даёт `measure`, которого
// у записывающего хоста нет. Её держит `state/pressability-rn.test.ts`
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
import { installRecordingFabric } from '@symbiote-native/test-utils';

const ROOT_TAG = 141;
const TOUCH_START = 'topTouchStart';
const TOUCH_END = 'topTouchEnd';

const fabric = installRecordingFabric();
beforeEach(() => {
  vi.useFakeTimers();
  fabric.reset();
});
afterEach(() => {
  unmount(ROOT_TAG);
  vi.useRealTimers();
});

function handleFor(testID: string): unknown {
  const node = fabric.find(n => n.props.testID === testID);
  if (!node) throw new Error(`no node created with testID=${testID}`);
  return node.instanceHandle;
}

describe('React pressable text (Positive)', () => {
  it('presses on a tap and reports press in and press out around it', () => {
    const calls: string[] = [];
    mount(
      ROOT_TAG,
      <text
        testID="tap"
        onPressIn={() => calls.push('in')}
        onPress={() => calls.push('press')}
        onPressOut={() => calls.push('out')}
      >
        tap
      </text>,
    );
    const handle = handleFor('tap');
    fabric.fireEvent(handle, TOUCH_START);
    fabric.fireEvent(handle, TOUCH_END);
    vi.runAllTimers();
    expect(calls).toEqual(['in', 'press', 'out']);
  });

  it('ignores onPressIn on a text that has no press listener', () => {
    const onPressIn = vi.fn();
    mount(
      ROOT_TAG,
      <text testID="idle" onPressIn={onPressIn}>
        idle
      </text>,
    );
    const handle = handleFor('idle');
    fabric.fireEvent(handle, TOUCH_START);
    fabric.fireEvent(handle, TOUCH_END);
    vi.runAllTimers();
    expect(onPressIn).not.toHaveBeenCalled();
  });
});
