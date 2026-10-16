// The two CLONE-folds, and the seam they need — a rule dispatched from the PARENT'S tag.
//
// `TouchableNativeFeedback` and `TouchableWithoutFeedback` render no view of their own. RN's bodies
// end in `cloneElement(child, {…})` (`TouchableNativeFeedback.js:289,339`,
// `TouchableWithoutFeedback.js:229,286`), so our tag commits an ANCHOR and the owner's props land on
// its single child instead. That is the whole primitive, and it WAS a JS `payloadFold` bound onto
// the child at attach time — one crossing per touchable per commit, marshalling eighteen keys off a
// node the child cannot see.
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
//   the owner's props        `ownerProps` — the scroll content rule's seam
//   the owner's aria fold    the engine folds aria at `fabricProps` already
//   `focusable`              `usesTouchableFocusableRule`, ported with the touchables
//   the press listener BIT   `OP_SET_OWNED_LISTENER`, and it is the OWNER'S bit, read off the parent
//   the Android ripple       `#ifdef ANDROID`, the same branch `foldPressableProps` carries
//
// THE PRICE, and this file was written RED on exactly that line. Every payload assertion below
// passed on the first run, through the JS fold; `folds` was the one that did not. Measured
// afterwards on `build-release` (`tag-rule-cost.itest.ts`'s `clone` row): ~13.6 us per cloned child
// per commit, which lands mid-table beside `pressable` and `button` — the cost tracks the size of
// what crosses, and eighteen keys cross here off a node the child cannot see.

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
  // The owner commits nothing, so a name it carries is lost unless it lands on the child
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

  // `cloneElement` assigns every key of its config, so an absent owner label clears the child's
  it('clears a child’s own value the owner does not carry', () => {
    const { child } = nativeFeedback({}, { accessibilityLabel: 'stale' });

    expect(child.accessibilityLabel).toBe(undefined);
  });

  // TWF's passthrough half is copied only when set (`:281`), so TNF's answer does not imply it
  it('copies a set name on the without-feedback tag too', () => {
    const { child } = withoutFeedback({ accessibilityLabel: 'Close' });

    expect(child.accessibilityLabel).toBe('Close');
  });

  // `accessible` defaults on unless the owner writes a literal `false` (`:369-372`)
  it('makes the child accessible unless the owner opts out', () => {
    expect(nativeFeedback({}).child.accessible).toBe(true);
    expect(nativeFeedback({ accessible: false }).child.accessible).toBe(false);
  });

  // `focusable` reads the owner's press listener bit, which lives in no bag
  it('reads the owner’s press listener for focusable', () => {
    expect(nativeFeedback({}, {}, false).child.focusable).toBe(false);
    expect(nativeFeedback({}, {}, true).child.focusable).toBe(true);
    expect(nativeFeedback({ disabled: true }, {}, true).child.focusable).toBe(
      false,
    );
  });

  // A screen reader reads `accessibilityState.disabled`, never the `disabled` prop
  it('folds the owner’s disabled into the child’s accessibilityState', () => {
    const state = nativeFeedback({ disabled: true }).child.accessibilityState;

    expect(
      typeof state === 'object' && state !== null
        ? Reflect.get(state, 'disabled')
        : undefined,
    ).toBe(true);
  });

  // Unlike TNF's unconditional clone, an owner with no `testID` leaves the child's standing
  it('leaves a child’s own value alone when the without-feedback owner carries none', () => {
    const { child } = withoutFeedback({}, { testID: 'mine' });

    expect(child.testID).toBe('mine');
  });

  // The owner is never committed, so the engine's own aria fold never sees its bag
  it('folds the owner’s aria aliases, which the engine’s own fold cannot see', () => {
    const { child } = nativeFeedback({
      'aria-label': 'Close',
      'aria-hidden': true,
    });

    expect(child.accessibilityLabel).toBe('Close');
    expect(child.importantForAccessibility).toBe('no-hide-descendants');
  });

  // Neither clone reads `role` (TNF `:353` takes `accessibilityRole` only)
  it('does not turn the owner’s role into the child’s accessibilityRole', () => {
    expect(nativeFeedback({ role: 'button' }).child.accessibilityRole).toBe(
      undefined,
    );
    expect(withoutFeedback({ role: 'button' }).child.accessibilityRole).toBe(
      undefined,
    );
  });

  // TWF never reads `aria-label` (its aria list is the state, value, live, hidden, modal), TNF does
  it('clones aria-label on the native-feedback tag only', () => {
    expect(nativeFeedback({ 'aria-label': 'x' }).child.accessibilityLabel).toBe(
      'x',
    );
    expect(
      withoutFeedback({ 'aria-label': 'x' }).child.accessibilityLabel,
    ).toBe(undefined);
  });

  it('lets aria-label win over accessibilityLabel on the native-feedback tag', () => {
    expect(
      nativeFeedback({ 'aria-label': 'alias', accessibilityLabel: 'own' }).child
        .accessibilityLabel,
    ).toBe('alias');
  });

  // `routeProp` settles `id` over `nativeID` before the rule sees one name
  it('lands the owner’s id on the child, with id winning', () => {
    const { child } = nativeFeedback({ id: 'from-id', nativeID: 'losing' });

    expect(child.nativeID).toBe('from-id');
  });

  // TWF's passthrough loop (:279-282) overwrites `id ?? nativeID` with the raw `nativeID`
  it('lands the owner’s nativeID on the without-feedback child, with nativeID winning', () => {
    const { child } = withoutFeedback({
      id: 'losing',
      nativeID: 'from-native-id',
    });

    expect(child.nativeID).toBe('from-native-id');
  });

  // `getBackgroundProp` is null off Android (`:402`); the Android half is `#ifdef`, built elsewhere
  it('writes no Android background off Android', () => {
    const { child } = nativeFeedback({ useForeground: true });

    expect(child.nativeBackgroundAndroid).toBe(undefined);
    expect(child.nativeForegroundAndroid).toBe(undefined);
  });

  // `markPropsDirty` bubbles up, so the child is re-folded only because `SLOT_DERIVED` dirties it
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

  // `hitSlop` probes the `SLOT_DERIVED_ALL` wildcard, a named list would forget keys silently
  it('dirties the child on a late write of any cloned key', () => {
    const surface = createSurface(ROOT_TAG);
    const owner: ISymbioteNode = createElement(
      '#anchor',
      false,
      'touchable-native-feedback',
    );
    const child: ISymbioteNode = createElement('RCTView', false, 'view');
    appendChild(owner, child);
    surface.appendChild(owner);
    surface.commit();
    mounted();

    routeProp(owner, 'hitSlop', 8);
    surface.commit();
    mounted();

    expect(committedPayloadOf(child)?.hitSlop).toBe(8);
  });

  // A listener flip changes no prop, only `onOwnedListenerChange` can dirty the child for it
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

  // The rule runs in C++, so no fold trips into JS per touchable per commit
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
