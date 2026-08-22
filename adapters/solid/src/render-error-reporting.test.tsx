// A throw under the Solid root used to reach nobody. Solid unwinds to whoever is on the stack —
// the native event dispatcher for an update, the host's AppRegistry runnable for the first paint —
// and neither logs, so the screen went blank with an empty console. render.ts now wraps the root in
// `catchError` and hands the error to the engine's reportUncaughtError, the same native channel the
// React, Vue and Angular adapters use.
//
// Asserted through a real mount rather than by calling the handler directly: the claim is that the
// root is WIRED to it, which is exactly what was missing. `ErrorBoundary` is imported explicitly —
// babel-preset-solid otherwise resolves the name against ./renderer, which does not export it, and
// the failure is a runtime `undefined`, not a type error.

import { createEffect, createSignal, ErrorBoundary } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { mount, unmount } from './render';

const ROOT_TAG = 823;
const BOOM = 'render exploded';

const fabric = installFabric();
let consoleError: ReturnType<typeof vi.spyOn>;

// The surface commits on a microtask (requestCommit), so anything reading the committed tree waits
// one macrotask first — the same shape as the adapter's other renderer tests.
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  unmount(ROOT_TAG);
  consoleError.mockRestore();
  Reflect.deleteProperty(globalThis, 'ErrorUtils');
});

function loggedMessages(): string[] {
  return consoleError.mock.calls.map(call =>
    call.map(arg => String(arg)).join(' '),
  );
}

function installHostReporter(): ReturnType<typeof vi.fn> {
  const reportError = vi.fn();
  Object.assign(globalThis, { ErrorUtils: { reportError } });
  return reportError;
}

function walk(nodes: IFakeNode[], visit: (node: IFakeNode) => void): void {
  for (const node of nodes) {
    visit(node);
    walk(node.children, visit);
  }
}

function findCommitted(
  predicate: (node: IFakeNode) => boolean,
): IFakeNode | undefined {
  let found: IFakeNode | undefined;
  walk(fabric.committed, node => {
    if (found === undefined && predicate(node)) found = node;
  });
  return found;
}

function Exploding() {
  throw new Error(BOOM);
}

