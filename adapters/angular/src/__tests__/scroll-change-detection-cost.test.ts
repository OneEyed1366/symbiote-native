// What one native scroll event COSTS in Angular change detection.
//
// SymbioteHostPropsDirective wraps every flat-bag `onX` prop so the handler is followed by
// markForCheck() - the fix that made responder/onLongPress state repaint at all (see
// responder-nested-cd.test.ts). `onScroll` is an `onX` prop like any other, but unlike a press it
// arrives at up to 60Hz, and markForCheck() walks RefreshView|Dirty onto EVERY ancestor up to the
// root (mark_view_dirty.ts), after which refreshView() hardcodes Global mode for the refreshed
// view's own template. So each scroll frame re-runs the owning component's whole template.
//
// This file pins the SHAPE of that cost so a regression (or a fix) is visible as a number rather
// than as a frame-rate impression on a device: how many times the scrolled component's own
// template is re-evaluated per scroll event, and whether an unrelated sibling component is
// dragged along with it.

import '@angular/compiler';
import { Component, signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

import { mount, unmount } from '../render';
import {
  ScrollViewHost,
  TextHost as Text,
  SymbioteHostPropsDirective,
} from '../primitives';
import { registerComposedComponent } from '../anchor-host-registry';

const ROOT_TAG = 981;
const SCROLL_EVENT = 'topScroll';
const SCROLL_BURST = 10;

registerComposedComponent('scroll-cost-sibling');
registerComposedComponent('scroll-cost-inner');
registerComposedComponent('signal-child');

const fabric = installFabric();

const flush = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

function handleFor(testID: string): unknown {
  const node = fabric.find((n: IFakeNode) => n.props.testID === testID);
  if (!node) throw new Error(`no node created with testID=${testID}`);
  return node.instanceHandle;
}

// An unrelated component that shares nothing with the scrolled one. Its own template read count
// answers "does a scroll frame drag the rest of the screen along".
@Component({
  selector: 'scroll-cost-sibling',
  standalone: true,
  imports: [Text, SymbioteHostPropsDirective],
  template: `<Text [symbioteHostProps]="probeProps">{{ label }}</Text>`,
})
class ScrollCostSibling {
  templateReads = 0;
  readonly probeProps = { testID: 'sibling-probe' };

  constructor() {
    // Captures the live component instance so the test can drive it after mount.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    mountedSibling = this;
  }

  get label(): string {
    this.templateReads += 1;
    return 'sibling';
  }
}

// mount() hands back the surface, not the component, so the instance registers itself here.
let mountedRoot: ScrollCostRoot | undefined;
let mountedSibling: ScrollCostSibling | undefined;

@Component({
  selector: 'scroll-cost-root',
  standalone: true,
  imports: [
    ScrollViewHost,
    Text,
    SymbioteHostPropsDirective,
    ScrollCostSibling,
  ],
  template: `
    <symbiote-scroll-view
      [symbioteHostProps]="scrollHostProps"
    ></symbiote-scroll-view>
    <Text [symbioteHostProps]="ownProbeProps">{{ ownLabel }}</Text>
    <scroll-cost-sibling></scroll-cost-sibling>
  `,
})
class ScrollCostRoot {
  templateReads = 0;
  scrollEvents = 0;
  readonly ownProbeProps = { testID: 'root-probe' };
  readonly scrollHostProps = {
    testID: 'scroll-host',
    // The shape a windowed list binds: a plain callback that usually decides nothing changed.
    onScroll: (): void => {
      this.scrollEvents += 1;
    },
  };

  constructor() {
    // Captures the live component instance so the test can drive it after mount.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    mountedRoot = this;
  }

  get ownLabel(): string {
    this.templateReads += 1;
    return 'root';
  }
}

function root(): ScrollCostRoot {
  if (mountedRoot === undefined)
    throw new Error('root component was never constructed');
  return mountedRoot;
}

function sibling(): ScrollCostSibling {
  if (mountedSibling === undefined)
    throw new Error('sibling component was never constructed');
  return mountedSibling;
}

// The device-faithful shape: the scrolled host lives in a CHILD (our ScrollView component), the
// screen template is the ROOT above it. markForCheck() marks ancestors, so the question this pair
// answers is whether the SCREEN pays for a scroll frame that happened inside a list.
let mountedScreen: ScrollCostScreen | undefined;

@Component({
  selector: 'scroll-cost-inner',
  standalone: true,
  imports: [ScrollViewHost, SymbioteHostPropsDirective],
  template: `<symbiote-scroll-view
    [symbioteHostProps]="scrollHostProps"
  ></symbiote-scroll-view>`,
})
class ScrollCostInner {
  scrollEvents = 0;
  readonly scrollHostProps = {
    testID: 'nested-scroll-host',
    onScroll: (): void => {
      this.scrollEvents += 1;
    },
  };
}

@Component({
  selector: 'scroll-cost-screen',
  standalone: true,
  imports: [Text, SymbioteHostPropsDirective, ScrollCostInner],
  template: `
    <Text [symbioteHostProps]="screenProbeProps">{{ screenLabel }}</Text>
    @for (row of rows; track row) {
      <Text [symbioteHostProps]="screenProbeProps">{{ rowLabel(row) }}</Text>
    }
    <scroll-cost-inner></scroll-cost-inner>
  `,
})
class ScrollCostScreen {
  templateReads = 0;
  rowReads = 0;
  readonly rows = [0, 1, 2, 3, 4];
  readonly screenProbeProps = { testID: 'screen-probe' };

  constructor() {
    // Captures the live component instance so the test can drive it after mount.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    mountedScreen = this;
  }

  get screenLabel(): string {
    this.templateReads += 1;
    return 'screen';
  }

  rowLabel(row: number): string {
    this.rowReads += 1;
    return `row ${row}`;
  }
}

function screen(): ScrollCostScreen {
  if (mountedScreen === undefined)
    throw new Error('screen component was never constructed');
  return mountedScreen;
}

// The same nesting again, but the child's scroll-derived state is a SIGNAL read in its template.
let mountedSignalScreen: SignalScreen | undefined;
let mountedSignalChild: SignalChild | undefined;

@Component({
  selector: 'signal-child',
  standalone: true,
  imports: [Text, SymbioteHostPropsDirective],
  template: `<Text [symbioteHostProps]="probeProps">{{ label() }}</Text>`,
})
class SignalChild {
  templateReads = 0;
  readonly offset = signal(0);
  readonly probeProps = { testID: 'signal-child-probe' };

  constructor() {
    // Captures the live component instance so the test can drive it after mount.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    mountedSignalChild = this;
  }

  readonly label = (): string => {
    this.templateReads += 1;
    return `offset ${this.offset()}`;
  };
}

@Component({
  selector: 'signal-screen',
  standalone: true,
  imports: [Text, SymbioteHostPropsDirective, SignalChild],
  template: `
    <Text [symbioteHostProps]="screenProbeProps">{{ screenLabel }}</Text>
    @for (row of rows; track row) {
      <Text [symbioteHostProps]="screenProbeProps">{{ rowLabel(row) }}</Text>
    }
    <signal-child></signal-child>
  `,
})
class SignalScreen {
  templateReads = 0;
  rowReads = 0;
  readonly rows = [0, 1, 2, 3, 4];
  readonly screenProbeProps = { testID: 'signal-screen-probe' };

  constructor() {
    // Captures the live component instance so the test can drive it after mount.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    mountedSignalScreen = this;
  }

  get screenLabel(): string {
    this.templateReads += 1;
    return 'screen';
  }

  rowLabel(row: number): string {
    this.rowReads += 1;
    return `row ${row}`;
  }
}

function signalScreen(): SignalScreen {
  if (mountedSignalScreen === undefined)
    throw new Error('signal screen was never constructed');
  return mountedSignalScreen;
}

function signalChild(): SignalChild {
  if (mountedSignalChild === undefined)
    throw new Error('signal child was never constructed');
  return mountedSignalChild;
}

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('cost of a native scroll event in Angular change detection', () => {
  // why: the number this file exists for, now inverted. It read SCROLL_BURST while the props-bag
  // wrapper called markForCheck after every `onX`; `onScroll` is now excluded from that wrap
  // (PER_FRAME_CALLBACK in primitives/shared.ts). The handler must still be CALLED - the first
  // assertion is what separates "stopped wasting work" from "stopped delivering the event".
  it('does not re-run the scrolled component`s own template for a scroll event', async () => {
    mount(ROOT_TAG, ScrollCostRoot);
    await flush();

    const host = handleFor('scroll-host');
    const rootBefore = root().templateReads;
    const siblingBefore = sibling().templateReads;

    for (let i = 0; i < SCROLL_BURST; i += 1) {
      fabric.fireEvent(host, SCROLL_EVENT);
      await flush();
    }

    expect(
      root().scrollEvents,
      'every scroll event must reach the handler',
    ).toBe(SCROLL_BURST);
    // The number this file exists to surface — printed, not asserted, so a shift in cost is
    // visible in the run output without pinning an exact figure the tree would fight.
    console.log(
      `scroll cost: events=${SCROLL_BURST} rootTemplateReads=${root().templateReads - rootBefore} ` +
        `siblingTemplateReads=${sibling().templateReads - siblingBefore}`,
    );
    expect(
      root().templateReads - rootBefore,
      'a scroll frame that changes nothing must not re-evaluate the owning template',
    ).toBe(0);
    expect(
      sibling().templateReads - siblingBefore,
      'an unrelated sibling component must NOT be dragged into a scroll frame',
    ).toBe(0);
  });

  // why: THE number behind the device symptom. A scroll frame inside a list was paid for by the
  // whole SCREEN - markForCheck flags every ancestor, so the screen template re-ran and its @for
  // blocks with it (embedded views are always CheckAlways, no per-view gate). The bigger the
  // screen, the more one frame cost, which is why sticky felt worst. Was SCROLL_BURST and
  // SCROLL_BURST * 5.
  it('does not re-run the ANCESTOR screen template for a scroll frame that happened in a child', async () => {
    mount(ROOT_TAG, ScrollCostScreen);
    await flush();

    const host = handleFor('nested-scroll-host');
    const screenBefore = screen().templateReads;
    const rowsBefore = screen().rowReads;

    for (let i = 0; i < SCROLL_BURST; i += 1) {
      fabric.fireEvent(host, SCROLL_EVENT);
      await flush();
    }

    expect(
      screen().templateReads - screenBefore,
      'the ancestor screen must not re-run for a scroll frame in a child',
    ).toBe(0);
    expect(
      screen().rowReads - rowsBefore,
      'nor its @for rows - this was the cost that scaled with screen size, not list size',
    ).toBe(0);
  });

  // why: the control that makes the two counts above CAUSAL rather than correlational. If a
  // mounted tree ticked on its own, the numbers would prove nothing about the callback wrap. A
  // native event with no listener bound reaches no `onX` prop, so nothing calls markForCheck -
  // and the screen must stay completely still.
  it('does not re-run anything for a native event that reaches no callback', async () => {
    mount(ROOT_TAG, ScrollCostScreen);
    await flush();

    const host = handleFor('nested-scroll-host');
    const screenBefore = screen().templateReads;
    const rowsBefore = screen().rowReads;

    for (let i = 0; i < SCROLL_BURST; i += 1) {
      fabric.fireEvent(host, 'topTouchStart');
      await flush();
    }

    expect(
      screen().templateReads - screenBefore,
      'no listener -> no tick',
    ).toBe(0);
    expect(screen().rowReads - rowsBefore, 'no listener -> no row re-run').toBe(
      0,
    );
  });

  // why: the fix, measured before any production code moves. Angular has TWO ways to say "this
  // changed", and they cost different amounts:
  //   markForCheck()  -> markViewDirty      -> RefreshView|Dirty on EVERY ancestor to the root,
  //                                            so each ancestor re-runs its OWN template
  //   signal.set()    -> markAncestorsForTraversal -> only HasChildViewsToRefresh on ancestors,
  //                                            breaking early once set: they are TRAVERSED, and
  //                                            only the view that READS the signal refreshes
  // (both in .vendors/angular/packages/core/src/render3: instructions/mark_view_dirty.ts and
  // util/view_utils.ts). This test drives a child's signal at scroll frequency and asserts the
  // ancestor screen pays nothing - the same burst that costs SCROLL_BURST screen re-runs above.
  it('costs the ancestor screen NOTHING when the child updates a signal instead', async () => {
    mount(ROOT_TAG, SignalScreen);
    await flush();

    const screenBefore = signalScreen().templateReads;
    const rowsBefore = signalScreen().rowReads;
    const childBefore = signalChild().templateReads;

    for (let i = 0; i < SCROLL_BURST; i += 1) {
      signalChild().offset.set(i + 1);
      await flush();
    }

    expect(
      signalChild().templateReads - childBefore,
      'the component that reads the signal does refresh',
    ).toBe(SCROLL_BURST);
    expect(
      signalScreen().templateReads - screenBefore,
      'but the ancestor screen template is only traversed, never re-executed',
    ).toBe(0);
    expect(
      signalScreen().rowReads - rowsBefore,
      'and its @for rows stay untouched',
    ).toBe(0);
  });
});
