// Proves the StatusBar primitive, the first JS->native consumer of the native-module
// bridge. The shared fake-Fabric slot records the committed tree; a fake
// __turboModuleProxy returns a StatusBarManager that records its calls. We mount
// <view><StatusBar .../></view> and assert StatusBar's effect drove the recorded native
// setters with the values our prop->method mapping sends.

import { type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StatusBar, mount, unmount } from '@symbiote-native/react';
import { statusBarImperative } from '@symbiote-native/engine';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';

const BAR_STYLE = 'dark-content';
const ROOT_TAG = 270;

type IRecordedCall = {
  method: string;
  args: unknown[];
};

const recorded: IRecordedCall[] = [];

const fakeStatusBarManager = {
  setStyle(statusBarStyle: string, animated: boolean): void {
    recorded.push({ method: 'setStyle', args: [statusBarStyle, animated] });
  },
  setHidden(hidden: boolean, withAnimation: string): void {
    recorded.push({ method: 'setHidden', args: [hidden, withAnimation] });
  },
  setNetworkActivityIndicatorVisible(visible: boolean): void {
    recorded.push({
      method: 'setNetworkActivityIndicatorVisible',
      args: [visible],
    });
  },
};

const registeredModules: Record<string, unknown> = {
  StatusBarManager: fakeStatusBarManager,
};

// The fake proxy hands back a value the caller typed as T; this one guard is the fake's
// own trust boundary (the real native proxy returns a HostObject directly).
function isType<T>(value: unknown): value is T {
  return value !== null && value !== undefined;
}

Object.assign(globalThis, {
  __turboModuleProxy: <T,>(name: string): T | null => {
    const module = registeredModules[name];
    if (module === undefined || module === null) return null;
    if (!isType<T>(module)) return null;
    return module;
  },
});

function App(): ReactElement {
  return (
    <view>
      <StatusBar barStyle={BAR_STYLE} hidden animated />
    </view>
  );
}

// The stack sends to native once per frame, from `setImmediate`
const frame = (): Promise<void> =>
  new Promise(resolve => setImmediate(resolve));

function find(method: string): IRecordedCall | undefined {
  return recorded.find(call => call.method === method);
}

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
beforeEach(() => {
  fabric.reset();
  recorded.length = 0;
});
// Unmounting queues a flush back to the defaults, which has to land before the next case
afterEach(async () => {
  unmount(ROOT_TAG);
  await frame();
});

describe('StatusBar (iOS)', () => {
  it('renders null — only the app View sits under the container', () => {
    mount(ROOT_TAG, <App />);
    const root = live.nodeOf(live.appRoot());
    expect(root.children.map(child => child.viewName)).toEqual(['RCTView']);
    expect(root.children[0].children, 'and it is empty').toHaveLength(0);
  });

  it('drives setStyle with the bar style and the animated flag', async () => {
    mount(ROOT_TAG, <App />);
    await frame();
    const styleCall = find('setStyle');
    expect(styleCall, 'setStyle was called').toBeDefined();
    expect(styleCall!.args).toEqual([BAR_STYLE, true]);
  });

  it('drives setHidden(true, "fade") for hidden + animated', async () => {
    mount(ROOT_TAG, <App />);
    await frame();
    const hiddenCall = find('setHidden');
    expect(hiddenCall, 'setHidden was called').toBeDefined();
    expect(hiddenCall!.args).toEqual([true, 'fade']);
  });

  it('drives the network-activity indicator from its prop', async () => {
    mount(
      ROOT_TAG,
      <view>
        <StatusBar networkActivityIndicatorVisible />
      </view>,
    );
    await frame();
    expect(find('setNetworkActivityIndicatorVisible')!.args).toEqual([true]);
  });

  it('restores the defaults when the component unmounts', async () => {
    mount(ROOT_TAG, <App />);
    await frame();
    recorded.length = 0;

    unmount(ROOT_TAG);
    await frame();

    expect(find('setStyle')!.args).toEqual(['default', false]);
    expect(find('setHidden')!.args).toEqual([false, 'none']);
  });

  // The statics must be the engine's own function objects, a copy would pass every test above
  it('attaches the engine statusBarImperative statics verbatim, not a local reimplementation', () => {
    expect(StatusBar.setBarStyle).toBe(statusBarImperative.setBarStyle);
    expect(StatusBar.setHidden).toBe(statusBarImperative.setHidden);
    expect(StatusBar.setNetworkActivityIndicatorVisible).toBe(
      statusBarImperative.setNetworkActivityIndicatorVisible,
    );
    expect(StatusBar.setBackgroundColor).toBe(
      statusBarImperative.setBackgroundColor,
    );
    expect(StatusBar.setTranslucent).toBe(statusBarImperative.setTranslucent);
  });
});
