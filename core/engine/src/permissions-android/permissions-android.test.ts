// PermissionsAndroid's Android build against RN 0.86: results pass through from the native module,
// a missing module is RN's invariant, deprecated checkPermission / requestPermission warn and
// delegate. The module is faked on `nativeModuleProxy` (bridgeless form).

import { afterEach, describe, expect, it, vi } from 'vitest';

interface INativeCall {
  method: string;
  args: unknown[];
}

let nativeCalls: INativeCall[];

function record(
  method: string,
  ret: unknown,
): (...args: unknown[]) => Promise<unknown> {
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

const NOT_INSTALLED = 'PermissionsAndroid is not installed correctly.';

describe('PermissionsAndroid (no native module) — Negative', () => {
  // why: RN's `invariant(NativePermissionsAndroid, …)` — check and requestMultiple are plain
  // functions, so they throw synchronously; request is async, so the same throw rejects.
  it('check and requestMultiple throw, request rejects, all with RN’s message', async () => {
    globalThis.nativeModuleProxy = undefined;
    vi.resetModules();
    const { PermissionsAndroid, PERMISSIONS } = await import('./index.android');

    expect(() => PermissionsAndroid.check(PERMISSIONS.CAMERA)).toThrow(
      NOT_INSTALLED,
    );
    expect(() =>
      PermissionsAndroid.requestMultiple([PERMISSIONS.CAMERA]),
    ).toThrow(NOT_INSTALLED);
    await expect(
      PermissionsAndroid.request(PERMISSIONS.CAMERA),
    ).rejects.toThrow(NOT_INSTALLED);
  });
});

describe('PermissionsAndroid (native module present)', () => {
  async function loadWithFake(): Promise<typeof import('./index.android')> {
    nativeCalls = [];
    const fakePermissionsAndroid = {
      checkPermission: record('checkPermission', true),
      requestPermission: record('requestPermission', 'granted'),
      shouldShowRequestPermissionRationale: record(
        'shouldShowRequestPermissionRationale',
        false,
      ),
      requestMultiplePermissions: record('requestMultiplePermissions', {
        'android.permission.CAMERA': 'granted',
        'android.permission.ACCESS_FINE_LOCATION': 'denied',
      }),
    };
    globalThis.nativeModuleProxy = {
      PermissionsAndroid: fakePermissionsAndroid,
    };
    vi.resetModules();
    return import('./index.android');
  }

  it('exposes the PERMISSIONS / RESULTS constants on the module and the instance', async () => {
    const { PermissionsAndroid, PERMISSIONS, RESULTS } = await loadWithFake();

    expect(RESULTS.GRANTED).toBe('granted');
    expect(RESULTS.DENIED).toBe('denied');
    expect(RESULTS.NEVER_ASK_AGAIN).toBe('never_ask_again');
    expect(PERMISSIONS.CAMERA).toBe('android.permission.CAMERA');
    expect(PERMISSIONS.ACCESS_FINE_LOCATION).toBe(
      'android.permission.ACCESS_FINE_LOCATION',
    );
    expect(PermissionsAndroid.PERMISSIONS.CAMERA).toBe(
      'android.permission.CAMERA',
    );
    expect(PermissionsAndroid.RESULTS.GRANTED).toBe('granted');
  });

  it('check resolves the native boolean and calls checkPermission once', async () => {
    const { PermissionsAndroid, PERMISSIONS } = await loadWithFake();

    await expect(PermissionsAndroid.check(PERMISSIONS.CAMERA)).resolves.toBe(
      true,
    );
    const calls = callsOf('checkPermission');
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0]).toBe('android.permission.CAMERA');
  });

  it('request resolves the native RESULTS string and calls requestPermission once', async () => {
    const { PermissionsAndroid, PERMISSIONS, RESULTS } = await loadWithFake();

    await expect(PermissionsAndroid.request(PERMISSIONS.CAMERA)).resolves.toBe(
      RESULTS.GRANTED,
    );
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

  // why: RN's public surface has no shouldShowRequestPermissionRationale — only request()
  // consults the native one, internally, for the rationale dialog.
  it('exposes no shouldShowRequestPermissionRationale, as RN does', async () => {
    const { PermissionsAndroid } = await loadWithFake();
    expect('shouldShowRequestPermissionRationale' in PermissionsAndroid).toBe(
      false,
    );
  });

  // why: RN returns the native promise as-is — a status it does not know is the app's to see.
  it('request returns the native status untouched', async () => {
    globalThis.nativeModuleProxy = {
      PermissionsAndroid: {
        requestPermission: record('requestPermission', 'some_future_status'),
      },
    };
    vi.resetModules();
    const { PermissionsAndroid, PERMISSIONS } = await import('./index.android');

    await expect(PermissionsAndroid.request(PERMISSIONS.CAMERA)).resolves.toBe(
      'some_future_status',
    );
  });

  // why: RN keeps the deprecated pair: each warns, checkPermission calls the native check,
  // requestPermission resolves `request(...) === GRANTED`.
  it('keeps the deprecated checkPermission / requestPermission with RN’s warnings', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { PermissionsAndroid, PERMISSIONS } = await loadWithFake();

    await expect(
      PermissionsAndroid.checkPermission(PERMISSIONS.CAMERA),
    ).resolves.toBe(true);
    await expect(
      PermissionsAndroid.requestPermission(PERMISSIONS.CAMERA),
    ).resolves.toBe(true);
    expect(warn.mock.calls).toEqual([
      [
        '"PermissionsAndroid.checkPermission" is deprecated. Use "PermissionsAndroid.check" instead',
      ],
      [
        '"PermissionsAndroid.requestPermission" is deprecated. Use "PermissionsAndroid.request" instead',
      ],
    ]);
    warn.mockRestore();
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
    module: typeof import('./index.android');
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
    const registeredModules: Record<string, unknown> = {
      PermissionsAndroid: fakePermissionsAndroid,
    };
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
    return { module: await import('./index.android'), showAlertCalls };
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
    // RN hands the dialog a COPY (`{...rationale}`), so it is the same content, not the object.
    expect(showAlertCalls[0].rationale).toEqual(rationale);
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

    await expect(
      PermissionsAndroid.request(PERMISSIONS.CAMERA, rationale),
    ).resolves.toBe(RESULTS.GRANTED);
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

    await expect(
      PermissionsAndroid.request(PERMISSIONS.CAMERA, rationale),
    ).resolves.toBe(RESULTS.GRANTED);
    expect(showAlertCalls).toHaveLength(0);
  });
});
