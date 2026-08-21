// A throw during render used to go nowhere useful on Vue. The adapter never set
// `app.config.errorHandler`, so Vue fell through to its own `logError`: a re-throw out of
// `app.mount()` in a dev bundle (aborting the surface bring-up), a bare `console.error` with no
// origin and no `global.ErrorUtils` in a release one. React's adapter had already been wired to
// the engine's reportUncaughtError; this is the same channel for Vue.
//
// Asserted through a real mount rather than by calling the handler directly: the claim is that
// the app created inside mount() is WIRED to it, which is exactly what was missing.

import {
  defineComponent,
  h,
  onErrorCaptured,
  ref,
  type VNode,
} from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { View, mount, setAppConfigurator, unmount } from '@symbiote-native/vue';
import { installFabric } from '@symbiote-native/test-utils';

const ROOT_TAG = 219;
const BOOM = 'render exploded';

const Exploding = defineComponent({
  name: 'Exploding',
  render(): VNode {
    throw new Error(BOOM);
  },
});

// Vue's error boundary: `onErrorCaptured` returning false stops propagation, which is also what
// keeps the error off the redbox — see the asymmetry note in render.ts.
const Boundary = defineComponent({
  name: 'Boundary',
  setup(_props, { slots }) {
    const hasFailed = ref(false);
    onErrorCaptured(() => {
      hasFailed.value = true;
      return false;
    });
    return (): unknown => (hasFailed.value ? h(View) : slots.default?.());
  },
});

// The other half of the fork: a hook that renders a fallback but returns nothing lets the error
// keep propagating, which is Vue saying it is still unhandled — so it must still reach the host.
const LeakyBoundary = defineComponent({
  name: 'LeakyBoundary',
  setup(_props, { slots }) {
    const hasFailed = ref(false);
    onErrorCaptured(() => {
      hasFailed.value = true;
    });
    return (): unknown => (hasFailed.value ? h(View) : slots.default?.());
  },
});

const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let consoleError: ReturnType<typeof vi.spyOn>;
let consoleWarn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fabric.reset();
  // Vue warns on its own around a thrown render, so both console channels are silenced and the
  // assertions look for OUR line rather than counting calls.
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  unmount(ROOT_TAG);
  setAppConfigurator(undefined);
  consoleError.mockRestore();
  consoleWarn.mockRestore();
  Reflect.deleteProperty(globalThis, 'ErrorUtils');
});

function loggedMessages(): string[] {
  return consoleError.mock.calls.map(call =>
    call.map(arg => String(arg)).join(' '),
  );
}

describe('Negative — a component throws during render', () => {
  it('reports the error instead of blanking the screen in silence', () => {
    mount(ROOT_TAG, Exploding);

    expect(loggedMessages().some(message => message.includes(BOOM))).toBe(true);
  });

  it('names the render seam, so the line is not an anonymous stack', () => {
    mount(ROOT_TAG, Exploding);

    expect(
      loggedMessages().some(message => message.includes('vue render')),
    ).toBe(true);
  });

  it('routes to the host reporter when one is installed, as on a native host', () => {
    const reportError = vi.fn();
    Object.assign(globalThis, { ErrorUtils: { reportError } });

    mount(ROOT_TAG, Exploding);

    const reported: unknown = reportError.mock.calls[0]?.[0];
    expect(reported).toMatchObject({ message: BOOM });
  });

  it('carries the component stack the redbox renders', () => {
    const reportError = vi.fn();
    Object.assign(globalThis, { ErrorUtils: { reportError } });

    mount(ROOT_TAG, Exploding);

    expect(reportError.mock.calls[0]?.[0]).toMatchObject({
      isComponentError: true,
      componentStack: expect.stringContaining('in Exploding'),
    });
  });

  it('keeps an error a boundary captured OFF the native redbox', () => {
    // Vue makes this split itself: handleError walks the onErrorCaptured chain before consulting
    // config.errorHandler, and a hook returning false returns early. Writing a boundary is the
    // developer saying "I am handling this"; a full-screen redbox over the fallback the app just
    // rendered contradicts that. The UNCAUGHT cases above still report.
    const reportError = vi.fn();
    Object.assign(globalThis, { ErrorUtils: { reportError } });

    mount(ROOT_TAG, {
      render: (): VNode => h(Boundary, null, { default: () => h(Exploding) }),
    });

    expect(reportError).not.toHaveBeenCalled();
  });

  it('still reports when a boundary declines to stop the propagation', () => {
    // The fork has two sides, and only `return false` claims the error. Without this case the
    // one above would pass just as well for an adapter that silenced everything a boundary saw.
    const reportError = vi.fn();
    Object.assign(globalThis, { ErrorUtils: { reportError } });

    mount(ROOT_TAG, {
      render: (): VNode =>
        h(LeakyBoundary, null, { default: () => h(Exploding) }),
    });

    expect(reportError.mock.calls[0]?.[0]).toMatchObject({ message: BOOM });
  });

  it('lets the boundary paint its fallback all the same', async () => {
    mount(ROOT_TAG, {
      render: (): VNode => h(Boundary, null, { default: () => h(Exploding) }),
    });
    // Vue commits on a microtask (renderer.ts's requestCommit), and the fallback is a second
    // render pass after the captured error flips the boundary's state.
    await tick();

    expect(fabric.appRoot().children).toHaveLength(1);
  });
});

describe('setAppConfigurator', () => {
  it('hands the App over before mount, so an app can replace the handler', () => {
    const reportError = vi.fn();
    Object.assign(globalThis, { ErrorUtils: { reportError } });
    const ownHandler = vi.fn();
    setAppConfigurator(app => {
      app.config.errorHandler = ownHandler;
    });

    mount(ROOT_TAG, Exploding);

    expect(ownHandler).toHaveBeenCalledOnce();
    expect(reportError).not.toHaveBeenCalled();
  });
});
