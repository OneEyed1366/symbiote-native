// Co-located test for the Solid StatusBar. Drives REAL compiled Solid JSX through the universal
// renderer into the fake Fabric slot, against a fake StatusBarManager TurboModule — so what is
// asserted is the adapter's own contract: the effect applies the props on mount, RE-applies them
// when a prop signal changes, and the component contributes no host node. The native call shapes
// themselves (which setter, which argument order, the iOS/Android divergence) are the engine's,
// covered in core/engine/src/status-bar/*.
//
// The prop-change case is the one that cannot be inferred from the other adapters: React and
// Angular re-run on a dep array / ngOnChanges, while a Solid component body runs ONCE — a props
// field read outside the effect would freeze at its mount value with nothing to report it.

import { createSignal } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';
import type {
  IStatusBarAnimation,
  IStatusBarStyle,
} from '@symbiote-native/engine';

import { mount, unmount } from '../render';
import { StatusBar } from './status-bar';

const ROOT_TAG = 921;

// ---- fake StatusBarManager ----------------------------------------------

interface IStyleCall {
  style: IStatusBarStyle;
  animated: boolean;
}
interface IHiddenCall {
  hidden: boolean;
  animation: IStatusBarAnimation;
}

let styleCalls: IStyleCall[] = [];
let hiddenCalls: IHiddenCall[] = [];
let networkCalls: boolean[] = [];

const fakeStatusBarManager = {
  setStyle: (style: IStatusBarStyle, animated: boolean): void => {
    styleCalls.push({ style, animated });
  },
  setHidden: (hidden: boolean, animation: IStatusBarAnimation): void => {
    hiddenCalls.push({ hidden, animation });
  },
  setNetworkActivityIndicatorVisible: (visible: boolean): void => {
    networkCalls.push(visible);
  },
};

const registeredModules: Record<string, unknown> = {
  StatusBarManager: fakeStatusBarManager,
};

function isType<T>(value: unknown): value is T {
  return value !== null && value !== undefined;
}

Object.assign(globalThis, {
  __turboModuleProxy: <T,>(name: string): T | null => {
    const module = registeredModules[name];
    if (!isType<T>(module)) return null;
    return module;
  },
  RN$registerCallableModule: (): void => {},
});

const fabric = installFabric();

beforeEach(() => {
  fabric.reset();
  styleCalls = [];
  hiddenCalls = [];
  networkCalls = [];
});

afterEach(() => unmount(ROOT_TAG));

describe('StatusBar', () => {
  // why: the whole component is one effect; if it never ran, an app's `<StatusBar barStyle=…>`
  // would be inert with no error anywhere — the native module is optional by design.
  it('applies its props on mount and renders no host node', () => {
    mount(ROOT_TAG, () => (
      <StatusBar
        barStyle="light-content"
        hidden={false}
        networkActivityIndicatorVisible
      />
    ));

    expect(styleCalls).toEqual([{ style: 'light-content', animated: false }]);
    expect(hiddenCalls).toEqual([{ hidden: false, animation: 'none' }]);
    expect(networkCalls).toEqual([true]);
    // StatusBar drives a native module, it does not paint: a stray host node here would land an
    // empty RCTView in the app's layout.
    expect(fabric.counts.createNode).toBe(0);
  });

  // why: a Solid body runs once. Reading `props.hidden` outside the effect (or handing the engine
  // a snapshot bag) type-checks, mounts correctly, and then never updates again.
  it('re-applies when a prop signal changes', () => {
    const [hidden, setHidden] = createSignal(false);

    mount(ROOT_TAG, () => (
      <StatusBar barStyle="dark-content" hidden={hidden()} animated />
    ));

    expect(hiddenCalls).toEqual([{ hidden: false, animation: 'fade' }]);

    setHidden(true);

    expect(hiddenCalls).toEqual([
      { hidden: false, animation: 'fade' },
      { hidden: true, animation: 'fade' },
    ]);
  });

  // why: RN exposes the imperative API without rendering anything, and app code calls it that way.
  // Attaching the statics to the component function object is what makes `StatusBar.setHidden`
  // resolve at all.
  it('carries the imperative statics on the component object', () => {
    StatusBar.setBarStyle('dark-content', true);
    StatusBar.setHidden(true, 'slide');
    StatusBar.setNetworkActivityIndicatorVisible(false);

    expect(styleCalls).toEqual([{ style: 'dark-content', animated: true }]);
    expect(hiddenCalls).toEqual([{ hidden: true, animation: 'slide' }]);
    expect(networkCalls).toEqual([false]);
    // Android-only setters are inert on the iOS-resolved engine half, not missing.
    expect(() => {
      StatusBar.setBackgroundColor('#000', false);
      StatusBar.setTranslucent(true);
    }).not.toThrow();
  });

  // why: `currentHeight` is a getter so nothing touches native at import time; on the iOS-resolved
  // engine half it reads undefined, and a value (not a getter) would have been captured at import.
  it('exposes currentHeight as a lazy getter', () => {
    expect(StatusBar.currentHeight).toBeUndefined();
    const descriptor = Object.getOwnPropertyDescriptor(
      StatusBar,
      'currentHeight',
    );
    expect(descriptor?.get).toBeTypeOf('function');
  });
});
