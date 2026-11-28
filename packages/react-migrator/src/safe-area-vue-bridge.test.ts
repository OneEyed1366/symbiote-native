// The expected Vue output for react-native-safe-area-context, mounted through the real Vue adapter
import { defineComponent, h, shallowRef } from '@vue/runtime-core';
import type { ComputedRef, ShallowRef, VNode } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { NO_INSETS_ERROR } from '../fixtures/safe-area-context/expected/core';
import type { ICornerAdaptedInsets, IEdgeInsets, IRect } from '../fixtures/safe-area-context/expected/core';
import {
  SafeAreaCornerAdaptedInsetsContext,
  SafeAreaFrameContext,
  SafeAreaInsetsContext,
  useSafeAreaFrame,
  useSafeAreaInsets,
} from '../fixtures/safe-area-context/expected/vue';

const ROOT_TAG = 90_614;
const fabric = installRecordingFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

const PORTRAIT: IEdgeInsets = { top: 47, right: 0, bottom: 34, left: 0 };
const LANDSCAPE: IEdgeInsets = { top: 0, right: 47, bottom: 21, left: 47 };
const CORNER: ICornerAdaptedInsets = {
  vertical: { top: 59, right: 0, bottom: 40, left: 0 },
  horizontal: { top: 0, right: 59, bottom: 21, left: 59 },
};
const FRAME: IRect = { x: 0, y: 0, width: 390, height: 844 };

type IProvided = {
  insets: ShallowRef<IEdgeInsets | null>;
  frame: ShallowRef<IRect | null>;
  corner?: ShallowRef<ICornerAdaptedInsets | null>;
};

function mountTree(provided: IProvided | null, setup: () => void): void {
  const Consumer = defineComponent(() => {
    setup();
    return (): VNode => h('view');
  });
  const Provider = defineComponent((_, { slots }) => {
    if (provided) {
      SafeAreaInsetsContext.provide(provided.insets);
      SafeAreaFrameContext.provide(provided.frame);
      if (provided.corner) SafeAreaCornerAdaptedInsetsContext.provide(provided.corner);
    }
    return () => slots.default?.();
  });
  mount(ROOT_TAG, { render: (): VNode => h(Provider, null, { default: () => h(Consumer) }) });
}

function readInsets(provided: IProvided, adaptation?: 'vertical'): ComputedRef<IEdgeInsets> {
  let insets: ComputedRef<IEdgeInsets> | undefined;
  mountTree(provided, () => {
    insets = useSafeAreaInsets(adaptation ? { cornerAdaptation: adaptation } : undefined);
  });
  if (insets === undefined) throw new Error('the consumer did not set up');
  return insets;
}

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('the Vue twin of useSafeAreaInsets', () => {
  it('reads the insets and the frame the Provider gives', async () => {
    let frame: ComputedRef<IRect> | undefined;
    const provided = { insets: shallowRef(PORTRAIT), frame: shallowRef(FRAME) };
    const insets = readInsets(provided);
    mountTree(provided, () => {
      frame = useSafeAreaFrame();
    });
    await tick();

    expect(insets.value).toEqual(PORTRAIT);
    expect(frame?.value).toEqual(FRAME);
  });

  it('follows the Provider when its insets change', async () => {
    const provided = { insets: shallowRef(PORTRAIT), frame: shallowRef(FRAME) };
    const insets = readInsets(provided);
    await tick();

    provided.insets.value = LANDSCAPE;

    expect(insets.value).toEqual(LANDSCAPE);
  });

  it('takes the corner-adapted insets for the asked axis', async () => {
    const provided = { insets: shallowRef(PORTRAIT), frame: shallowRef(FRAME), corner: shallowRef(CORNER) };
    const insets = readInsets(provided, 'vertical');
    await tick();

    expect(insets.value).toEqual(CORNER.vertical);
  });

  it('falls back to the regular insets without a corner Provider', async () => {
    const insets = readInsets({ insets: shallowRef(PORTRAIT), frame: shallowRef(FRAME) }, 'vertical');
    await tick();

    expect(insets.value).toEqual(PORTRAIT);
  });

  it('throws in setup without a Provider, where React throws at render', () => {
    let caught: unknown;
    mountTree(null, () => {
      try {
        useSafeAreaInsets();
      } catch (error) {
        caught = error;
      }
    });

    expect(caught).toEqual(new Error(NO_INSETS_ERROR));
  });
});
