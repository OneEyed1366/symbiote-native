/** @jsxRuntime automatic */
// RN #58800: после скрытия `Activity` из `onPress` кнопка остаётся на `activeOpacity`

import { Activity, useState, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';

const ROOT_TAG = 13;
const FADE_SETTLE_MS = 600;

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const FRAME_MS = 16;

beforeEach(() => {
  fabric.reset();
  Object.assign(globalThis, {
    requestAnimationFrame: (cb: (time: number) => void) =>
      Number(setTimeout(() => cb(Date.now()), FRAME_MS)),
    cancelAnimationFrame: (id: number) => clearTimeout(id),
  });
});
afterEach(() => {
  unmount(ROOT_TAG);
  Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
  Reflect.deleteProperty(globalThis, 'cancelAnimationFrame');
});

function settle(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, FADE_SETTLE_MS));
}

function press(testID: string): void {
  const view = fabric.find(
    node => node.viewName === 'RCTView' && node.props.testID === testID,
  );
  if (view === undefined) throw new Error(`no view with testID=${testID}`);
  fabric.fireEvent(view.instanceHandle, 'topTouchStart');
  fabric.fireEvent(view.instanceHandle, 'topTouchEnd');
}

function opacityOf(testID: string): unknown {
  const node = live.findLive(live.appRoot(), n => n.props.testID === testID);
  return node?.payload.opacity;
}

function App(): ReactElement {
  const [isHidden, setIsHidden] = useState(false);
  return (
    <view>
      <pressable testID="show" onPress={() => setIsHidden(false)} />
      <Activity mode={isHidden ? 'hidden' : 'visible'}>
        <touchable-opacity testID="hider" onPress={() => setIsHidden(true)} />
      </Activity>
    </view>
  );
}

describe('a TouchableOpacity that hides its own Activity', () => {
  it('comes back at full opacity', async () => {
    mount(ROOT_TAG, <App />);

    press('hider');
    press('show');
    await settle();

    expect(opacityOf('hider') ?? 1).toBe(1);
  });

  // Без этого зелёный тест мог бы пройти, потому что затухание вообще не писалось в payload
  it('does fade while it is held', async () => {
    mount(ROOT_TAG, <App />);
    const view = fabric.find(
      node => node.viewName === 'RCTView' && node.props.testID === 'hider',
    );
    if (view === undefined) throw new Error('no hider view');

    fabric.fireEvent(view.instanceHandle, 'topTouchStart');
    await settle();

    expect(opacityOf('hider')).toBeLessThan(1);
  });
});
