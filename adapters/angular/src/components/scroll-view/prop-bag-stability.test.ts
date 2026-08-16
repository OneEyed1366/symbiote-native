// How much work a ScrollView does on a change-detection pass that changed nothing about it.
//
// A press anywhere marks every ancestor to the root, so every screen with a ScrollView on it
// re-evaluates that ScrollView's bindings on every press, every scroll frame, every unrelated
// tick (see the `angular-adapter-change-detection` skill, §3 and §5). What that costs depends
// entirely on whether `scrollProps` hands back the SAME bag when nothing changed.
//
// The probe is the `symbioteHostProps` SETTER, because Angular runs it exactly when its binding
// check decided the bound value changed - and each run pushes every key through
// `renderer.setProperty` -> the engine's prop routing -> a Fabric clone check. A getter that
// rebuilds `{...props, style: [...]}` per read is never `===` its previous result, so the check
// fails every time even when the bag is structurally identical.
//
// The probe is deliberately shape-independent: it hooks the directive, not the component, so the
// same numbers are comparable before and after `scrollProps` becomes a `computed()`.

import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

import { mount, unmount } from '../../render';
import { ViewHost as View, SymbioteHostPropsDirective } from '../../primitives';
import { ScrollView } from './index.ios';

const ROOT_TAG = 993;
const TOUCH_START = 'topTouchStart';
const SCROLL_EVENT = 'topScroll';
const PASSES = 10;
// The iOS template holds TWO host-prop bindings, `scrollProps` and `contentProps`, and both are
// now computed()s that hand back the same bag when nothing about them changed. Measured
// 2026-08-16: 2 per frame while both were getters, 1 once contentProps was memoized, 0 now. Zero
// is the contract, not a coincidence - anything above it means a bag went back to rebuilding
// itself per refresh.
const RE_PUSHES_PER_FRAME = 0;

const fabric = installFabric();

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

function handleFor(testID: string): unknown {
  const node = fabric.find((n: IFakeNode) => n.props.testID === testID);
  if (!node) throw new Error(`no node created with testID=${testID}`);
  return node.instanceHandle;
}

// The ScrollView's own host, which the component creates itself - it carries no testID of ours.
function scrollHostHandle(): unknown {
  const node = fabric.find((n: IFakeNode) => n.viewName === 'RCTScrollView');
  if (!node) throw new Error('no RCTScrollView was created');
  return node.instanceHandle;
}

// Counts how often Angular pushed a NEW bag into the host-props directive, and how many distinct
// bag identities it saw. Hooks the directive prototype so it is blind to how the component
// happens to expose `scrollProps` today.
function probeHostProps(): { setterRuns: () => number; restore: () => void } {
  const descriptor = Object.getOwnPropertyDescriptor(
    SymbioteHostPropsDirective.prototype,
    'symbioteHostProps',
  );
  const original = descriptor?.set;
  if (original === undefined) throw new Error('symbioteHostProps is not an accessor any more');
  let runs = 0;
  Object.defineProperty(SymbioteHostPropsDirective.prototype, 'symbioteHostProps', {
    ...descriptor,
    set(this: SymbioteHostPropsDirective, value: Record<string, unknown>) {
      runs += 1;
      original.call(this, value);
    },
  });
  return {
    setterRuns: (): number => runs,
    restore: (): void => {
      Object.defineProperty(SymbioteHostPropsDirective.prototype, 'symbioteHostProps', descriptor);
    },
  };
}

