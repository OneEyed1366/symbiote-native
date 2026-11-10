// Вложенные нажимаемые: в RN респондер один, поэтому нажатие получает только внутренний
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
import { installRecordingFabric } from '@symbiote-native/test-utils';

const ROOT_TAG = 142;
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

function tap(tree: ReactElement, testID: string): void {
  mount(ROOT_TAG, tree);
  const target = handleFor(testID);
  fabric.fireEvent(target, TOUCH_START);
  fabric.fireEvent(target, TOUCH_END);
  vi.runAllTimers();
}

describe('nested pressables', () => {
  it('presses only the innermost one', () => {
    const calls: string[] = [];
    tap(
      <pressable testID="outer" onPress={() => calls.push('outer')}>
        <pressable testID="inner" onPress={() => calls.push('inner')} />
      </pressable>,
      'inner',
    );
    expect(calls).toEqual(['inner']);
  });

  it('reports press in and press out to the innermost one only', () => {
    const calls: string[] = [];
    tap(
      <pressable
        testID="outer"
        onPressIn={() => calls.push('outer in')}
        onPressOut={() => calls.push('outer out')}
      >
        <pressable
          testID="inner"
          onPress={() => calls.push('inner press')}
          onPressIn={() => calls.push('inner in')}
          onPressOut={() => calls.push('inner out')}
        />
      </pressable>,
      'inner',
    );
    expect(calls).toEqual(['inner in', 'inner press', 'inner out']);
  });

  it('lets the outer one press when the inner one is disabled', () => {
    const calls: string[] = [];
    tap(
      <pressable testID="outer" onPress={() => calls.push('outer')}>
        <pressable
          testID="inner"
          disabled
          onPress={() => calls.push('inner')}
        />
      </pressable>,
      'inner',
    );
    expect(calls).toEqual(['outer']);
  });

  it('presses the outer one through a plain view inside it', () => {
    const calls: string[] = [];
    tap(
      <pressable testID="outer" onPress={() => calls.push('outer')}>
        <view testID="plain" />
      </pressable>,
      'plain',
    );
    expect(calls).toEqual(['outer']);
  });
});
