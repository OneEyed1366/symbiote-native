// Co-located React-driven test (ADR 0025), adapted from upstream's own
// AppMetricsErrorBoundary.test.native.tsx onto this repo's own harness (mount/unmount + a real
// Fabric recording). `reportCaughtError`'s own contract is proven in report-caught-error.test.ts

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';
import { AppMetricsErrorBoundary } from './app-metrics-error-boundary';

const { reportCaughtError } = vi.hoisted(() => ({
  reportCaughtError: vi.fn(),
}));

vi.mock('../core/report-caught-error', () => ({ reportCaughtError }));

const ROOT_TAG = 903;

function Boom(): never {
  throw new Error('render exploded');
}

function ThrowNull(): never {
  // A falsy throw value the boundary must not mistake for a healthy state

  throw null;
}

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
let consoleWarn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  unmount(ROOT_TAG);
  consoleWarn.mockRestore();
});

describe('AppMetricsErrorBoundary (Positive: catches, reports, renders a fallback)', () => {
  it('renders children unchanged when nothing throws', () => {
    mount(
      ROOT_TAG,
      <AppMetricsErrorBoundary fallback={null}>
        <text>healthy</text>
      </AppMetricsErrorBoundary>,
    );

    expect(live.texts(live.appRoot())).toEqual(['healthy']);
    expect(reportCaughtError).not.toHaveBeenCalled();
  });

  it('renders the fallback element in place of the failed subtree', () => {
    mount(
      ROOT_TAG,
      <AppMetricsErrorBoundary fallback={<text>something broke</text>}>
        <Boom />
      </AppMetricsErrorBoundary>,
    );

    expect(live.texts(live.appRoot())).toEqual(['something broke']);
  });

  it('renders nothing when the fallback is explicitly null', () => {
    mount(
      ROOT_TAG,
      <AppMetricsErrorBoundary fallback={null}>
        <Boom />
      </AppMetricsErrorBoundary>,
    );

    expect(live.nodeOf(live.appRoot()).children).toHaveLength(0);
  });

  it('catches a falsy non-Error throw without looping', () => {
    mount(
      ROOT_TAG,
      <AppMetricsErrorBoundary fallback={<text>caught</text>}>
        <ThrowNull />
      </AppMetricsErrorBoundary>,
    );

    expect(live.texts(live.appRoot())).toEqual(['caught']);
    expect(reportCaughtError).toHaveBeenCalledTimes(1);
  });

  it('reports the caught error with a trimmed component stack', () => {
    mount(
      ROOT_TAG,
      <AppMetricsErrorBoundary fallback={null}>
        <view>
          <view>
            <Boom />
          </view>
        </view>
      </AppMetricsErrorBoundary>,
    );

    const [error, componentStack] = reportCaughtError.mock.calls[0] as [
      Error,
      string,
    ];
    expect(error.message).toBe('render exploded');
    expect(componentStack).toEqual(expect.stringContaining('Boom'));
    expect(componentStack).toBe(componentStack.trim());
  });

  it('passes the error to a render-function fallback, and re-catches after a reset', async () => {
    let capturedReset: (() => void) | undefined;
    mount(
      ROOT_TAG,
      <AppMetricsErrorBoundary
        fallback={({ error, resetError }) => {
          capturedReset = resetError;
          return <text>{`caught: ${(error as Error).message}`}</text>;
        }}
      >
        <Boom />
      </AppMetricsErrorBoundary>,
    );

    expect(live.texts(live.appRoot())).toEqual(['caught: render exploded']);

    // The child keeps throwing, so a reset must re-catch rather than escape or loop. Called
    // directly rather than through the engine's event dispatcher, so the resulting re-render
    // lands on a later microtask - same caveat as use-clipboard.test.tsx
    capturedReset?.();

    await vi.waitFor(() => expect(reportCaughtError).toHaveBeenCalledTimes(2));
    expect(live.texts(live.appRoot())).toEqual(['caught: render exploded']);
  });
});
