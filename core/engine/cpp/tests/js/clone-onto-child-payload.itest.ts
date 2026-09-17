// The two CLONE-folds, and the seam they need — a rule dispatched from the PARENT'S tag.
//
// `TouchableNativeFeedback` and `TouchableWithoutFeedback` render no view of their own. RN's bodies
// end in `cloneElement(child, {…})` (`TouchableNativeFeedback.js:289,339`,
// `TouchableWithoutFeedback.js:229,286`), so our tag commits an ANCHOR and the owner's props land on
// its single child instead. That is the whole primitive, and it is a JS `payloadFold` bound onto the
// child at attach time — one crossing per touchable per commit, with a ~40-key bag.
//
// WHY IT COULD NOT MOVE THE WAY THE OTHER RULES DID, and why it can now.
//
// Every ported rule so far keys off the node's OWN tag. `recordSetTag` writes that tag and
// `attachHostBehavior` alone emits it, so the child of a TNF — whatever the app wrote there — has a
// tag only if it is one of OUR primitives, and most often carries none at all. A `<view>` child
// resolves to an empty `tagName` and no rule fires. Giving the child the OWNER's tag was the obvious
// route and it is wrong: the child may already own a tag (`<pressable>`), and a node has one.
//
// So the dispatch is keyed on the PARENT'S tag instead, which is a shape the browser has rather than
// a workaround: a user-agent stylesheet is full of descendant rules (`td > *`), and an element's
// user-agent behaviour has always been allowed to depend on what contains it. The tree lives in C++,
// so the parent is a pointer hop — the same argument `ownerProps` already made for reading the
// parent's PROPS, applied one step further to reading its NAME.
//
// WHAT THE RULE NEEDS, all of which already crosses:
//
//   the owner's props        `ownerProps`, since 2026-09-18 — the scroll content rule's seam
//   the owner's aria fold    the engine folds aria at `fabricProps` already
//   `focusable`              `usesTouchableFocusableRule`, ported with the touchables
//   the press listener BIT   `OP_SET_OWNED_LISTENER`, and it is the OWNER'S bit, read off the parent
//   the Android ripple       `#ifdef ANDROID`, the same branch `foldPressableProps` carries
//
// THE PRICE THIS FILE IS RED ABOUT. The payload assertions below pass today, through the JS fold.
// `folds` is the assertion that does not: a child under either touchable costs one crossing per
// commit, for a bag of forty keys, which by `tag-rule-cost.itest.ts`'s column is the worst value
// available — the price tracks BAG SIZE and not what the rule does.

import {
  registerTouchableNativeFeedbackBehavior,
  registerTouchableWithoutFeedbackBehavior,
} from '@symbiote-native/components';

