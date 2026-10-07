// Svelte `SymbolView` через настоящий компилятор и recording fabric

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
import {
  processColor,
  setNativeViewConfigSource,
} from '@symbiote-native/engine';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';
import {
  createSvelteHarness,
  loadComponent,
} from './svelte-compile.test-helper';

const platform = vi.hoisted(() => ({
  OS: 'ios',
  select(spec: Record<string, unknown>): unknown {
    return spec[this.OS] ?? spec['default'];
  },
}));
const requireNativeViewManager = vi.hoisted(() => vi.fn());
const loadAsync = vi.hoisted(() => vi.fn());

vi.mock('expo-modules-core', () => ({
  Platform: platform,
  requireNativeViewManager,
}));
vi.mock('@symbiote-native/font', () => ({
  loadAsync,
  renderToImageAsync: vi.fn(),
}));
vi.mock('@expo-google-fonts/material-symbols/400Regular', () => ({
  MaterialSymbols_400Regular: 400,
}));

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 1644;
const NATIVE_VIEW = 'ViewManagerAdapter_SymbolModule';
const HOME_GLYPH = String.fromCharCode(59530);

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
setNativeViewConfigSource(name =>
  name === NATIVE_VIEW
    ? {
        validAttributes: {
          name: true,
          type: true,
          weight: true,
          animated: true,
          colors: true,
          tint: true,
        },
      }
    : undefined,
);

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let harness = createSvelteHarness('symbols');

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  loadAsync.mockResolvedValue(undefined);
  harness = createSvelteHarness('symbols');
  platform.OS = 'ios';
});

afterEach(() => {
  unmount(ROOT_TAG);
  harness.cleanup();
});

async function mountProbe(name: string, body: string): Promise<void> {
  const source = `<script lang="ts">
   import SymbolView from './symbol-view.svelte';
 </script>
 ${body}`;
  const app = harness.compileSource(__dirname, name, source);
  mount(ROOT_TAG, await loadComponent(app));
  await tick();
  await tick();
}

function nodeNamed(viewName: string) {
  const node = fabric.find(candidate => candidate.viewName === viewName);
  if (node === undefined) throw new Error(`no ${viewName} was created`);
  return live.nodeOf(node.handle);
}

const FALLBACK = `{#snippet fallback()}<view testID="fallback" />{/snippet}`;

function fallbackNode() {
  return live.findLive(
    live.appRoot(),
    node => node.payload.testID === 'fallback',
  );
}

describe('SymbolView on iOS', () => {
  it('paints the native view with the processed tint and the sized style', async () => {
    await mountProbe(
      'ios-app',
      `<SymbolView name="star.fill" tintColor="red" size={32} />`,
    );

    expect(nodeNamed(NATIVE_VIEW).payload).toMatchObject({
      name: 'star.fill',
      type: 'monochrome',
      animated: false,
      tint: processColor('red'),
      width: 32,
      height: 32,
    });
  });

  it('renders the fallback snippet when the platform has no name', async () => {
    await mountProbe(
      'fallback-app',
      `<SymbolView name={{ android: 'home' }}>${FALLBACK}</SymbolView>`,
    );

    expect(fallbackNode()).toBeDefined();
    expect(fabric.find(node => node.viewName === NATIVE_VIEW)).toBeUndefined();
  });
});

describe('SymbolView on Android', () => {
  beforeEach(() => {
    platform.OS = 'android';
  });

  it('draws the glyph once the font loaded', async () => {
    await mountProbe(
      'android-app',
      `<SymbolView name={{ android: 'home' }} />`,
    );

    const glyph = live.findLive(
      live.appRoot(),
      node => node.viewName === 'RCTRawText',
    );
    expect(glyph?.payload.text).toBe(HOME_GLYPH);
    expect(loadAsync).toHaveBeenCalledTimes(1);
  });

  it('stays an empty View when the font fails to load', async () => {
    loadAsync.mockRejectedValue(new Error('network'));

    await mountProbe('failed-app', `<SymbolView name={{ android: 'home' }} />`);

    expect(
      live.findLive(live.appRoot(), node => node.viewName === 'RCTRawText'),
    ).toBeUndefined();
  });

  it('renders the fallback snippet when the name has no Android entry', async () => {
    await mountProbe(
      'android-fallback-app',
      `<SymbolView name="star.fill">${FALLBACK}</SymbolView>`,
    );

    expect(fallbackNode()).toBeDefined();
  });
});