// A screen whose ScrollView is bound to STABLE inputs: nothing about it changes between passes,
// so every setter run after the first is pure waste.
@Component({
  selector: 'stability-screen',
  standalone: true,
  imports: [View, ScrollView, SymbioteHostPropsDirective],
  template: `
    <View [symbioteHostProps]="pressProps"></View>
    <ScrollView
      [style]="scrollStyle"
      [horizontal]="false"
      [onScroll]="handleScroll"
      [scrollEventThrottle]="16"
    ></ScrollView>
  `,
})
class StabilityScreen {
  presses = 0;
  scrolls = 0;
  // The shape every windowed list binds: a JS scroll callback that usually decides nothing
  // changed. Stable reference, so the ScrollView's INPUT is identical on every pass.
  readonly handleScroll = (): void => {
    this.scrolls += 1;
  };
  // A stable reference on purpose: the question is what the COMPONENT does with an unchanged
  // input, not whether an inline literal in the template defeats it (that trap is its own).
  readonly scrollStyle = { flex: 1 };
  readonly pressProps = {
    testID: 'press-host',
    onStartShouldSetResponder: (): boolean => true,
    onResponderGrant: (): void => {
      this.presses += 1;
    },
  };
}

let probe: ReturnType<typeof probeHostProps>;

beforeEach(() => {
  fabric.reset();
  probe = probeHostProps();
});
afterEach(() => {
  unmount(ROOT_TAG);
  probe.restore();
});

describe('ScrollView prop-bag stability across unrelated change detection', () => {
  // why: the before/after number for the signals pilot. Every run of this setter re-pushes the
  // whole bag through the renderer for a ScrollView that did not change - the per-pass cost that
  // `computed()` is supposed to remove. Recorded as a RANGE bound rather than an exact count so
  // the test states the direction of the contract ("must not grow with unrelated passes") and
  // still fails loudly if a change makes it worse.
  it('costs an unchanged ScrollView nothing when an UNRELATED component is pressed', async () => {
    mount(ROOT_TAG, StabilityScreen);
    await flush();

    const pressHost = handleFor('press-host');
    const mountCost = probe.setterRuns();

    for (let i = 0; i < PASSES; i += 1) {
      fabric.fireEvent(pressHost, TOUCH_START);
      await flush();
    }

    // Good news, and it narrows where optimising is worth anything: a real @Component boundary
    // holds. The press marks ancestors, but the ScrollView's own inputs did not change, so its
    // view never refreshes and its prop bag is never rebuilt.
    expect(
      probe.setterRuns() - mountCost,
      'a sibling @Component with unchanged inputs must stay untouched',
    ).toBe(0);
  });

  // why: THE pilot number, and the pin that keeps the win from regressing. Unlike the press
  // above, a scroll event is delivered to a callback that lives INSIDE the ScrollView's own
  // template, so markForCheck dirties that view itself. A getter rebuilds its whole bag per frame
  // though nothing about it changed; a computed() does not.
  it('records how many times a SCROLLED ScrollView re-pushes its prop bag', async () => {
    mount(ROOT_TAG, StabilityScreen);
    await flush();

    const scrollHost = scrollHostHandle();
    const mountCost = probe.setterRuns();

    for (let i = 0; i < PASSES; i += 1) {
      fabric.fireEvent(scrollHost, SCROLL_EVENT);
      await flush();
    }

    const perFrameCost = probe.setterRuns() - mountCost;
    const commits = fabric.counts.completeRoot;
    // The before/after number this file exists to surface — printed, not asserted.
    console.log(
      `[pilot] scroll-view prop bag: mount=${mountCost} frames=${PASSES} ` +
        `rePushes=${perFrameCost} fabricCommits=${commits}`,
    );

    expect(perFrameCost, 'a memoized bag must not re-push on an unchanged scroll frame').toBe(
      PASSES * RE_PUSHES_PER_FRAME,
    );
    // Where the cost does NOT land, which is as useful to pin as where it does: re-pushing an
    // identical bag never reaches Fabric. The engine's reconcile walk deep-compares, finds
    // nothing changed and skips completeRoot, so `1` here is the mount commit and the ten scroll
    // frames added none. The waste is Angular-side plus one engine tree walk - not a native
    // commit - so optimising further means removing REFRESHES, not chasing Fabric.
    expect(commits, 'an unchanged tree must not re-commit to Fabric').toBe(1);
  });
});
