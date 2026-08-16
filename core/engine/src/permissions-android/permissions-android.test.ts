// Co-located unit test for the PermissionsAndroid module: it resolves the native
// module lazily and routes check / request / requestMultiple / shouldShowRequestPermission-
// Rationale to it, narrowing each native return at the trust boundary, and exposes the frozen
// PERMISSIONS / RESULTS maps. It MUST degrade gracefully (Android-only, symbiote is
// iOS-first): with no module, check resolves false and request resolves RESULTS.DENIED
// without throwing. The native module is faked on `nativeModuleProxy` (bridgeless host-object
// form).

import { afterEach, describe, expect, it, vi } from 'vitest';

interface INativeCall {
  method: string;
  args: unknown[];
}

let nativeCalls: INativeCall[];

function record(method: string, ret: unknown): (...args: unknown[]) => Promise<unknown> {
  return (...args: unknown[]) => {
    nativeCalls.push({ method, args });
    return Promise.resolve(ret);
  };
}

function callsOf(method: string): INativeCall[] {
  return nativeCalls.filter(call => call.method === method);
}

// request() awaits shouldShowRequestPermissionRationale before ever reaching
// dialogModule.showAlert -- one microtask tick must elapse before showAlertCalls
// reflects that call.
function flushMicrotasks(): Promise<void> {
  return Promise.resolve();
}

afterEach(() => {
  globalThis.nativeModuleProxy = undefined;
});

describe('PermissionsAndroid (no native module)', () => {
  it('degrades gracefully: check resolves false and request resolves DENIED, no throw', async () => {
    globalThis.nativeModuleProxy = undefined;
    vi.resetModules();
    const { PermissionsAndroid, PERMISSIONS, RESULTS } = await import('./index');

    await expect(PermissionsAndroid.check(PERMISSIONS.CAMERA)).resolves.toBe(false);
    await expect(PermissionsAndroid.request(PERMISSIONS.CAMERA)).resolves.toBe(RESULTS.DENIED);
  });

  // why: requestMultiple and shouldShowRequestPermissionRationale have the SAME
  // Android-only degrade obligation as check/request -- each must resolve its own
  // documented safe default, not just the two methods exercised above.
  it('requestMultiple resolves {} and shouldShowRequestPermissionRationale resolves false', async () => {
    globalThis.nativeModuleProxy = undefined;
    vi.resetModules();
    const { PermissionsAndroid, PERMISSIONS } = await import('./index');

    await expect(PermissionsAndroid.requestMultiple([PERMISSIONS.CAMERA])).resolves.toEqual({});
    await expect(
      PermissionsAndroid.shouldShowRequestPermissionRationale(PERMISSIONS.CAMERA),
    ).resolves.toBe(false);
  });
});

