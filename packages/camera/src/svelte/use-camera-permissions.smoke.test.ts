// Svelte twin of `../react`'s camera permission hooks test, driven through the real compiler

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import {
  createSvelteHarness,
  loadComponent,
} from './svelte-compile.test-helper';

const methods = vi.hoisted(() => ({
  cameraGet: vi.fn(),
  cameraRequest: vi.fn(),
  microphoneGet: vi.fn(),
  microphoneRequest: vi.fn(),
}));

vi.mock('../core/camera-api', () => ({
  cameraPermissionMethods: {
    getMethod: methods.cameraGet,
    requestMethod: methods.cameraRequest,
  },
  microphonePermissionMethods: {
    getMethod: methods.microphoneGet,
    requestMethod: methods.microphoneRequest,
  },
}));

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_942;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

const GRANTED = {
  granted: true,
  status: 'granted',
  canAskAgain: true,
  expires: 'never',
};
const DENIED = { ...GRANTED, granted: false, status: 'denied' };

const CASES = [
  {
    name: 'useCameraPermissions',
    get: methods.cameraGet,
    request: methods.cameraRequest,
  },
  {
    name: 'useMicrophonePermissions',
    get: methods.microphoneGet,
    request: methods.microphoneRequest,
  },
];

let harness = createSvelteHarness('camera-permissions');

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  harness = createSvelteHarness('camera-permissions');
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

const probeApp = (hookName: string): string => `<script lang="ts">
   import { ${hookName} } from './use-camera-permissions.svelte';
   const permissions = ${hookName}();
   Object.assign(globalThis, {
     __capturedStatus: () => permissions.status,
     __requestPermission: () => permissions.requestPermission(),
   });
 </script>`;

function readGlobal(name: string): () => unknown {
  const value: unknown = Reflect.get(globalThis, name);
  if (typeof value !== 'function') throw new Error(`${name} was not set`);
  return () => value();
}

describe.each(CASES)('$name', ({ name, get, request }) => {
  beforeEach(() => {
    get.mockResolvedValue(DENIED);
    request.mockResolvedValue(GRANTED);
  });

  it('resolves the current status on mount by default', async () => {
    await mountApp(`${name}-probe-app`, probeApp(name));

    expect(get).toHaveBeenCalledTimes(1);
    expect(readGlobal('__capturedStatus')()).toEqual(DENIED);
  });

  it('updates the status when requestPermission is called imperatively', async () => {
    await mountApp(`${name}-request-app`, probeApp(name));

    await readGlobal('__requestPermission')();
    await tick();

    expect(request).toHaveBeenCalledTimes(1);
    expect(readGlobal('__capturedStatus')()).toEqual(GRANTED);
  });
});
