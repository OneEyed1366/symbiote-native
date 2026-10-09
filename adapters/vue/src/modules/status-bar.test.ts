// Vue half of StatusBar: props reach native through the engine stack, a prop change replaces the
// entry and unmounting restores what the stack held below it
// Native call shapes are the engine's, covered in core/engine/src/status-bar

import { defineComponent, h, ref } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installRecordingFabric } from '@symbiote-native/test-utils';

import { mount, unmount } from '../render';
import { StatusBar } from './status-bar';

const ROOT_TAG = 9_977;

type IHiddenCall = { hidden: boolean; animation: string };

let styleCalls: string[] = [];
let hiddenCalls: IHiddenCall[] = [];

const fakeStatusBarManager = {
  setStyle: (style: string): void => {
    styleCalls.push(style);
  },
  setHidden: (hidden: boolean, animation: string): void => {
    hiddenCalls.push({ hidden, animation });
  },
  setNetworkActivityIndicatorVisible: (): void => {},
};

const registeredModules: Record<string, unknown> = {
  StatusBarManager: fakeStatusBarManager,
};

function isType<T>(value: unknown): value is T {
  return value !== null && value !== undefined;
}

Object.assign(globalThis, {
  __turboModuleProxy: <T>(name: string): T | null => {
    const module = registeredModules[name];
    return isType<T>(module) ? module : null;
  },
});

const fabric = installRecordingFabric();

// Vue batches on a microtask and the stack sends from `setImmediate` queued by it, so wait both
const frame = async (): Promise<void> => {
  await new Promise(resolve => setTimeout(resolve, 0));
  await new Promise<void>(resolve => setImmediate(resolve));
};

beforeEach(() => {
  fabric.reset();
  styleCalls = [];
  hiddenCalls = [];
});

afterEach(async () => {
  unmount(ROOT_TAG);
  await frame();
});

describe('Vue StatusBar', () => {
  it('applies its props on mount', async () => {
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () => h(StatusBar, { barStyle: 'light-content' }),
      }),
    );
    await frame();

    expect(styleCalls).toEqual(['light-content']);
  });

  // The attrs are reactive, a bar frozen at its mount value would never see a screen change
  it('replaces its entry when a prop changes', async () => {
    const hidden = ref(false);
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h(StatusBar, { barStyle: 'dark-content', hidden: hidden.value }),
      }),
    );
    await frame();
    hiddenCalls = [];

    hidden.value = true;
    await frame();

    expect(hiddenCalls).toEqual([{ hidden: true, animation: 'none' }]);
  });

  it('restores the defaults when the component unmounts', async () => {
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () => h(StatusBar, { barStyle: 'dark-content' }),
      }),
    );
    await frame();
    styleCalls = [];

    unmount(ROOT_TAG);
    await frame();

    expect(styleCalls).toEqual(['default']);
  });
});