describe('Negative — an uncaught error under the Solid root', () => {
  it('reports the error instead of blanking the screen in silence', () => {
    expect(() => mount(ROOT_TAG, Exploding)).toThrow(BOOM);

    expect(loggedMessages().some(message => message.includes(BOOM))).toBe(true);
  });

  it('names the render seam, so the line is not an anonymous stack', () => {
    expect(() => mount(ROOT_TAG, Exploding)).toThrow(BOOM);

    expect(
      loggedMessages().some(message => message.includes('solid render')),
    ).toBe(true);
  });

  it('routes to the host reporter when one is installed, as on a native host', () => {
    const reportError = installHostReporter();

    expect(() => mount(ROOT_TAG, Exploding)).toThrow(BOOM);

    const reported: unknown = reportError.mock.calls[0]?.[0];
    expect(reported).toMatchObject({ message: BOOM });
  });

  it('still throws out of mount, so a half-built tree stays a loud failure', () => {
    installHostReporter();

    // The divergence from React/Vue/Angular, pinned: Solid's `insert` REPLACES rather than
    // reconciles, so there is no live tree left to keep and the adapter's existing contract is to
    // unwind. Reporting is additive, not a replacement for it — several negative tests elsewhere
    // (a bare string outside a <Text>) assert this same throw.
    expect(() => mount(ROOT_TAG, Exploding)).toThrow(BOOM);
  });

  it('reports a throw from the root insert effect, one step later than the body', () => {
    // A root that hands back an ACCESSOR rather than a node: the throw happens when `insert` calls
    // it inside a render effect, after the component body has already returned. This is the case
    // Solid's own `render(code, node)` cannot cover — it runs `insert(element, code())`, so the
    // effect is born outside whatever `code` wrapped. render.ts spells the two apart for this.
    const reportError = installHostReporter();

    function LazyExploding() {
      return () => {
        throw new Error(BOOM);
      };
    }

    expect(() => mount(ROOT_TAG, LazyExploding)).toThrow(BOOM);

    expect(reportError.mock.calls[0]?.[0]).toMatchObject({ message: BOOM });
  });

  it('reports a throw raised by a later reactive update, not just the first paint', async () => {
    const reportError = installHostReporter();
    const [step, setStep] = createSignal(0);

    function App() {
      return (
        <symbiote-view>
          <symbiote-text>
            {(() => {
              if (step() > 0) throw new Error(BOOM);
              return 'ok';
            })()}
          </symbiote-text>
        </symbiote-view>
      );
    }

    mount(ROOT_TAG, App);
    await tick();
    expect(reportError).not.toHaveBeenCalled();

    expect(() => setStep(1)).toThrow(BOOM);

    expect(reportError.mock.calls[0]?.[0]).toMatchObject({ message: BOOM });
  });

  it('reports one error once, however deep the owner chain under it', async () => {
    // The handler rethrows, and Solid answers a throw out of an error handler by calling
    // `handleError` again at the next owner UP — which inherits the very same handler. Unlatched
    // this produced six reports (six redboxes) for one error in the four-deep tree below.
    const reportError = installHostReporter();
    const [step, setStep] = createSignal(0);

    const Leaf = () => (
      <symbiote-text>
        {(() => {
          if (step() > 0) throw new Error(BOOM);
          return 'ok';
        })()}
      </symbiote-text>
    );
    const Inner = () => (
      <symbiote-view>
        <Leaf />
      </symbiote-view>
    );
    const Outer = () => (
      <symbiote-view>
        <Inner />
      </symbiote-view>
    );

    mount(ROOT_TAG, Outer);
    await tick();

    expect(() => setStep(1)).toThrow(BOOM);

    expect(reportError).toHaveBeenCalledTimes(1);
  });

  it('reports a throw from inside an effect the root created', async () => {
    const reportError = installHostReporter();
    const [step, setStep] = createSignal(0);

    function App() {
      createEffect(() => {
        if (step() > 0) throw new Error(BOOM);
      });
      return <symbiote-view testID="effect-root" />;
    }

    mount(ROOT_TAG, App);
    await tick();

    expect(() => setStep(1)).toThrow(BOOM);

    expect(reportError.mock.calls[0]?.[0]).toMatchObject({ message: BOOM });
  });
});

describe('An ErrorBoundary claimed the error', () => {
  it('keeps it OFF the native redbox', async () => {
    // DELIBERATE, and the behaviour React and Vue were aligned TO rather than away from: writing a
    // boundary is the developer saying "this can throw and I am handling it". A full-screen redbox
    // over the fallback the app just rendered contradicts what the app asked for. Do not make this
    // loud to "match React" — React's own adapter is silent here for the same reason.
    const reportError = installHostReporter();

    function App() {
      return (
        <ErrorBoundary fallback={<symbiote-text>recovered</symbiote-text>}>
          <Exploding />
        </ErrorBoundary>
      );
    }

    mount(ROOT_TAG, App);
    await tick();

    expect(reportError).not.toHaveBeenCalled();
    // Looks for OUR seam label rather than the message: solid-js's DEV build console.errors a
    // boundary-caught error itself when the fallback takes no argument (dev.js:1622), so counting
    // console calls would assert Solid's behaviour, not ours.
    expect(
      loggedMessages().some(message => message.includes('solid render')),
    ).toBe(false);
  });

  it('lets the boundary paint its fallback all the same', async () => {
    function App() {
      return (
        <ErrorBoundary fallback={<symbiote-text>recovered</symbiote-text>}>
          <symbiote-view>
            <Exploding />
          </symbiote-view>
        </ErrorBoundary>
      );
    }

    mount(ROOT_TAG, App);
    await tick();

    expect(
      findCommitted(
        node =>
          node.viewName === 'RCTRawText' && node.props.text === 'recovered',
      ),
      'the fallback committed',
    ).toBeDefined();
  });
});
