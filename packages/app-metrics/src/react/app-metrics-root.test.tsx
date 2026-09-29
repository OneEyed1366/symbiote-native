// Co-located React-driven test (ADR 0025), adapted from upstream's own
// AppMetricsRoot.test.native.tsx (@testing-library/react-native + Jest) onto this repo's own
// harness (mount/unmount + a real Fabric recording, not RN's own renderer)

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
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

const ROOT_TAG = 904;

function Boom(): never {
  throw new Error('render exploded');
}

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
let consoleWarn: ReturnType<typeof vi.spyOn>;
let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  unmount(ROOT_TAG);
  consoleWarn.mockRestore();
  consoleError.mockRestore();
});

describe('AppMetricsRoot (Positive: marks first render, gates the error boundary)', () => {
  it('marks the first render and renders its children', () => {
    mount(
      ROOT_TAG,
      <AppMetricsRoot>
        <text>app</text>
      </AppMetricsRoot>,
    );

    expect(markFirstRender).toHaveBeenCalledTimes(1);
    expect(live.texts(live.appRoot())).toEqual(['app']);
  });

  it('mounts an error boundary rendering the fallback when errorBoundaryFallback is given', () => {
    mount(
      ROOT_TAG,
      <AppMetricsRoot errorBoundaryFallback={<text>crashed</text>}>
        <Boom />
      </AppMetricsRoot>,
    );

    expect(live.texts(live.appRoot())).toEqual(['crashed']);
    expect(reportCaughtError).toHaveBeenCalledTimes(1);
  });

  it('mounts a capture-only boundary when errorBoundaryFallback is explicitly null', () => {
    expect(() =>
      mount(
        ROOT_TAG,
        <AppMetricsRoot errorBoundaryFallback={null}>
          <Boom />
        </AppMetricsRoot>,
      ),
    ).not.toThrow();
    expect(reportCaughtError).toHaveBeenCalledTimes(1);
  });

  it('mounts no boundary without a fallback, leaving reportCaughtError uncalled', () => {
    // This engine routes an uncaught render error to `reportUncaughtError` rather than
    // re-throwing out of mount (adapters/react's own render-error-reporting.test.tsx)
    mount(
      ROOT_TAG,
      <AppMetricsRoot>
        <Boom />
      </AppMetricsRoot>,
    );

    expect(reportCaughtError).not.toHaveBeenCalled();
  });
});
