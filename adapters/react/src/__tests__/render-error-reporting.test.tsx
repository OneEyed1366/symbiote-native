// A throw during render used to vanish. react-reconciler reports it through the three error
// callbacks handed to createContainer, and all three were `noop`: the reconciler abandoned the
// commit, so nothing painted, and nothing was logged either — a blank screen with an empty
// console. React's own defaults hand the error to the host (ReactFiberErrorLogger.js), and RN
// wraps them to reach the redbox (ReactFabric.js's nativeOnUncaughtError); ours route through
// the engine's reportUncaughtError to the same native channel.
//
// Asserted through a real mount rather than by calling the callbacks directly: the claim is that
// the container is WIRED to them, which is exactly what was wrong.

import { Component, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Text, View, mount, unmount } from '@symbiote-native/react';
import { installFabric } from '@symbiote-native/test-utils';

const ROOT_TAG = 214;
const BOOM = 'render exploded';

function Exploding(): ReactElement {
  throw new Error(BOOM);
}

class Boundary extends Component<{ children: ReactNode }, { hasFailed: boolean }> {
  state = { hasFailed: false };

  static getDerivedStateFromError(): { hasFailed: boolean } {
    return { hasFailed: true };
  }

  render(): ReactNode {
    return this.state.hasFailed ? <Text>recovered</Text> : this.props.children;
  }
}

const fabric = installFabric();
let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fabric.reset();
  // React itself console.errors in DEV around a thrown render, so the spy is silenced and the
  // assertions look for OUR line rather than counting calls.
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  unmount(ROOT_TAG);
  consoleError.mockRestore();
  Reflect.deleteProperty(globalThis, 'ErrorUtils');
});

function loggedMessages(): string[] {
  return consoleError.mock.calls.map(call => call.map(arg => String(arg)).join(' '));
}

describe('Negative — a component throws during render', () => {
  it('reports the error instead of blanking the screen in silence', () => {
    mount(ROOT_TAG, <Exploding />);

    expect(loggedMessages().some(message => message.includes(BOOM))).toBe(true);
  });

  it('names the render seam, so the line is not an anonymous stack', () => {
    mount(ROOT_TAG, <Exploding />);

    expect(loggedMessages().some(message => message.includes('react render'))).toBe(true);
  });

  it('routes to the host reporter when one is installed, as on a native host', () => {
    const reportError = vi.fn();
    Object.assign(globalThis, { ErrorUtils: { reportError } });

    mount(ROOT_TAG, <Exploding />);

    const reported: unknown = reportError.mock.calls[0]?.[0];
    expect(reported).toMatchObject({ message: BOOM });
  });

  it('carries the component stack the redbox renders', () => {
    const reportError = vi.fn();
    Object.assign(globalThis, { ErrorUtils: { reportError } });

    mount(ROOT_TAG, <Exploding />);

    expect(reportError.mock.calls[0]?.[0]).toMatchObject({ isComponentError: true });
  });

  it('still reports an error an error boundary caught', () => {
    // The boundary decides what the USER sees, not whether the developer hears about it — RN's
    // nativeOnCaughtError calls the same showErrorDialog as the uncaught path.
    const reportError = vi.fn();
    Object.assign(globalThis, { ErrorUtils: { reportError } });

    mount(
      ROOT_TAG,
      <Boundary>
        <Exploding />
      </Boundary>,
    );

    expect(reportError).toHaveBeenCalled();
  });

  it('lets the boundary paint its fallback all the same', () => {
    mount(
      ROOT_TAG,
      <Boundary>
        <View>
          <Exploding />
        </View>
      </Boundary>,
    );

    expect(fabric.appRoot().children).toHaveLength(1);
  });
});
