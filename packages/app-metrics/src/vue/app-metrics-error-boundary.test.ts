// Vue twin of ../react/app-metrics-error-boundary.test.tsx (ADR 0025). `onErrorCaptured` only
// walks a DESCENDANT `defineComponent`'s own `.parent` chain (adapters/vue's own
// render-error-reporting.test.ts), so every throwing fixture here is a real component

import { defineComponent, h, type VNode } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';
import { AppMetricsErrorBoundary } from './app-metrics-error-boundary';

const { reportCaughtError } = vi.hoisted(() => ({
  reportCaughtError: vi.fn(),
}));

vi.mock('../core/report-caught-error', () => ({ reportCaughtError }));

const ROOT_TAG = 906;
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

const Boom = defineComponent({
  name: 'Boom',
  render(): never {
    throw new Error('render exploded');
  },
});

const ThrowNull = defineComponent({
  name: 'ThrowNull',
  render(): never {
    throw null;
  },
});

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
let consoleError: ReturnType<typeof vi.spyOn>;
let consoleWarn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  unmount(ROOT_TAG);
  consoleError.mockRestore();
  consoleWarn.mockRestore();
});

describe('AppMetricsErrorBoundary (Positive: catches, reports, renders a fallback)', () => {
  it('renders the default slot unchanged when nothing throws', async () => {
    mount(ROOT_TAG, {
      render: (): VNode =>
        h(AppMetricsErrorBoundary, { fallback: null }, () =>
          h('text', 'healthy'),
        ),
    });
    await tick();

    expect(live.texts(live.appRoot())).toEqual(['healthy']);
    expect(reportCaughtError).not.toHaveBeenCalled();
  });

  it('renders the fallback vnode in place of the failed subtree', async () => {
    mount(ROOT_TAG, {
      render: (): VNode =>
        h(
          AppMetricsErrorBoundary,
          { fallback: h('text', 'something broke') },
          () => h(Boom),
        ),
    });
    await tick();

    expect(live.texts(live.appRoot())).toEqual(['something broke']);
  });

  it('catches a falsy non-Error throw without looping', async () => {
    mount(ROOT_TAG, {
      render: (): VNode =>
        h(AppMetricsErrorBoundary, { fallback: h('text', 'caught') }, () =>
          h(ThrowNull),
        ),
    });
    await tick();

    expect(live.texts(live.appRoot())).toEqual(['caught']);
    expect(reportCaughtError).toHaveBeenCalledTimes(1);
  });

  it('reports the caught error with no component stack', async () => {
    mount(ROOT_TAG, {
      render: (): VNode =>
        h(AppMetricsErrorBoundary, { fallback: null }, () => h(Boom)),
    });
    await tick();

    const [error, componentStack] = reportCaughtError.mock.calls[0] as [
      Error,
      string | undefined,
    ];
    expect(error.message).toBe('render exploded');
    expect(componentStack).toBeUndefined();
  });

  it('keeps a caught error off this engine own uncaught-error channel', async () => {
    const nativeReportError = vi.fn();
    Object.assign(globalThis, {
      ErrorUtils: { reportError: nativeReportError },
    });

    mount(ROOT_TAG, {
      render: (): VNode =>
        h(AppMetricsErrorBoundary, { fallback: null }, () => h(Boom)),
    });
    await tick();

    expect(nativeReportError).not.toHaveBeenCalled();
    Reflect.deleteProperty(globalThis, 'ErrorUtils');
  });

  it('passes the error to a render-function fallback, and re-catches after a reset', async () => {
    let capturedReset: (() => void) | undefined;
    mount(ROOT_TAG, {
      render: (): VNode =>
        h(
          AppMetricsErrorBoundary,
          {
            fallback: ({ error, resetError }) => {
              capturedReset = resetError;
              return h('text', `caught: ${(error as Error).message}`);
            },
          },
          () => h(Boom),
        ),
    });
    await tick();

    expect(live.texts(live.appRoot())).toEqual(['caught: render exploded']);

    // The child keeps throwing, so a reset must re-catch rather than escape or loop
    capturedReset?.();
    await tick();

    expect(live.texts(live.appRoot())).toEqual(['caught: render exploded']);
    expect(reportCaughtError).toHaveBeenCalledTimes(2);
  });
});
