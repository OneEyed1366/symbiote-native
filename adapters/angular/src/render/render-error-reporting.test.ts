// Angular is the only non-React adapter that surfaced an error at all, but it surfaced it to
// Angular's own default ErrorHandler — `console.error('ERROR', e)` — which off a dev machine
// reaches nobody. mount() now provides SymbioteErrorHandler, routing the same errors through the
// engine's reportUncaughtError to the native redbox, exactly like the React adapter's
// onUncaughtError.
//
// Asserted through a real mount and a real thrown error rather than by calling handleError
// directly: the claim is that the environment injector is WIRED to our handler on both funnels
// Angular actually uses (a scheduled tick, a template listener), which is the part that can break.
//
// Coverage dictionary (SymbioteErrorHandler + its provider, render/index.ts):
//   handleError -> reportUncaughtError, host-reporter branch: the first two tests.
//   handleError -> reportUncaughtError, console branch (no native host): the third.
//   the provider itself (the NG0201 fix the token was added for): the fourth — a missing provider
//     does not silence the error, it REPLACES it, so the assertion is on the reported message.
//   "report and keep running" (handleError returns instead of rethrowing): the fifth.

import '@angular/compiler';
import { Component, signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';
import { mount, unmount } from './index';

const ROOT_TAG = 733;
const TICK_BOOM = 'template exploded';
const LISTENER_BOOM = 'listener exploded';

const fabric = installFabric();

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));
const drainAngularAndCommit = async (): Promise<void> => {
  await tick();
  await tick();
};

class TestView {}
Component({
  selector: 'symbiote-view',
  standalone: true,
  template: '<ng-content></ng-content>',
})(TestView);

class TestText {}
Component({
  selector: 'symbiote-text',
  standalone: true,
  template: '<ng-content></ng-content>',
})(TestText);

// Module-level signals so a test can flip them without a handle on the component instance
// (mount() returns the surface, not the ComponentRef). Reading them in the template is what makes
// the view a consumer, so `explode.set(true)` notifies the zoneless scheduler and the throw lands
// in a SCHEDULED tick — the async path the ErrorHandler provider exists for, not mount()'s own
// first `appRef.tick()`.
const explode = signal(false);
const caption = signal('fine');

class TickThrowingComponent {
  text(): string {
    if (explode()) throw new Error(TICK_BOOM);
    return caption();
  }
}
Component({
  selector: 'symbiote-angular-tick-throwing',
  standalone: true,
  imports: [TestText],
  template: '<symbiote-text>{{ text() }}</symbiote-text>',
})(TickThrowingComponent);

class ListenerThrowingComponent {
  boom(): void {
    throw new Error(LISTENER_BOOM);
  }

  label(): string {
    return caption();
  }
}
Component({
  selector: 'symbiote-angular-listener-throwing',
  standalone: true,
  imports: [TestView, TestText],
  template:
    '<symbiote-view testID="trigger" (press)="boom()"><symbiote-text>{{ label() }}</symbiote-text></symbiote-view>',
})(ListenerThrowingComponent);

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fabric.reset();
  explode.set(false);
  caption.set('fine');
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

async function press(testID: string): Promise<void> {
  const target = fabric.find(node => node.props.testID === testID);
  expect(target).toBeDefined();
  fabric.fireEvent(target?.instanceHandle, 'topTouchStart');
  fabric.fireEvent(target?.instanceHandle, 'topTouchEnd');
  await drainAngularAndCommit();
}

describe('Negative — an Angular app throws', () => {
  it('routes a scheduled-tick exception to the host reporter, as on a native host', async () => {
    const reportError = installHostReporter();
    mount(ROOT_TAG, TickThrowingComponent);
    await tick();

    explode.set(true);
    await drainAngularAndCommit();

    expect(reportError.mock.calls[0]?.[0]).toMatchObject({
      message: TICK_BOOM,
    });
  });

  // A template listener is the second funnel into ErrorHandler (Angular's
  // executeListenerWithErrorHandling -> handleUncaughtError), and the one an app hits most: every
  // press handler runs through it. It reaches the handler on a different route than the tick
  // above, so wiring one proves nothing about the other.
  it('routes a throw from a template event listener to the host reporter', async () => {
    const reportError = installHostReporter();
    mount(ROOT_TAG, ListenerThrowingComponent);
    await tick();

    await press('trigger');

    expect(reportError.mock.calls[0]?.[0]).toMatchObject({
      message: LISTENER_BOOM,
    });
  });

  it('names the angular render seam off a native host, where console is the whole channel', async () => {
    mount(ROOT_TAG, TickThrowingComponent);
    await tick();

    explode.set(true);
    await drainAngularAndCommit();

    expect(
      loggedMessages().some(
        message =>
          message.includes('angular render') && message.includes(TICK_BOOM),
      ),
    ).toBe(true);
  });

  // The NG0201 regression this provider was added for does not merely silence the error — the
  // failed `injector.get(ErrorHandler)` lookup THROWS, and its own "No provider found for
  // ErrorHandler" replaces the app's error on the way out. So the guard is that what gets reported
  // is the app's message, not Angular's.
  it('reports the app error itself, not a missing-provider NG0201', async () => {
    const reportError = installHostReporter();
    mount(ROOT_TAG, TickThrowingComponent);
    await tick();

    explode.set(true);
    await drainAngularAndCommit();

    const reported: unknown = reportError.mock.calls[0]?.[0];
    const message =
      reported instanceof Error ? reported.message : String(reported);
    expect(message).toBe(TICK_BOOM);
    expect(loggedMessages().join('\n')).not.toContain('NG0201');
  });

  // handleError reports and RETURNS. A rethrow escapes the framework's own catch — here Angular's
  // executeListenerWithErrorHandling, which is on the synchronous path of a native press, so the
  // throw would surface in whatever dispatched the event instead of being contained. That is the
  // "keep running" half of what the provider exists for, and the listener path is where a
  // regression is observable rather than merely noisy.
  it('keeps the app running and repainting after reporting', async () => {
    installHostReporter();
    mount(ROOT_TAG, ListenerThrowingComponent);
    await tick();

    const target = fabric.find(node => node.props.testID === 'trigger');
    expect(target).toBeDefined();
    expect(() => {
      fabric.fireEvent(target?.instanceHandle, 'topTouchStart');
      fabric.fireEvent(target?.instanceHandle, 'topTouchEnd');
    }).not.toThrow();
    await drainAngularAndCommit();

    caption.set('recovered');
    await drainAngularAndCommit();

    expect(fabric.serialize(fabric.appRoot().children)).toContain(
      'RCTRawText "recovered"',
    );
  });
});
