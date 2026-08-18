// Regression coverage for the anchor-vs-real-content class bug (see pressable.test.ts for the
// full writeup): a `class="..."` written on a composed component's OWN use site always resolves
// through Angular's addClass/removeClass onto that component's non-painting ANCHOR host, never
// onto the real committed Fabric view one (or more) levels down. Each Touchable forwards its own
// anchor's resolved style into whatever it commits, mirroring Pressable's fix.
import '@angular/compiler';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearGlobalStyles, registerStyles } from '@symbiote-native/engine';
import {
  installFabric,
  waitUntil,
  type IFakeNode,
} from '@symbiote-native/test-utils';

import { mount, unmount } from '../../render';
import {
  TouchableHighlight,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from './index';

const ROOT_TAG = 940;
const fabric = installFabric();

// The Animated drivers read requestAnimationFrame off the host at call time and throw when it is
// missing (core/engine/.../raf.ts, deliberately loud). TouchableOpacity's fade runs on a real press
// here, so the file installs a setTimeout-backed frame clock for the whole suite.
const pendingFrames = new Map<number, (time: number) => void>();
let nextFrameId = 1;
let frameClock = 0;

function installRequestAnimationFrame(): void {
  Object.assign(globalThis, {
    requestAnimationFrame(callback: (time: number) => void): number {
      const id = nextFrameId++;
      pendingFrames.set(id, callback);
      setTimeout(() => {
        const frame = pendingFrames.get(id);
        if (frame === undefined) return;
        pendingFrames.delete(id);
        frameClock += 16;
        frame(frameClock);
      }, 0);
      return id;
    },
    cancelAnimationFrame(id: number): void {
      pendingFrames.delete(id);
    },
  });
}

beforeEach(() => {
  underlayHost = undefined;
  opacityHost = undefined;
  plainHost = undefined;
  pendingFrames.clear();
  nextFrameId = 1;
  frameClock = 0;
  installRequestAnimationFrame();
  fabric.reset();
});
afterEach(() => {
  unmount(ROOT_TAG);
  clearGlobalStyles();
  Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
  Reflect.deleteProperty(globalThis, 'cancelAnimationFrame');
});

@Component({
  selector: 'symbiote-touchable-opacity-host',
  standalone: true,
  imports: [TouchableOpacity],
  template: `
    <TouchableOpacity [testID]="'opacity'" class="card">
      <symbiote-text>Press</symbiote-text>
    </TouchableOpacity>
  `,
})
class TouchableOpacityHost {}

@Component({
  selector: 'symbiote-touchable-highlight-host',
  standalone: true,
  imports: [TouchableHighlight],
  template: `
    <TouchableHighlight [testID]="'highlight'" class="card">
      <symbiote-text>Press</symbiote-text>
    </TouchableHighlight>
  `,
})
class TouchableHighlightHost {}

@Component({
  selector: 'symbiote-touchable-without-feedback-host',
  standalone: true,
  imports: [TouchableWithoutFeedback],
  template: `
    <TouchableWithoutFeedback [testID]="'without-feedback'" class="card">
      <symbiote-text>Press</symbiote-text>
    </TouchableWithoutFeedback>
  `,
})
class TouchableWithoutFeedbackHost {}

describe('TouchableOpacity', () => {
  it('resolves a class= on the TouchableOpacity use site onto the real committed view, not the anchor', async () => {
    registerStyles({ card: { backgroundColor: 'red' } });

    mount(ROOT_TAG, TouchableOpacityHost);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    // TouchableOpacity folds its OWN class-derived style into the inner AnimatedView leaf, not
    // the outer Pressable — mirroring React's TouchableOpacity (see adapters/react/src/components/
    // touchable/index.ts's comment: "className is pulled out here, like style, and applied to the
    // inner AnimatedView... it would land on the outer Pressable instead, which is not what a user
    // expects"), so the testID-carrying outer view is NOT where the resolved style lands.
    expect(fabric.find(n => n.props.testID === 'opacity')).toBeDefined();
    const node = fabric.find(n => n.props.backgroundColor === 'red');
    expect(
      node,
      'a committed node received the class-derived style',
    ).toBeDefined();
  });
});

describe('TouchableHighlight', () => {
  // why: unlike TouchableOpacity, TouchableHighlight folds its class-derived style onto the SAME
  // outer view that carries testID — a regression here would show up directly on the testID node,
  // not on an inner leaf, so this asserts the style lands where an author actually looks for it.
  it('resolves a class= on the TouchableHighlight use site onto the real committed view, not the anchor', async () => {
    registerStyles({ card: { backgroundColor: 'red' } });

    mount(ROOT_TAG, TouchableHighlightHost);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const node = fabric.find(n => n.props.testID === 'highlight');
    expect(node?.props.backgroundColor).toBe('red');
  });
});

describe('TouchableWithoutFeedback', () => {
  // why: TouchableWithoutFeedback has no visual feedback wrapper at all (its entire point is
  // "render children, add only a press responder") — its anchor fix has the least surrounding
  // machinery of the three Touchables, so a regression here isolates cleanly to the anchor merge.
  it('resolves a class= on the TouchableWithoutFeedback use site onto the real committed view, not the anchor', async () => {
    registerStyles({ card: { backgroundColor: 'red' } });

    mount(ROOT_TAG, TouchableWithoutFeedbackHost);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const node = fabric.find(n => n.props.testID === 'without-feedback');
    expect(node?.props.backgroundColor).toBe('red');
  });
});

// A class toggled AFTER mount, with no @Input of the Touchable changing. The static cases above
// only prove the anchor merge happens ONCE, at creation - they pass even when the merged style is
// computed a single time and then frozen. These prove it keeps tracking.
//
// `fabric.find` only ever sees a node's FIRST-created props (createNode never re-runs on update),
// so a style that lands after mount only shows up on the live clone in `fabric.committed`.
//
// Scoped to the Touchable's OWN subtree rather than the testID node itself, because the three do
// not agree on where the class-derived style lands: TouchableHighlight and TouchableWithoutFeedback
// fold it onto the same view that carries testID, TouchableOpacity onto the inner AnimatedView leaf
// one level down (mirroring React's, see the static cases above). Searching the subtree covers both
// without weakening the assertion - a global search would match a SIBLING Touchable in this fixture
// and pass while the component under test was still frozen.
function subtreeStyled(testID: string, prop: string): unknown {
  const find = (
    node: IFakeNode,
    predicate: (n: IFakeNode) => boolean,
  ): IFakeNode | undefined => {
    if (predicate(node)) return node;
    for (const child of node.children) {
      const found = find(child, predicate);
      if (found) return found;
    }
    return undefined;
  };
  for (const root of fabric.committed) {
    const owner = find(root, node => node.props.testID === testID);
    if (owner === undefined) continue;
    return find(owner, node => node.props[prop] !== undefined)?.props[prop];
  }
  return undefined;
}

let toggleFixture: TouchableToggleFixture | undefined;

@Component({
  selector: 'symbiote-touchable-toggle-host',
  standalone: true,
  imports: [TouchableHighlight, TouchableOpacity, TouchableWithoutFeedback],
  template: `
    <TouchableHighlight [testID]="'toggle-highlight'" [class.dark]="dark">
      <symbiote-text>Press</symbiote-text>
    </TouchableHighlight>
    <TouchableOpacity [testID]="'toggle-opacity'" [class.dark]="dark">
      <symbiote-text>Press</symbiote-text>
    </TouchableOpacity>
    <TouchableWithoutFeedback [testID]="'toggle-plain'" [class.dark]="dark">
      <symbiote-text>Press</symbiote-text>
    </TouchableWithoutFeedback>
  `,
})
class TouchableToggleFixture {
  dark = false;
  private readonly changeDetector = inject(ChangeDetectorRef);

  constructor() {
    // Captures the live component instance so the test can toggle the class after mount.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    toggleFixture = this;
  }

  enableDark(): void {
    this.dark = true;
    this.changeDetector.markForCheck();
  }
}

describe('a Touchable class toggled after mount', () => {
  // why: TouchableHighlight hands Pressable a STABLE arrow (`[style]="pressedStyle"`). A reference
  // that never changes means Pressable`s style @Input never reports a change, so Pressable never
  // refreshes and never re-invokes the arrow - the anchor`s new class-derived style is read once
  // at creation and then frozen. TouchableOpacity folds its class onto an inner AnimatedView, so
  // it is covered here too; TouchableWithoutFeedback is the control, its getter rebuilds.
  it.each([['toggle-highlight'], ['toggle-plain'], ['toggle-opacity']])(
    'reaches the committed view of %s',
    async testID => {
      registerStyles({ dark: { backgroundColor: 'black' } });

      mount(ROOT_TAG, TouchableToggleFixture);
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      expect(subtreeStyled(testID, 'backgroundColor')).toBeUndefined();

      toggleFixture?.enableDark();
      await new Promise<void>(resolve => setTimeout(resolve, 0));

      expect(subtreeStyled(testID, 'backgroundColor')).toBe('black');
    },
  );

  // toggle-opacity was skipped here for a while: its chain is one hop longer than the other two -
  // its own anchor feeds `animatedStyle`, which reaches the inner AnimatedView as a `[style]`
  // binding, and the committed leaf kept only `{opacity: 1}`. That last hop was the Angular
  // styling-input gap, not an AnimatedView bug: a `[style]` binding shadowed into a directive
  // input never marks the receiving view dirty, so AnimatedView's own template (and its
  // `reducedProps` getter) never re-ran. `SymbioteStyleInputDirective` supplies the missing mark;
  // see render/input-propagation.test.ts for the isolated reproduction.
});

// ---- the RN-accurate press surface (2026-08-19 audit, phase two) -------------------------------
//
// The cases above only exercise the class/anchor merge. Everything the audit changed — the underlay
// state machine, the has-press-handler gate, the press-timing floor, TouchableWithoutFeedback's
// timing machine — was uncovered, so it is pinned here.

// Clone-on-write puts a prop UPDATE only in the committed tree; `fabric.find` sees a node's
// first-created props and would read a repaint that never happened as a pass.
function committedNode(testID: string): IFakeNode | undefined {
  const stack = [...fabric.committed];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) continue;
    if (node.props.testID === testID) return node;
    stack.push(...node.children);
  }
  return undefined;
}

