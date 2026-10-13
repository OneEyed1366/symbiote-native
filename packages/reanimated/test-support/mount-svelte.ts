import { flushSync, tick, type Component } from 'svelte';
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';

// Svelte's client runtime reads both on mount. They are set here and not at import, as upstream
// takes `window` at load for a browser and reads `matchMedia` off it
function installHostGlobals(): void {
  if (globalThis.window === undefined) {
    Object.assign(globalThis, { window: globalThis });
  }
  if (globalThis.navigator === undefined) {
    Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
  }
}

// Mounts `component` under the Svelte adapter and waits for the engine commit the mount queues
export async function mountSvelte(
  rootTag: number,
  component: Component,
  props?: object,
): Promise<() => void> {
  installHostGlobals();
  mount(rootTag, component, props);
  flushSync();
  await tick();
  return () => {
    unmount(rootTag);
    flushSync();
  };
}
