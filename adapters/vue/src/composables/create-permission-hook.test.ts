// Every Expo-wrapper package's own permission composable (`useCameraPermissions`,
// `useCalendarPermissions`, `useRemindersPermissions`, ...) binds this factory to its `methods`

import { defineComponent, h, type VNode } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { createPermissionHook } from './create-permission-hook';

type IFakePermission = { granted: boolean };
type IFakeOptions = { writeOnly?: boolean };

const getMethod = vi.fn();
const requestMethod = vi.fn();
const methods = { getMethod, requestMethod };

const GRANTED: IFakePermission = { granted: true };
const DENIED: IFakePermission = { granted: false };

const ROOT_TAG = 90_102;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let usePermission: ReturnType<
  typeof createPermissionHook<IFakePermission, IFakeOptions>
>;
let captured: ReturnType<typeof usePermission> | undefined;
let capturedBehavior: Parameters<typeof usePermission>[0];
let capturedOptions: Parameters<typeof usePermission>[1];

function mountHarness(): void {
  const Probe = defineComponent(() => {
    captured = usePermission(capturedBehavior, capturedOptions);
    return (): VNode => h('text', 'probe');
  });
  mount(ROOT_TAG, { render: (): VNode => h(Probe) });
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  usePermission = createPermissionHook(methods);
  captured = undefined;
  capturedBehavior = undefined;
  capturedOptions = undefined;
  getMethod.mockResolvedValue(DENIED);
  requestMethod.mockResolvedValue(GRANTED);
});

afterEach(() => {
  unmount(ROOT_TAG);
});

describe('createPermissionHook (Positive: resolves, requests, forwards methodOptions)', () => {
  it('resolves the current status on mount by default', async () => {
    mountHarness();
    await tick();

    expect(getMethod).toHaveBeenCalledTimes(1);
    expect(requestMethod).not.toHaveBeenCalled();
    expect(captured?.[0].value).toEqual(DENIED);
  });

  it('requests instead of fetching on mount when request is true', async () => {
    capturedBehavior = { request: true };
    mountHarness();
    await tick();

    expect(requestMethod).toHaveBeenCalledTimes(1);
    expect(getMethod).not.toHaveBeenCalled();
    expect(captured?.[0].value).toEqual(GRANTED);
  });

  it('forwards methodOptions to the dispatched method', async () => {
    capturedOptions = { writeOnly: true };
    mountHarness();
    await tick();

    expect(getMethod).toHaveBeenCalledWith({ writeOnly: true });
  });

  it('updates the status when requestPermission is called imperatively', async () => {
    mountHarness();
    await tick();

    await captured?.[1]();

    expect(requestMethod).toHaveBeenCalledTimes(1);
    expect(captured?.[0].value).toEqual(GRANTED);
  });
});
