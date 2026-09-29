// Vue twin of ../react/app-metrics-root.test.tsx (ADR 0025)

import { defineComponent, h, type VNode } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
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

const ROOT_TAG = 907;
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

const Boom = defineComponent({
  name: 'Boom',
  render(): never {
    throw new Error('render exploded');
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
  Reflect.deleteProperty(globalThis, 'ErrorUtils');
});

describe('AppMetricsRoot (Positive: marks first render, gates the error boundary)', () => {
  it('marks the first render and renders the default slot', async () => {
    mount(ROOT_TAG, {
      render: (): VNode => h(AppMetricsRoot, null, () => h('text', 'app')),
    });
    await tick();

    expect(markFirstRender).toHaveBeenCalledTimes(1);
    expect(live.texts(live.appRoot())).toEqual(['app']);
  });

  it('mounts an error boundary rendering the fallback when errorBoundaryFallback is given', async () => {
    mount(ROOT_TAG, {
      render: (): VNode =>
        h(AppMetricsRoot, { errorBoundaryFallback: h('text', 'crashed') }, () =>
          h(Boom),
        ),
    });
    await tick();

    expect(live.texts(live.appRoot())).toEqual(['crashed']);
    expect(reportCaughtError).toHaveBeenCalledTimes(1);
  });

  it('mounts a capture-only boundary when errorBoundaryFallback is explicitly null', async () => {
    mount(ROOT_TAG, {
      render: (): VNode =>
        h(AppMetricsRoot, { errorBoundaryFallback: null }, () => h(Boom)),
    });
    await tick();

    expect(reportCaughtError).toHaveBeenCalledTimes(1);
  });

  it('mounts no boundary without a fallback, leaving reportCaughtError uncalled', async () => {
    const nativeReportError = vi.fn();
    Object.assign(globalThis, {
      ErrorUtils: { reportError: nativeReportError },
    });

    mount(ROOT_TAG, {
      render: (): VNode => h(AppMetricsRoot, null, () => h(Boom)),
    });
    await tick();

    expect(reportCaughtError).not.toHaveBeenCalled();
  });
});
