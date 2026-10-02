// Svelte twin of the `../react`/`../vue`/`../solid` `NavigationBar` tests, driven through the
// real compiler and slot

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import {
  createSvelteHarness,
  loadComponent,
} from './svelte-compile.test-helper';

const { pushStackEntry, popStackEntry, replaceStackEntry, useColorScheme } =
  vi.hoisted(() => ({
    pushStackEntry: vi.fn((props: unknown) => props),
    popStackEntry: vi.fn(),
    replaceStackEntry: vi.fn((_entry: unknown, props: unknown) => props),
    useColorScheme: vi.fn(),
  }));

vi.mock('../core', () => ({
  pushStackEntry,
  popStackEntry,
  replaceStackEntry,
}));
vi.mock('@symbiote-native/svelte', () => ({ useColorScheme }));

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_930;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let harness = createSvelteHarness('navigation-bar');

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  harness = createSvelteHarness('navigation-bar');
  useColorScheme.mockReturnValue({ current: 'light' });
});

afterEach(() => {
  unmount(ROOT_TAG);
  harness.cleanup();
});

async function mountApp(name: string, appSource: string): Promise<void> {
  const app = harness.compileSource(__dirname, name, appSource);
  mount(ROOT_TAG, await loadComponent(app));
  await tick();
  await tick();
}

describe('NavigationBar (Positive: pushes/replaces/pops a stack entry across its lifecycle)', () => {
  it('pushes a stack entry on mount with its initial props', async () => {
    await mountApp(
      'mount-app',
      `<script lang="ts">
       import NavigationBar from './NavigationBar.svelte';
     </script>
     <NavigationBar style="dark" hidden={false} />`,
    );

    expect(pushStackEntry).toHaveBeenCalledWith({
      style: 'dark',
      hidden: false,
    });
  });

  it('reads the current color scheme, so an auto style stays reactive to it', async () => {
    await mountApp(
      'scheme-app',
      `<script lang="ts">
       import NavigationBar from './NavigationBar.svelte';
     </script>
     <NavigationBar style="auto" />`,
    );

    expect(useColorScheme).toHaveBeenCalled();
  });

  it('pops the stack entry on unmount', async () => {
    await mountApp(
      'unmount-app',
      `<script lang="ts">
       import NavigationBar from './NavigationBar.svelte';
     </script>
     <NavigationBar style="dark" />`,
    );

    unmount(ROOT_TAG);

    expect(popStackEntry).toHaveBeenCalledTimes(1);
  });

  it('replaces the stack entry when its own props change', async () => {
    await mountApp(
      'replace-app',
      `<script lang="ts">
       import NavigationBar from './NavigationBar.svelte';
       let props = $state<{ style: 'dark' | 'light'; hidden: boolean }>({ style: 'dark', hidden: false });
       Object.assign(globalThis, { __setNavigationBarProps: (next: typeof props) => { props = next; } });
     </script>
     <NavigationBar style={props.style} hidden={props.hidden} />`,
    );
    replaceStackEntry.mockClear();

    const setProps = (
      globalThis as { __setNavigationBarProps?: (next: unknown) => void }
    ).__setNavigationBarProps;
    setProps?.({ style: 'light', hidden: true });
    await tick();

    expect(replaceStackEntry).toHaveBeenCalledWith(
      { style: 'dark', hidden: false },
      { style: 'light', hidden: true },
    );
  });
});