function subtreeProp(testID: string, prop: string): unknown {
  const owner = committedNode(testID);
  if (owner === undefined) return undefined;
  const stack = [owner];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) continue;
    if (node.props[prop] !== undefined) return node.props[prop];
    stack.push(...node.children);
  }
  return undefined;
}

function touchAt(handle: unknown, type: string): void {
  const touch = { identifier: 1, pageX: 5, pageY: 5, timestamp: Date.now() };
  fabric.fireEvent(handle, type, { touches: [touch], changedTouches: [touch] });
}

let underlayHost: UnderlayHost | undefined;

@Component({
  selector: 'symbiote-touchable-underlay-host',
  standalone: true,
  imports: [TouchableHighlight],
  template: `
    <TouchableHighlight
      [testID]="'underlay'"
      [underlayColor]="'blue'"
      (press)="onPress($event)"
      (showUnderlay)="onShowUnderlay()"
      (hideUnderlay)="onHideUnderlay()"
    >
      <symbiote-text>Press</symbiote-text>
    </TouchableHighlight>
    <TouchableHighlight
      [testID]="'decorative'"
      [underlayColor]="'blue'"
      (showUnderlay)="onDecorativeShowUnderlay()"
    >
      <symbiote-text>Look</symbiote-text>
    </TouchableHighlight>
  `,
})
class UnderlayHost {
  onPress = vi.fn();
  onShowUnderlay = vi.fn();
  onHideUnderlay = vi.fn();
  // Subscribed on the DECORATIVE instance, which still has no press handler: showUnderlay is not
  // one of the four callbacks the gate reads, so binding it cannot itself open the gate. Without
  // it the machine-side gate would be invisible - the committed-tree assertion alone is satisfied
  // by the style-side gate on its own.
  onDecorativeShowUnderlay = vi.fn();

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    underlayHost = this;
  }
}

