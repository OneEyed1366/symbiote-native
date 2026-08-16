// `SymbioteHostPropsDirective` wraps every flat-bag `onX` prop so the handler is followed by
// markForCheck() - the fix that makes a responder/onLongPress mutation repaint at all (see
// __tests__/responder-nested-cd.test.ts). That wrapper must be MEMOIZED per original handler.
//
// Why it matters beyond the allocation: the wrapper is what actually reaches the engine, and
// `routeProp` -> `setEventListener` stores a further closure over it. A fresh wrapper on every
// push means a new listener every push - on a path a scroll frame reaches up to 60 times a
// second - and, worse, it makes the pushed bag permanently unequal to its predecessor by
// reference, so no upstream memoization could ever conclude "nothing changed" while a callback
// prop was present.
//
// The observable is what the RENDERER was handed, one level below the directive: that proves what
// the engine receives, not merely what a private method returned. Pushes are driven by real
// native events through the fake Fabric slot, because the wrapped callback calling markForCheck
// is itself what schedules the next change-detection pass - the same loop the device runs.

import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

import { mount, unmount } from '../render';
import { SymbioteRenderer } from '../renderer';
import { ViewHost as View, SymbioteHostPropsDirective } from '../primitives';

const ROOT_TAG = 997;
const TOUCH_START = 'topTouchStart';
const TOUCH_END = 'topTouchEnd';
const PUSHES = 5;

const fabric = installFabric();

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

// Records every value the renderer was handed for a given prop key, so the test compares
// identities across pushes rather than trusting a private method's return value.
function probeSetProperty(key: string): { values: () => unknown[]; restore: () => void } {
  const original = SymbioteRenderer.prototype.setProperty;
  const seen: unknown[] = [];
  SymbioteRenderer.prototype.setProperty = function patched(
    node: unknown,
    name: string,
    value: unknown,
  ): void {
    if (name === key) seen.push(value);
    original.call(this, node, name, value);
  };
  return {
    values: (): unknown[] => seen,
    restore: (): void => {
      SymbioteRenderer.prototype.setProperty = original;
    },
  };
}

let mounted: WrapperStabilityHost | undefined;

@Component({
  selector: 'wrapper-stability-host',
  standalone: true,
  imports: [View, SymbioteHostPropsDirective],
  template: `<View [symbioteHostProps]="bag"></View>`,
})
class WrapperStabilityHost {
  taps = 0;
  // Swappable on purpose: the second test replaces it to prove the cache is keyed by handler and
  // not "wrap once, ignore everything after".
  longPress: () => void = (): void => {};

  constructor() {
    // Captures the live component instance so the test can drive it after mount.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    mounted = this;
  }

  // A getter, so every change-detection pass rebuilds the bag - the exact shape the memoization
  // has to survive, and the one an un-memoized component prop bag produces today.
  get bag(): Record<string, unknown> {
    return {
      testID: 'wrapper-probe',
      onStartShouldSetResponder: (): boolean => true,
      onResponderGrant: (): void => {
        this.taps += 1;
      },
      onResponderRelease: (): void => {},
      onLongPress: this.longPress,
    };
  }
}

function host(): WrapperStabilityHost {
  if (mounted === undefined) throw new Error('host component was never constructed');
  return mounted;
}

function handleFor(testID: string): unknown {
  const node = fabric.find((n: IFakeNode) => n.props.testID === testID);
  if (!node) throw new Error(`no node created with testID=${testID}`);
  return node.instanceHandle;
}

let probe: ReturnType<typeof probeSetProperty>;

beforeEach(() => {
  fabric.reset();
  probe = probeSetProperty('onLongPress');
});
afterEach(() => {
  unmount(ROOT_TAG);
  probe.restore();
});

describe('SymbioteHostPropsDirective callback wrapper identity', () => {
  // why: the regression this memoization exists to prevent. Every push of a rebuilt bag used to
  // hand the engine a brand-new function for the same unchanged handler.
  it('hands the engine the SAME wrapper for an unchanged handler across pushes', async () => {
    mount(ROOT_TAG, WrapperStabilityHost);
    await flush();

    const node = handleFor('wrapper-probe');
    // A full grant/release cycle per iteration: the responder stays granted after a touchStart,
    // so a second one alone would never re-enter onResponderGrant and the loop would silently
    // drive exactly one change-detection pass.
    for (let i = 0; i < PUSHES; i += 1) {
      fabric.fireEvent(node, TOUCH_START);
      await flush();
      fabric.fireEvent(node, TOUCH_END);
      await flush();
    }

    expect(host().taps, 'the events must actually have reached the component').toBe(PUSHES);
    const pushed = probe.values();
    expect(pushed.length, 'the bag must have been re-pushed on those passes').toBeGreaterThan(1);
    expect(new Set(pushed).size, 'every push of the same handler must reuse one wrapper').toBe(1);
  });

  // why: memoization must not degrade into "wrap once and ignore later handlers" - an inline
  // callback swapped at runtime would then keep invoking the old one, which is a correctness bug,
  // not a performance one.
  it('gives a genuinely different handler its own wrapper', async () => {
    mount(ROOT_TAG, WrapperStabilityHost);
    await flush();

    const node = handleFor('wrapper-probe');
    fabric.fireEvent(node, TOUCH_START);
    await flush();
    fabric.fireEvent(node, TOUCH_END);
    await flush();
    const beforeSwap = new Set(probe.values()).size;

    host().longPress = (): void => {};
    fabric.fireEvent(node, TOUCH_START);
    await flush();
    fabric.fireEvent(node, TOUCH_END);
    await flush();

    expect(
      new Set(probe.values()).size,
      'a new handler must produce a new wrapper, not reuse the cached one',
    ).toBe(beforeSwap + 1);
  });
});