describe('PermissionsAndroid (native module present)', () => {
  async function loadWithFake(): Promise<typeof import('./index')> {
    nativeCalls = [];
    const fakePermissionsAndroid = {
      checkPermission: record('checkPermission', true),
      requestPermission: record('requestPermission', 'granted'),
      shouldShowRequestPermissionRationale: record('shouldShowRequestPermissionRationale', false),
      requestMultiplePermissions: record('requestMultiplePermissions', {
        'android.permission.CAMERA': 'granted',
        'android.permission.ACCESS_FINE_LOCATION': 'denied',
      }),
    };
    globalThis.nativeModuleProxy = { PermissionsAndroid: fakePermissionsAndroid };
    vi.resetModules();
    return import('./index');
  }

  it('exposes the PERMISSIONS / RESULTS constants on the module and the instance', async () => {
    const { PermissionsAndroid, PERMISSIONS, RESULTS } = await loadWithFake();

    expect(RESULTS.GRANTED).toBe('granted');
    expect(RESULTS.DENIED).toBe('denied');
    expect(RESULTS.NEVER_ASK_AGAIN).toBe('never_ask_again');
    expect(PERMISSIONS.CAMERA).toBe('android.permission.CAMERA');
    expect(PERMISSIONS.ACCESS_FINE_LOCATION).toBe('android.permission.ACCESS_FINE_LOCATION');
    expect(PermissionsAndroid.PERMISSIONS.CAMERA).toBe('android.permission.CAMERA');
    expect(PermissionsAndroid.RESULTS.GRANTED).toBe('granted');
  });

  it('check resolves the native boolean and calls checkPermission once', async () => {
    const { PermissionsAndroid, PERMISSIONS } = await loadWithFake();

    await expect(PermissionsAndroid.check(PERMISSIONS.CAMERA)).resolves.toBe(true);
    const calls = callsOf('checkPermission');
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0]).toBe('android.permission.CAMERA');
  });

  it('request resolves the native RESULTS string and calls requestPermission once', async () => {
    const { PermissionsAndroid, PERMISSIONS, RESULTS } = await loadWithFake();

    await expect(PermissionsAndroid.request(PERMISSIONS.CAMERA)).resolves.toBe(RESULTS.GRANTED);
    const calls = callsOf('requestPermission');
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0]).toBe('android.permission.CAMERA');
  });

  it('requestMultiple resolves the per-permission map', async () => {
    const { PermissionsAndroid, PERMISSIONS, RESULTS } = await loadWithFake();

    const map = await PermissionsAndroid.requestMultiple([
      PERMISSIONS.CAMERA,
      PERMISSIONS.ACCESS_FINE_LOCATION,
    ]);
    expect(map[PERMISSIONS.CAMERA]).toBe(RESULTS.GRANTED);
    expect(map[PERMISSIONS.ACCESS_FINE_LOCATION]).toBe(RESULTS.DENIED);
  });

  it('shouldShowRequestPermissionRationale resolves the native boolean', async () => {
    const { PermissionsAndroid, PERMISSIONS } = await loadWithFake();

    await expect(
      PermissionsAndroid.shouldShowRequestPermissionRationale(PERMISSIONS.CAMERA),
    ).resolves.toBe(false);
    expect(callsOf('shouldShowRequestPermissionRationale')).toHaveLength(1);
  });

  // why: toPermissionStatus is the trust-boundary guard between an arbitrary
  // native string and the closed RESULTS union -- an unrecognized value (a future
  // Android API level's new status, or a broken native binding) must fail closed
  // to DENIED, never surface as a bogus status the app doesn't know how to handle.
  it('check falls back to false for a non-boolean native return', async () => {
    globalThis.nativeModuleProxy = {
      PermissionsAndroid: {
        checkPermission: record('checkPermission', 'not-a-boolean'),
        requestPermission: record('requestPermission', null),
        shouldShowRequestPermissionRationale: record('shouldShowRequestPermissionRationale', null),
        requestMultiplePermissions: record('requestMultiplePermissions', null),
      },
    };
    vi.resetModules();
    const { PermissionsAndroid, PERMISSIONS } = await import('./index');

    await expect(PermissionsAndroid.check(PERMISSIONS.CAMERA)).resolves.toBe(false);
  });

  it('request falls back to DENIED for an unrecognized native status string', async () => {
    globalThis.nativeModuleProxy = {
      PermissionsAndroid: {
        checkPermission: record('checkPermission', true),
        requestPermission: record('requestPermission', 'some_future_status'),
        shouldShowRequestPermissionRationale: record('shouldShowRequestPermissionRationale', false),
        requestMultiplePermissions: record('requestMultiplePermissions', {}),
      },
    };
    vi.resetModules();
    const { PermissionsAndroid, PERMISSIONS, RESULTS } = await import('./index');

    await expect(PermissionsAndroid.request(PERMISSIONS.CAMERA)).resolves.toBe(RESULTS.DENIED);
  });

  it('requestMultiple resolves an empty map for a non-object native return', async () => {
    globalThis.nativeModuleProxy = {
      PermissionsAndroid: {
        checkPermission: record('checkPermission', true),
        requestPermission: record('requestPermission', 'granted'),
        shouldShowRequestPermissionRationale: record('shouldShowRequestPermissionRationale', false),
        requestMultiplePermissions: record('requestMultiplePermissions', null),
      },
    };
    vi.resetModules();
    const { PermissionsAndroid, PERMISSIONS } = await import('./index');

    await expect(PermissionsAndroid.requestMultiple([PERMISSIONS.CAMERA])).resolves.toEqual({});
  });
});