describe('TouchableHighlight underlay', () => {
  // why: the underlay flips a plain signal from a Pressable @Output, and this bootstrap is
  // ZONELESS - a mutation that dirties nothing renders but never repaints. Asserting the committed
  // Fabric tree (not the component field) is what proves the flip actually reached the screen.
  it('paints the underlay on press-in and notifies, under zoneless change detection', async () => {
    mount(ROOT_TAG, UnderlayHost);
    await waitUntil(
      () => committedNode('underlay') !== undefined,
      'the highlight committed',
    );

    touchAt(
      fabric.find(n => n.props.testID === 'underlay')?.instanceHandle,
      'topTouchStart',
    );
    await waitUntil(
      () => committedNode('underlay')?.props.backgroundColor === 'blue',
      'the underlay repainted',
    );
    expect(underlayHost?.onShowUnderlay).toHaveBeenCalledOnce();
  });

  // why: RN holds the underlay for delayPressOut PAST the tap so a press too fast to see still
  // flashes - onPress arms the hide timer and onPressOut then declines to hide. Our engine emits
  // press before pressOut, so the guard transfers verbatim. The synchronous assertion right after
  // the touch dispatch is the whole point: a hide inside pressOut would already have fired.
  it('defers the hide to the delayPressOut timer rather than hiding inside press-out', async () => {
    mount(ROOT_TAG, UnderlayHost);
    await waitUntil(
      () => committedNode('underlay') !== undefined,
      'the highlight committed',
    );
    const handle = fabric.find(
      n => n.props.testID === 'underlay',
    )?.instanceHandle;

    touchAt(handle, 'topTouchStart');
    await waitUntil(
      () => committedNode('underlay')?.props.backgroundColor === 'blue',
      'the underlay repainted',
    );

    touchAt(handle, 'topTouchEnd');
    expect(underlayHost?.onPress).toHaveBeenCalledOnce();
    expect(
      underlayHost?.onHideUnderlay,
      'press-out must not hide while the post-press timer is armed',
    ).not.toHaveBeenCalled();

    await waitUntil(
      () => committedNode('underlay')?.props.backgroundColor !== 'blue',
      'the underlay repainted away on its own timer',
    );
    expect(underlayHost?.onHideUnderlay).toHaveBeenCalledOnce();
  });

  // why: RN's _hasPressHandler - a purely decorative TouchableHighlight must not flash an underlay
  // for a touch merely passing through it. The gate is over THIS component's @Output subscribers,
  // so the same fixture carries both a handled and an unhandled instance.
  it('paints nothing for a TouchableHighlight with no press handler', async () => {
    mount(ROOT_TAG, UnderlayHost);
    await waitUntil(
      () => committedNode('decorative') !== undefined,
      'the decorative highlight committed',
    );

    touchAt(
      fabric.find(n => n.props.testID === 'decorative')?.instanceHandle,
      'topTouchStart',
    );
    await waitUntil(
      () => committedNode('underlay') !== undefined,
      'change detection settled',
    );

    expect(committedNode('decorative')?.props.backgroundColor).toBeUndefined();
    expect(underlayHost?.onDecorativeShowUnderlay).not.toHaveBeenCalled();
    expect(underlayHost?.onShowUnderlay).not.toHaveBeenCalled();
  });
});

