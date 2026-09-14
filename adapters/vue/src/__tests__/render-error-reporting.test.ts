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
import { mount, setAppConfigurator, unmount } from '@symbiote-native/vue';
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
    return (): unknown => (hasFailed.value ? h('view') : slots.default?.());
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
    return (): unknown => (hasFailed.value ? h('view') : slots.default?.());
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

// Regression for a device-reported redbox (2026-09-11): a throw from a REAL press dispatch
// reached Hermes's own top-level handler directly, bypassing both `onErrorCaptured` and
// `app.config.errorHandler` — the reported call stack traced through the actual dispatch chain
// (pressable.ts's dispatch -> bubble -> runWrapped), which carries no try/catch anywhere: Vue's
// default `wrapDispatch` is a bare pass-through, so a throw from the app's own listener escaped
// every framework error boundary and painted a native redbox with no Vue componentStack framing.
//
// Fixed in renderer/index.ts: patchProp wraps any `on*`-named function prop with Vue's own
// `callWithErrorHandling`, captured at `patchProp` time (the one point still holding a live
// `getCurrentInstance()`), so a thrown listener routes through the same pipeline a throw from
// render/setup already used.
//
// Driven through fabric.fireEvent (topTouchStart/topTouchEnd), never a direct call to the `onPress`
// prop — a direct call bypasses exactly the dispatch machinery that lost the error, per
// test-harness-false-greens.md's "a synthetic stand-in for the real input is a different input".
describe('Negative — a real press listener throws', () => {
  const DISPATCH_ROOT_TAG = 812;
  const DISPATCH_BOOM = 'listener exploded';

  beforeEach(() => {
    fabric.reset();
  });
  afterEach(() => {
    unmount(DISPATCH_ROOT_TAG);
    setAppConfigurator(undefined);
  });

  async function press(testID: string): Promise<void> {
    const target = fabric.find(node => node.props.testID === testID);
    expect(target).toBeDefined();
    fabric.fireEvent(target?.instanceHandle, 'topTouchStart');
    fabric.fireEvent(target?.instanceHandle, 'topTouchEnd');
    await tick();
  }

  // Mirrors LifecycleLogChild's own demo intent (examples/vue-sfc): an ancestor's
  // `onErrorCaptured` hook that deliberately does NOT return `false`, so the same throw also
  // reaches the app-level `errorHandler` — proving both fire from one throw.
  it('reaches both onErrorCaptured and app.config.errorHandler from one throw', async () => {
    const captured: unknown[] = [];
    const globalErrors: unknown[] = [];
    setAppConfigurator(app => {
      app.config.errorHandler = error => {
        globalErrors.push(error);
      };
    });

    // onErrorCaptured only catches a throw from a DESCENDANT component's own instance, never from
    // an element its own template declares directly — the registering component's `.parent` is
    // where Vue's handleError starts its walk. So the boundary must wrap a CHILD component (as
    // ApiPlaygroundScreen wraps LifecycleLogChild in the real app), not a slot rendered in its own
    // scope — a slot's host elements are attributed to the RENDERING instance, i.e. the boundary
    // itself, which the walk skips.
    const Thrower = defineComponent({
      setup: () => () =>
        h('pressable', {
          testID: 'boom-target',
          onPress: () => {
            throw new Error(DISPATCH_BOOM);
          },
        }),
    });
    const DispatchBoundary = defineComponent({
      setup() {
        onErrorCaptured(error => {
          captured.push(error);
        });
        return () => h(Thrower);
      },
    });

    mount(DISPATCH_ROOT_TAG, DispatchBoundary);
    await tick();

    await press('boom-target');

    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({ message: DISPATCH_BOOM });
    expect(globalErrors).toHaveLength(1);
    expect(globalErrors[0]).toMatchObject({ message: DISPATCH_BOOM });
  });

  it('keeps the press machine running after the throw — a second press still fires', async () => {
    setAppConfigurator(app => {
      app.config.errorHandler = () => {};
    });

    let pressInCount = 0;
    mount(
      DISPATCH_ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h('pressable', {
            testID: 'boom-target',
            onPressIn: () => {
              pressInCount++;
            },
            onPress: () => {
              throw new Error(DISPATCH_BOOM);
            },
          }),
      }),
    );
    await tick();

    await press('boom-target');
    await press('boom-target');

    expect(pressInCount).toBe(2);
  });
});