describe('PermissionsAndroid.request with a rationale', () => {
  interface IShowAlertCall {
    rationale: unknown;
    onError: () => void;
    onAction: () => void;
  }

  const rationale = { title: 'Camera access', message: 'We need your camera.' };

  async function loadWithDialog(options: {
    shouldShow: boolean;
    dialogPresent: boolean;
    requestPermissionResult?: unknown;
    requestPermissionRejects?: boolean;
  }): Promise<{
    module: typeof import('./index');
    showAlertCalls: IShowAlertCall[];
  }> {
    nativeCalls = [];
    const showAlertCalls: IShowAlertCall[] = [];
    const fakePermissionsAndroid = {
      checkPermission: record('checkPermission', true),
      requestPermission: (...args: unknown[]): Promise<unknown> => {
        nativeCalls.push({ method: 'requestPermission', args });
        if (options.requestPermissionRejects) {
          return Promise.reject(new Error('native requestPermission failed'));
        }
        return Promise.resolve(options.requestPermissionResult ?? 'granted');
      },
      shouldShowRequestPermissionRationale: record(
        'shouldShowRequestPermissionRationale',
        options.shouldShow,
      ),
      requestMultiplePermissions: record('requestMultiplePermissions', {}),
    };
    const registeredModules: Record<string, unknown> = { PermissionsAndroid: fakePermissionsAndroid };
    if (options.dialogPresent) {
      registeredModules.DialogManagerAndroid = {
        showAlert: (
          alertRationale: unknown,
          onError: () => void,
          onAction: () => void,
        ): void => {
          showAlertCalls.push({ rationale: alertRationale, onError, onAction });
        },
      };
    }
    globalThis.nativeModuleProxy = registeredModules;
    vi.resetModules();
    return { module: await import('./index'), showAlertCalls };
  }

  // why: this is the whole point of passing a rationale -- when the OS recommends
  // showing one AND DialogManagerAndroid is linked, the dialog must appear BEFORE
  // the native permission prompt, and only proceed to requestPermission once the
  // user acts on it.
  it('shows the rationale dialog and requests the permission only after the user acts on it', async () => {
    const { module, showAlertCalls } = await loadWithDialog({
      shouldShow: true,
      dialogPresent: true,
    });
    const { PermissionsAndroid, PERMISSIONS, RESULTS } = module;

    const pending = PermissionsAndroid.request(PERMISSIONS.CAMERA, rationale);
    await flushMicrotasks();
    expect(showAlertCalls).toHaveLength(1);
    expect(showAlertCalls[0].rationale).toBe(rationale);
    // requestPermission must NOT have been called yet -- only after onAction.
    expect(callsOf('requestPermission')).toHaveLength(0);

    showAlertCalls[0].onAction();
    await expect(pending).resolves.toBe(RESULTS.GRANTED);
    expect(callsOf('requestPermission')).toHaveLength(1);
  });

  // why: the dialog's onError path (native failed to even show the alert) must
  // reject the whole request with a real error, not hang or resolve as if denied.
  it('rejects when the dialog reports an error showing the rationale', async () => {
    const { module, showAlertCalls } = await loadWithDialog({
      shouldShow: true,
      dialogPresent: true,
    });
    const { PermissionsAndroid, PERMISSIONS } = module;

    const pending = PermissionsAndroid.request(PERMISSIONS.CAMERA, rationale);
    await flushMicrotasks();
    showAlertCalls[0].onError();
    await expect(pending).rejects.toThrow('Error showing rationale');
  });

  // why: a rejected native requestPermission (after the user acted on the dialog)
  // must propagate as a rejection of the whole request, not be swallowed.
  it('propagates a rejected requestPermission after the dialog action', async () => {
    const { module, showAlertCalls } = await loadWithDialog({
      shouldShow: true,
      dialogPresent: true,
      requestPermissionRejects: true,
    });
    const { PermissionsAndroid, PERMISSIONS } = module;

    const pending = PermissionsAndroid.request(PERMISSIONS.CAMERA, rationale);
    await flushMicrotasks();
    showAlertCalls[0].onAction();
    await expect(pending).rejects.toThrow('native requestPermission failed');
  });

  // why: when the OS does NOT recommend showing a rationale, the dialog must be
  // skipped entirely and the request proceeds straight to native -- showing an
  // unnecessary dialog would be a UX regression, not just a missed optimization.
  it('skips the dialog and requests directly when shouldShow is false', async () => {
    const { module, showAlertCalls } = await loadWithDialog({
      shouldShow: false,
      dialogPresent: true,
    });
    const { PermissionsAndroid, PERMISSIONS, RESULTS } = module;

    await expect(PermissionsAndroid.request(PERMISSIONS.CAMERA, rationale)).resolves.toBe(
      RESULTS.GRANTED,
    );
    expect(showAlertCalls).toHaveLength(0);
  });

  // why: DialogManagerAndroid is a SEPARATE, optional native module -- its absence
  // must not block the permission request itself, only skip the nicety of showing
  // a rationale first.
  it('skips the dialog and requests directly when DialogManagerAndroid is not linked', async () => {
    const { module, showAlertCalls } = await loadWithDialog({
      shouldShow: true,
      dialogPresent: false,
    });
    const { PermissionsAndroid, PERMISSIONS, RESULTS } = module;

    await expect(PermissionsAndroid.request(PERMISSIONS.CAMERA, rationale)).resolves.toBe(
      RESULTS.GRANTED,
    );
    expect(showAlertCalls).toHaveLength(0);
  });
});
