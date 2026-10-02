// Solid twin of ../react and ../vue's app-metrics-error-boundary tests (ADR 0025), real compiled
// JSX mirroring `adapters/solid/src/render-error-reporting.test.tsx`'s mount/live-tree harness

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/solid';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';
import { AppMetricsErrorBoundary } from './app-metrics-error-boundary';

const { reportCaughtError } = vi.hoisted(() => ({
  reportCaughtError: vi.fn(),
}));

vi.mock('../core/report-caught-error', () => ({ reportCaughtError }));

const ROOT_TAG = 908;
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

function Boom(): never {
  throw new Error('render exploded');
}

function ThrowNull(): never {
  throw null;
}

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  unmount(ROOT_TAG);
  consoleError.mockRestore();
  Reflect.deleteProperty(globalThis, 'ErrorUtils');
});

describe('AppMetricsErrorBoundary (Positive: catches, reports, renders a fallback)', () => {
  it('renders children unchanged when nothing throws', async () => {
    mount(ROOT_TAG, () => (
      <AppMetricsErrorBoundary fallback={<text>healthy fallback</text>}>
        <text>healthy</text>
      </AppMetricsErrorBoundary>
    ));
    await tick();

    expect(live.texts(live.appRoot())).toEqual(['healthy']);
    expect(reportCaughtError).not.toHaveBeenCalled();
  });

  it('renders the fallback element in place of the failed subtree', async () => {
    mount(ROOT_TAG, () => (
      <AppMetricsErrorBoundary fallback={<text>something broke</text>}>
        <Boom />
      </AppMetricsErrorBoundary>
    ));
    await tick();

    expect(live.texts(live.appRoot())).toEqual(['something broke']);
  });

  it('catches a falsy non-Error throw without looping', async () => {
    mount(ROOT_TAG, () => (
      <AppMetricsErrorBoundary fallback={<text>caught</text>}>
        <ThrowNull />
      </AppMetricsErrorBoundary>
    ));
    await tick();

    expect(live.texts(live.appRoot())).toEqual(['caught']);
    expect(reportCaughtError).toHaveBeenCalledTimes(1);
  });

  it('reports the caught error with no second argument', async () => {
    mount(ROOT_TAG, () => (
      <AppMetricsErrorBoundary fallback={<text>caught</text>}>
        <Boom />
      </AppMetricsErrorBoundary>
    ));
    await tick();

    expect(reportCaughtError).toHaveBeenCalledTimes(1);
    const [error, componentStack] = reportCaughtError.mock.calls[0] as [
      Error,
      unknown,
    ];
    expect(error.message).toBe('render exploded');
    expect(componentStack).toBeUndefined();
  });

  it('keeps a caught error off this engine own uncaught-error channel', async () => {
    const nativeReportError = vi.fn();
    Object.assign(globalThis, {
      ErrorUtils: { reportError: nativeReportError },
    });

    mount(ROOT_TAG, () => (
      <AppMetricsErrorBoundary fallback={<text>caught</text>}>
        <Boom />
      </AppMetricsErrorBoundary>
    ));
    await tick();

    expect(nativeReportError).not.toHaveBeenCalled();
  });

  it('passes the error to a render-function fallback, and re-catches after a reset', async () => {
    let capturedReset: (() => void) | undefined;

    mount(ROOT_TAG, () => (
      <AppMetricsErrorBoundary
        fallback={({ error, resetError }) => {
          capturedReset = resetError;
          return <text>{`caught: ${(error as Error).message}`}</text>;
        }}
      >
        <Boom />
      </AppMetricsErrorBoundary>
    ));
    await tick();

    expect(live.texts(live.appRoot())).toEqual(['caught: render exploded']);

    // The child keeps throwing, a reset re-catches instead of escaping or looping
    capturedReset?.();
    await tick();

    expect(live.texts(live.appRoot())).toEqual(['caught: render exploded']);
    expect(reportCaughtError).toHaveBeenCalledTimes(2);
  });
});
