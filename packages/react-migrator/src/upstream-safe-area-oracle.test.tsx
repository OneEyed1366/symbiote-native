// Upstream safe-area-context under the React adapter: the reference a port is diffed with
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, setNativeViewConfigSource, unmount } from '@symbiote-native/react';
import {
  createLiveTree,
  installRecordingFabric,
  payloadOf,
} from '@symbiote-native/test-utils';
import { SAFE_AREA_SCREEN } from '../fixtures/safe-area-context/scenarios';

// The package's own CJS `main` hands `react-native` to Node untransformed, so its ESM build is used
const UPSTREAM = 'react-native-safe-area-context/lib/module/index.js';

// A codegen spec needs the TurboModule registry, and a bare view name is what it hands React anyway
vi.mock('react-native-safe-area-context/lib/module/specs/NativeSafeAreaProvider.js', () => ({
  default: 'RNCSafeAreaProvider',
}));
vi.mock('react-native-safe-area-context/lib/module/specs/NativeSafeAreaView.js', () => ({
  default: 'RNCSafeAreaView',
}));
// The two modules it reads are the ones the React adapter hands an app
vi.mock('react-native', async () => {
  const adapter = await import('@symbiote-native/react');
  return { Dimensions: adapter.Dimensions, StyleSheet: adapter.StyleSheet };
});

const upstream: typeof import('react-native-safe-area-context') = await import(
  /* @vite-ignore */ UPSTREAM
);
const { SafeAreaProvider, SafeAreaView, useSafeAreaInsets, useSafeAreaFrame } = upstream;

const ROOT_TAG = 90_615;
const PROVIDER_VIEW = 'RNCSafeAreaProvider';
const fabric = installRecordingFabric();
const live = createLiveTree(fabric);

setNativeViewConfigSource(name =>
  name === PROVIDER_VIEW
    ? { directEventTypes: { topInsetsChange: { registrationName: 'onInsetsChange' } } }
    : undefined,
);

const INSETS = { top: 47, right: 0, bottom: 34, left: 0 };
const FRAME = { x: 0, y: 0, width: 390, height: 844 };
const METRICS = { insets: INSETS, frame: FRAME };

let renders = 0;

function InsetsProbe() {
  const insets = useSafeAreaInsets();
  const frame = useSafeAreaFrame();
  renders += 1;
  return createElement('text', null, `top=${insets.top} w=${frame.width}`);
}

function renderTree(children: ReactNode): void {
  mount(ROOT_TAG, createElement(SafeAreaProvider, { initialMetrics: METRICS }, children));
}

function screen(): string {
  return live.serialize(live.appRoot());
}

function fireInsets(nativeEvent: Record<string, unknown>): void {
  const node = fabric.find(each => each.viewName === PROVIDER_VIEW);
  const target = node?.instanceHandle;
  if (typeof target !== 'object' || target === null) {
    throw new Error(`no ${PROVIDER_VIEW} was created`);
  }
  fabric.fireEvent(target, 'topInsetsChange', nativeEvent);
}

beforeEach(() => {
  fabric.reset();
  renders = 0;
});
afterEach(() => unmount(ROOT_TAG));

describe('upstream safe-area under the React adapter', () => {
  it('hands the initial metrics to a consumer', () => {
    renderTree(createElement(InsetsProbe));

    expect(screen()).toBe(SAFE_AREA_SCREEN.mounted);
  });

  it('repaints the consumer on a native insets event', () => {
    renderTree(createElement(InsetsProbe));

    fireInsets({ insets: { ...INSETS, top: 59 }, frame: { ...FRAME, width: 430 } });

    expect(screen()).toBe(SAFE_AREA_SCREEN.afterInsetsEvent);
  });

  it('keeps the frame when an event carries none', () => {
    renderTree(createElement(InsetsProbe));

    fireInsets({ insets: { ...INSETS, top: 59 } });

    expect(screen()).toBe(SAFE_AREA_SCREEN.afterFramelessEvent);
  });

  it('does not repaint when the same insets and frame arrive again', () => {
    renderTree(createElement(InsetsProbe));
    const afterMount = renders;

    fireInsets({ insets: { ...INSETS }, frame: { ...FRAME } });

    expect(renders).toBe(afterMount);
  });

  it('lets a nested Provider inherit its parent metrics', () => {
    renderTree(createElement(SafeAreaProvider, null, createElement(InsetsProbe)));

    expect(screen()).toBe(SAFE_AREA_SCREEN.nested);
  });

  it('commits all four edges when SafeAreaView gets an array', () => {
    renderTree(createElement(SafeAreaView, { edges: ['top'] }));

    const view = fabric.find(each => each.viewName === 'RNCSafeAreaView');
    if (!view) throw new Error('no RNCSafeAreaView was created');
    expect(payloadOf(view.handle)).toMatchObject({
      edges: { top: 'additive', right: 'off', bottom: 'off', left: 'off' },
    });
  });
});
