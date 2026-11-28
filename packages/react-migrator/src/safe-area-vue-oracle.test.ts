// A hand-written Vue Provider over the expected Vue bridge, diffed with the upstream React tree
import { defineComponent, h, nextTick, shallowRef } from '@vue/runtime-core';
import type { VNode } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, setNativeViewConfigSource, unmount } from '@symbiote-native/vue';
import { createLiveTree, installRecordingFabric } from '@symbiote-native/test-utils';
import { pickFrame, pickInsets } from '../fixtures/safe-area-context/expected/core';
import { SAFE_AREA_SCREEN } from '../fixtures/safe-area-context/scenarios';
import type { IEdgeInsets, IRect } from '../fixtures/safe-area-context/expected/core';
import {
  SafeAreaFrameContext,
  SafeAreaInsetsContext,
  useSafeAreaFrame,
  useSafeAreaInsets,
} from '../fixtures/safe-area-context/expected/vue';

const ROOT_TAG = 90_616;
const PROVIDER_VIEW = 'RNCSafeAreaProvider';
const fabric = installRecordingFabric();
const live = createLiveTree(fabric);

setNativeViewConfigSource(name =>
  name === PROVIDER_VIEW
    ? { directEventTypes: { topInsetsChange: { registrationName: 'onInsetsChange' } } }
    : undefined,
);

const INSETS: IEdgeInsets = { top: 47, right: 0, bottom: 34, left: 0 };
const FRAME: IRect = { x: 0, y: 0, width: 390, height: 844 };

let renders = 0;

type IInsetsEvent = { nativeEvent: { insets: IEdgeInsets; frame?: IRect } };

const SafeAreaProvider = defineComponent((_, { slots }) => {
  const insets = shallowRef<IEdgeInsets | null>(INSETS);
  const frame = shallowRef<IRect>(FRAME);
  SafeAreaInsetsContext.provide(insets);
  SafeAreaFrameContext.provide(frame);
  const onInsetsChange = (event: IInsetsEvent): void => {
    insets.value = pickInsets(insets.value, event.nativeEvent.insets);
    frame.value = pickFrame(frame.value, event.nativeEvent.frame);
  };
  return (): VNode => h(PROVIDER_VIEW, { onInsetsChange }, slots.default?.());
});

const InsetsProbe = defineComponent(() => {
  const insets = useSafeAreaInsets();
  const frame = useSafeAreaFrame();
  return (): VNode => {
    renders += 1;
    return h('text', null, `top=${insets.value.top} w=${frame.value.width}`);
  };
});

function screen(): string {
  return live.serialize(live.appRoot());
}

function fireInsets(nativeEvent: Record<string, unknown>): void {
  const target = fabric.find(each => each.viewName === PROVIDER_VIEW)?.instanceHandle;
  if (typeof target !== 'object' || target === null) {
    throw new Error(`no ${PROVIDER_VIEW} was created`);
  }
  fabric.fireEvent(target, 'topInsetsChange', nativeEvent);
}

beforeEach(() => {
  fabric.reset();
  renders = 0;
  mount(ROOT_TAG, {
    render: (): VNode => h(SafeAreaProvider, null, { default: () => h(InsetsProbe) }),
  });
});
afterEach(() => unmount(ROOT_TAG));

describe('a Vue safe-area port against the upstream React tree', () => {
  it('paints what upstream paints on mount', () => {
    expect(screen()).toBe(SAFE_AREA_SCREEN.mounted);
  });

  it('paints what upstream paints after a native insets event', async () => {
    fireInsets({ insets: { ...INSETS, top: 59 }, frame: { ...FRAME, width: 430 } });
    await nextTick();

    expect(screen()).toBe(SAFE_AREA_SCREEN.afterInsetsEvent);
  });

  it('keeps the frame when an event carries none, as upstream', async () => {
    fireInsets({ insets: { ...INSETS, top: 59 } });
    await nextTick();

    expect(screen()).toBe(SAFE_AREA_SCREEN.afterFramelessEvent);
  });

  it('does not repaint when the same insets and frame arrive again, as upstream', async () => {
    const afterMount = renders;

    fireInsets({ insets: { ...INSETS }, frame: { ...FRAME } });
    await nextTick();

    expect(renders).toBe(afterMount);
  });
});