let opacityHost: OpacityHost | undefined;

@Component({
  selector: 'symbiote-touchable-opacity-timing-host',
  standalone: true,
  imports: [TouchableOpacity],
  template: `
    <TouchableOpacity
      [testID]="'timed'"
      [style]="restingStyle"
      (pressOut)="onPressOut($event)"
    >
      <symbiote-text>Press</symbiote-text>
    </TouchableOpacity>
  `,
})
class OpacityHost {
  readonly restingStyle = { opacity: 0.6 };
  onPressOut = vi.fn();

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    opacityHost = this;
  }
}

describe('TouchableOpacity press timing', () => {
  // why: RN's _getChildStyleOpacityWithDefault - the Animated.Value must START at the opacity the
  // caller's style asks for, or the first paint jumps to fully opaque. Angular writes @Input()s
  // after the field initializers, so this pins that the first ngOnChanges seeds it BEFORE the first
  // template pass, and seeds it rather than animating (a mount fade would animate away from the
  // value the leaf is about to paint).
  it('seeds the opacity Value from the style, not from a hard 1', async () => {
    mount(ROOT_TAG, OpacityHost);
    await waitUntil(
      () => committedNode('timed') !== undefined,
      'the touchable committed',
    );

    expect(subtreeProp('timed', 'opacity')).toBe(0.6);
  });

  // why: RN's _getChildStyleOpacityWithDefault again, on the OTHER end - the press-out fade settles
  // back at the caller's opacity, not at 1. Only reachable by running the fade to completion, so
  // the frame clock is drained through the committed value rather than a tick count. Watching it
  // dip below the resting value first is what stops the final assertion being vacuous: the value
  // starts at 0.6, so "it is 0.6" only means something after it has demonstrably left.
  it('settles the press-out fade at the style opacity, not at a hard 1', async () => {
    mount(ROOT_TAG, OpacityHost);
    await waitUntil(
      () => committedNode('timed') !== undefined,
      'the touchable committed',
    );
    const handle = fabric.find(n => n.props.testID === 'timed')?.instanceHandle;

    touchAt(handle, 'topTouchStart');
    await waitUntil(
      () => Number(subtreeProp('timed', 'opacity')) < 0.6,
      'the press-in fade started',
    );

    touchAt(handle, 'topTouchEnd');
    await waitUntil(
      () => subtreeProp('timed', 'opacity') === 0.6,
      'the press-out fade settled at the style opacity',
    );
  });

  // why: RN's Touchables override Pressability's 130ms minPressDuration with 0 (TouchableOpacity.js
  // :195), so a release deactivates immediately. Asserting synchronously after the touch dispatch
  // is what discriminates: a 130ms floor would defer this emit behind a timer.
  it('deactivates without Pressability 130ms floor', async () => {
    mount(ROOT_TAG, OpacityHost);
    await waitUntil(
      () => committedNode('timed') !== undefined,
      'the touchable committed',
    );
    const handle = fabric.find(n => n.props.testID === 'timed')?.instanceHandle;

    touchAt(handle, 'topTouchStart');
    await waitUntil(
      () => committedNode('timed') !== undefined,
      'change detection settled',
    );
    touchAt(handle, 'topTouchEnd');

    expect(opacityHost?.onPressOut).toHaveBeenCalledOnce();
  });
});

