// Solid twin of ../react and ../vue's app-metrics-root tests (ADR 0025)

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/solid';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';
import { AppMetricsRoot } from './app-metrics-root';

const { markFirstRender, reportCaughtError } = vi.hoisted(() => ({
  markFirstRender: vi.fn(),
  reportCaughtError: vi.fn(),
}));

vi.mock('../core', () => ({ markFirstRender }));
vi.mock('../core/report-caught-error', () => ({ reportCaughtError }));

const ROOT_TAG = 909;
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

function Boom(): never {
  throw new Error('render exploded');
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

describe('AppMetricsRoot (Positive: marks first render, gates the error boundary)', () => {
  it('marks the first render and renders children', async () => {
    mount(ROOT_TAG, () => (
      <AppMetricsRoot>
        <text>app</text>
      </AppMetricsRoot>
    ));
    await tick();

    expect(markFirstRender).toHaveBeenCalledTimes(1);
    expect(live.texts(live.appRoot())).toEqual(['app']);
  });

  it('mounts an error boundary rendering the fallback when errorBoundaryFallback is given', async () => {
    mount(ROOT_TAG, () => (
      <AppMetricsRoot errorBoundaryFallback={<text>crashed</text>}>
        <Boom />
      </AppMetricsRoot>
    ));
    await tick();

    expect(live.texts(live.appRoot())).toEqual(['crashed']);
    expect(reportCaughtError).toHaveBeenCalledTimes(1);
  });

  it('mounts a capture-only boundary when errorBoundaryFallback is explicitly null', async () => {
    mount(ROOT_TAG, () => (
      <AppMetricsRoot errorBoundaryFallback={null}>
        <Boom />
      </AppMetricsRoot>
    ));
    await tick();

    expect(reportCaughtError).toHaveBeenCalledTimes(1);
  });

  it('mounts no boundary without a fallback, leaving the throw to reach the native channel', async () => {
    // `mount` rethrows an uncaught error rather than swallowing it, this adapter's own tested
    // contract - so no boundary here means no boundary anywhere, off `reportCaughtError` entirely
    const nativeReportError = vi.fn();
    Object.assign(globalThis, {
      ErrorUtils: { reportError: nativeReportError },
    });

    expect(() =>
      mount(ROOT_TAG, () => (
        <AppMetricsRoot>
          <Boom />
        </AppMetricsRoot>
      )),
    ).toThrow('render exploded');
    await tick();

    expect(reportCaughtError).not.toHaveBeenCalled();
    expect(nativeReportError).toHaveBeenCalledTimes(1);
  });
});
