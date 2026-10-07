// Svelte `GlassView` и `GlassContainer` через настоящий компилятор и recording fabric

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
import {
  DynamicColorIOS,
  PlatformColor,
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

vi.mock('expo-modules-core', () => ({
  Platform: platform,
  requireNativeViewManager,
  requireNativeModule: vi.fn(),
}));

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 1634;
const GLASS_VIEW = 'ViewManagerAdapter_ExpoGlassEffect_GlassView';
const GLASS_CONTAINER = 'ViewManagerAdapter_ExpoGlassEffect_GlassContainer';

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const keepColor = (value: unknown): unknown => value;
setNativeViewConfigSource(name => {
  if (name === GLASS_VIEW) {
    return {
      validAttributes: {
        glassEffectStyle: true,
        tintColor: { process: keepColor },
        isInteractive: true,
        colorScheme: true,
      },
    };
  }
  return name === GLASS_CONTAINER
    ? { validAttributes: { spacing: true } }
    : undefined;
});

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let harness = createSvelteHarness('glass');

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  harness = createSvelteHarness('glass');
  platform.OS = 'ios';
});

afterEach(() => {
  unmount(ROOT_TAG);
  harness.cleanup();
});

async function mountProbe(name: string, body: string): Promise<void> {
  const source = `<script lang="ts">
   import GlassView from './glass-view.svelte';
   import GlassContainer from './glass-container.svelte';
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

describe('GlassView (Positive)', () => {
  it.each(['regular', 'clear'] as const)(
    'renders a %s liquid glass view',
    async style => {
      await mountProbe(
        `style-${style}`,
        `<GlassView glassEffectStyle="${style}" testID="glass-view" />`,
      );

      const { payload } = nodeNamed(GLASS_VIEW);
      expect(payload.glassEffectStyle).toBe(style);
      expect(payload.testID).toBe('glass-view');
    },
  );

  it('forwards interactivity and color scheme', async () => {
    await mountProbe(
      'flags-app',
      `<GlassView isInteractive={true} colorScheme="dark" />`,
    );

    expect(nodeNamed(GLASS_VIEW).payload).toMatchObject({
      isInteractive: true,
      colorScheme: 'dark',
    });
  });

  it('holds the children inside the native view', async () => {
    await mountProbe(
      'children-app',
      `<GlassView><view testID="inner" /></GlassView>`,
    );

    expect(
      nodeNamed(GLASS_VIEW).children.map(child => child.payload.testID),
    ).toEqual(['inner']);
  });

  it('registers the view manager when it renders', async () => {
    await mountProbe('register-app', `<GlassView />`);

    expect(requireNativeViewManager).toHaveBeenCalledWith(
      'ExpoGlassEffect',
      'GlassView',
    );
  });
});

describe('GlassContainer (Positive)', () => {
  it('renders a liquid glass container holding glass views', async () => {
    await mountProbe(
      'container-app',
      `<GlassContainer spacing={8}>
         <GlassView testID="glass-children-1" />
         <GlassView testID="glass-children-2" />
       </GlassContainer>`,
    );

    const container = nodeNamed(GLASS_CONTAINER);
    expect(container.payload.spacing).toBe(8);
    expect(container.children.map(child => child.payload.testID)).toEqual([
      'glass-children-1',
      'glass-children-2',
    ]);
  });
});

describe('off iOS', () => {
  it('renders a plain View without native glass props and keeps the children', async () => {
    platform.OS = 'android';

    await mountProbe(
      'plain-app',
      `<GlassView glassEffectStyle="clear" tintColor="red" testID="plain">
         <view testID="inner" />
       </GlassView>`,
    );

    const plain = live.findLive(
      live.appRoot(),
      node => node.payload.testID === 'plain',
    );
    expect(plain?.viewName).toBe('RCTView');
    expect(plain?.payload.glassEffectStyle).toBeUndefined();
    expect(plain?.children).toHaveLength(1);
    expect(requireNativeViewManager).not.toHaveBeenCalled();
  });
});

describe('tint colors', () => {
  it.each([
    ['a string', 'rgba(255, 59, 48, 0.7)'],
    ['a PlatformColor', PlatformColor('systemBlue')],
    ['a DynamicColorIOS', DynamicColorIOS({ light: 'white', dark: 'black' })],
  ])('passes %s through the derived processor', async (_name, tintColor) => {
    Reflect.set(globalThis, '__glassTint', tintColor);

    await mountProbe(
      'tint-app',
      `<GlassView tintColor={globalThis.__glassTint} />`,
    );

    expect(nodeNamed(GLASS_VIEW).payload.tintColor).toEqual(tintColor);
  });
});