let plainHost: PlainHost | undefined;

@Component({
  selector: 'symbiote-touchable-plain-timing-host',
  standalone: true,
  imports: [TouchableWithoutFeedback],
  template: `
    <TouchableWithoutFeedback
      [testID]="'plain-timed'"
      [delayPressIn]="40"
      (pressIn)="onPressIn($event)"
    >
      <symbiote-text>Press</symbiote-text>
    </TouchableWithoutFeedback>
  `,
})
class PlainHost {
  onPressIn = vi.fn();

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    plainHost = this;
  }
}

describe('TouchableWithoutFeedback press timing', () => {
  // why: "without feedback" means no VISUAL, not no timing - RN builds a full Pressability config
  // with delayPressIn/delayPressOut there too. A straight passthrough would emit pressIn inside the
  // touch dispatch, which is exactly what the synchronous assertion rules out.
  it('runs the shared timing machine rather than forwarding press-in straight through', async () => {
    mount(ROOT_TAG, PlainHost);
    await waitUntil(
      () => committedNode('plain-timed') !== undefined,
      'the touchable committed',
    );

    touchAt(
      fabric.find(n => n.props.testID === 'plain-timed')?.instanceHandle,
      'topTouchStart',
    );
    expect(
      plainHost?.onPressIn,
      'delayPressIn must defer the emit',
    ).not.toHaveBeenCalled();

    await waitUntil(
      () => (plainHost?.onPressIn.mock.calls.length ?? 0) > 0,
      'press-in emitted after the delay',
    );
  });
});