import {
  appendChild,
  committedPayloadOf,
  createElement,
  createSurface,
  readSurfaceTelemetry,
  routeProp,
  setEventListener,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { describe, expect, it, mounted, print, report } from './harness';

const ROOT_TAG = 1;

registerTouchableNativeFeedbackBehavior();
registerTouchableWithoutFeedbackBehavior();

type ICommitted = {
  readonly child: Readonly<Record<string, unknown>>;
  readonly folds: number;
};

/**
 * One touchable with one plain `<view>` under it — the shape an app writes, and the shape that has
 * no tag of its own for a rule to key on.
 *
 * `routeProp`, never `setProp`: the owner's bag crosses the write seam (the `id` rename, the class
 * merge) before any of this, and a fixture that skips it tests a path no adapter takes.
 */
function commit(
  tag: string,
  ownerProps: Record<string, unknown>,
  childProps: Record<string, unknown> = {},
  hasPress = false,
): ICommitted {
  const surface = createSurface(ROOT_TAG);
  const owner: ISymbioteNode = createElement('#anchor', false, tag);
  for (const [name, value] of Object.entries(ownerProps))
    routeProp(owner, name, value);
  if (hasPress) setEventListener(owner, 'press', () => {});

  const child: ISymbioteNode = createElement('RCTView', false, 'view');
  for (const [name, value] of Object.entries(childProps))
    routeProp(child, name, value);

  appendChild(owner, child);
  surface.appendChild(owner);
  surface.commit();
  mounted();

  const payload = committedPayloadOf(child);
  if (payload === undefined)
    throw new Error(`${tag}: the child committed nothing`);
  return {
    child: payload,
    folds: readSurfaceTelemetry(ROOT_TAG)?.foldsFound ?? 0,
  };
}

const nativeFeedback = (
  ownerProps: Record<string, unknown>,
  childProps?: Record<string, unknown>,
  hasPress?: boolean,
): ICommitted =>
  commit('touchable-native-feedback', ownerProps, childProps, hasPress);

const withoutFeedback = (
  ownerProps: Record<string, unknown>,
  childProps?: Record<string, unknown>,
  hasPress?: boolean,
): ICommitted =>
  commit('touchable-without-feedback', ownerProps, childProps, hasPress);

describe('what the owner clones onto its child', () => {
  // why: the headline. The owner is an anchor and commits nothing, so a name it carries is LOST
  // unless it arrives here — this is what the primitive is.
  it('carries the owner’s accessibility names down to the child', () => {
    const { child } = nativeFeedback({
      accessibilityLabel: 'Close',
      accessibilityHint: 'Dismisses the sheet',
      testID: 'sheet-close',
    });

    expect(child.accessibilityLabel).toBe('Close');
    expect(child.accessibilityHint).toBe('Dismisses the sheet');
    expect(child.testID).toBe('sheet-close');
  });

  // why: RN's `cloneElement` assigns EVERY key of its config, so an owner with no
  // `accessibilityLabel` CLEARS the child's. A fold that only ever added would leave the child's own
  // value standing, which reads as "the clone worked" on every case above.
  it('clears a child’s own value the owner does not carry', () => {
    const { child } = nativeFeedback({}, { accessibilityLabel: 'stale' });

    expect(child.accessibilityLabel).toBe(undefined);
  });

  // why: the same rule on the other tag, asked separately. TWF's clone list is NOT TNF's — its
  // passthrough half is copied only when SET (`:281`) — so one answer does not imply the other.
  it('copies a set name on the without-feedback tag too', () => {
    const { child } = withoutFeedback({ accessibilityLabel: 'Close' });

    expect(child.accessibilityLabel).toBe('Close');
  });

  // why: `accessible` defaults ON unless the app opts out with a literal `false` (`:369-372`), and
  // it is the OWNER's prop that decides — the child never saw it.
  it('makes the child accessible unless the owner opts out', () => {
    expect(nativeFeedback({}).child.accessible).toBe(true);
    expect(nativeFeedback({ accessible: false }).child.accessible).toBe(false);
  });

  // why: `focusable`'s middle leg is the OWNER's press listener, which is a name the behavior owns
  // and therefore lives in no bag. It is the parent's bit that decides, not the child's — the case
  // that makes this a parent-keyed rule rather than a self-keyed one.
  it('reads the owner’s press listener for focusable', () => {
    expect(nativeFeedback({}, {}, false).child.focusable).toBe(false);
    expect(nativeFeedback({}, {}, true).child.focusable).toBe(true);
    expect(nativeFeedback({ disabled: true }, {}, true).child.focusable).toBe(
      false,
    );
  });

  // why: a screen reader reads `accessibilityState.disabled`, never the `disabled` prop, and the
  // owner's `disabled` has to reach the child's state or a disabled touchable announces as enabled.
  it('folds the owner’s disabled into the child’s accessibilityState', () => {
    const state = nativeFeedback({ disabled: true }).child.accessibilityState;

    expect(
      typeof state === 'object' && state !== null
        ? Reflect.get(state, 'disabled')
        : undefined,
    ).toBe(true);
  });

  // why: the OTHER half of TWF's split, and it is the half a shared rule would quietly lose. Its
  // passthrough keys are copied only when SET, so an owner with no `testID` leaves the child's
  // standing — where TNF's unconditional clone erases it. Asserted beside its TNF twin above
  // because the two look like one rule and are not.
  it('leaves a child’s own value alone when the without-feedback owner carries none', () => {
    const { child } = withoutFeedback({}, { testID: 'mine' });

    expect(child.testID).toBe('mine');
  });

  // why: the owner's aria props are on a node that is never committed, so `fabricProps`'s own aria
  // fold — which reads the node being committed — can never see them. The rule folds the OWNER's bag
  // before cloning, and without that an `aria-label` on a touchable reaches nothing at all.
  it('folds the owner’s aria aliases, which the engine’s own fold cannot see', () => {
    const { child } = nativeFeedback({
      'aria-label': 'Close',
      'aria-hidden': true,
    });

    expect(child.accessibilityLabel).toBe('Close');
    expect(child.importantForAccessibility).toBe('no-hide-descendants');
  });

  // why: `id` is the W3C alias and beats a `nativeID` written beside it. `routeProp` settles that on
  // the way in, so what the rule sees is one name — this asserts the two seams compose, which is the
  // only place they can be seen together.
  it('lands the owner’s id on the child, with id winning', () => {
    const { child } = nativeFeedback({ id: 'from-id', nativeID: 'losing' });

    expect(child.nativeID).toBe('from-id');
  });

  // why: NO RIPPLE OFF ANDROID. `getBackgroundProp` returns null there (`:402`), and the rule's
  // Android half is `#ifdef ANDROID` — so this host, which is not Android, must write neither slot.
  // The positive half of that branch is NOT reachable here and is recorded as the gap it is: a
  // compile-time branch is only testable in a build that compiles it, the same hole
  // `android_ripple` and `decelerationRate` already carry.
  it('writes no Android background off Android', () => {
    const { child } = nativeFeedback({ useForeground: true });

    expect(child.nativeBackgroundAndroid).toBe(undefined);
    expect(child.nativeForegroundAndroid).toBe(undefined);
  });

  // why: THE OWNER'S WRITE HAS TO REACH THE CHILD, and nothing makes it on its own — `markPropsDirty`
  // bubbles UP, so a prop written on the owner after mount dirties the owner and stops. The rule
  // runs on the CHILD'S commit, so a child nothing dirtied is never re-folded and keeps the payload
  // it mounted with. `SLOT_DERIVED` is what closes that, and this is what witnesses it.
  //
  // It moved here from the behavior's own vitest file with the rule: the dirtying is still JS, but
  // the only way to SEE it is the payload the rule produces.
  it('re-clones when an owner prop changes after mount', () => {
    const surface = createSurface(ROOT_TAG);
    const owner: ISymbioteNode = createElement(
      '#anchor',
      false,
      'touchable-native-feedback',
    );
    routeProp(owner, 'accessibilityLabel', 'Before');
    const child: ISymbioteNode = createElement('RCTView', false, 'view');
    appendChild(owner, child);
    surface.appendChild(owner);
    surface.commit();
    mounted();
    expect(committedPayloadOf(child)?.accessibilityLabel).toBe('Before');

    routeProp(owner, 'accessibilityLabel', 'After');
    surface.commit();
    mounted();
    expect(committedPayloadOf(child)?.accessibilityLabel).toBe('After');
  });

  // why: the LISTENER half of the same thing, and it needs its own case because a listener flip
  // changes no prop — `onOwnedListenerChange` is the only thing that can dirty the child for it.
  // Without that the bit crosses, the rule would read it, and the rule never runs.
  it('re-clones focusable when a press listener is wired after mount', () => {
    const surface = createSurface(ROOT_TAG);
    const owner: ISymbioteNode = createElement(
      '#anchor',
      false,
      'touchable-without-feedback',
    );
    const child: ISymbioteNode = createElement('RCTView', false, 'view');
    appendChild(owner, child);
    surface.appendChild(owner);
    surface.commit();
    mounted();
    expect(committedPayloadOf(child)?.focusable).toBe(false);

    setEventListener(owner, 'press', () => {});
    surface.commit();
    mounted();
    expect(committedPayloadOf(child)?.focusable).toBe(true);
  });

  // why: THE PRICE, and the reason this file is written. One crossing per touchable per commit for
  // a forty-key bag — `tag-rule-cost.itest.ts` prices a fold by the size of what it marshals, so
  // this is the most expensive fold still standing.
  it('costs the child no trip into JS', () => {
    const feedback = nativeFeedback({ accessibilityLabel: 'Close' });
    print(`DEBUG touchable-native-feedback child folds=${feedback.folds}`);
    expect(feedback.folds).toBe(0);

    const plain = withoutFeedback({ accessibilityLabel: 'Close' });
    print(`DEBUG touchable-without-feedback child folds=${plain.folds}`);
    expect(plain.folds).toBe(0);
  });
});

report();
