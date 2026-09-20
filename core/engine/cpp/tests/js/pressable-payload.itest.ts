// Pressable's prop semantics, in the engine — the second behavior fold to move to C++, and the one
// that needed a new wire slot to move at all.
//
// WHY IT COULD NOT MOVE THE WAY TEXT-INPUT DID. That rule keys off the Fabric view name, which was
// already crossing: `RCTSinglelineTextInputView` names itself. A pressable commits as `RCTView`,
// byte-identical to a plain view, so nothing on this side of the wire could tell the two apart. The
// missing fact is the TAG — `pressable` — which JS knew at `createElement` and kept to itself.
//
// So the tag now crosses, once, from `attachHostBehavior` (`OP_SET_TAG`), for the nodes a behavior
// actually attached to and no others. That is the browser's arrangement rather than a workaround: an
// element knows what tag it is, and its user-agent behavior follows from that and not from the view
// its layout engine happens to allocate.
//
// WHAT MOVED — the UA half, by the same criterion the text-input port used. `disabled` announcing
// itself through `accessibilityState`, `accessible`/`focusable` defaulting on, the Android ripple
// config becoming a native background, and the nine props the press machine reads being kept OUT of
// a payload no ViewConfig declares. Every one is a property of the PLATFORM: RN does it for every
// Pressable in every app, and `Pressable.js` is where each line comes from.
//
// WHAT STAYED IN JS — the machine. Timers, the responder claim, hit-slop retention, the press
// callbacks. Gesture rate, app callbacks, exactly where a browser keeps them.
//
// NO TWIN: `fabric-props.ts` gets no copy, and `pressable.ts` keeps no `foldPayload`. This file is
// the whole contract, read off `committedPayloadOf` — the payload the commit actually sent.
//
// THE COST ASSERTION IS PART OF IT: `foldsFound` must be 0. Two Pressables sit in every benchmark
// row, so this is twice the per-row trip the text-input port removed.
//
// WHAT CAME HERE, so nothing reads as dropped. `core/components/src/behaviors/tag-prop-folds.test.ts`
// (deleted — with text-input gone one commit earlier there was nothing else in it) and
// `core/components/src/behaviors/ripple-android.test.ts` (deleted — it mocked `Platform.OS` to
// reach a JS function that no longer exists; see the ripple case for the Android gap that leaves).

import {
  registerButtonBehavior,
  registerPressableBehavior,
  registerTouchableOpacityBehavior,
} from '@symbiote-native/components';

import {
  committedPayloadOf,
  createElement,
  createSurface,
  readSurfaceTelemetry,
  setProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { describe, expect, it, mounted, print, report } from './harness';

const ROOT_TAG = 1;
// PRODUCTION SHAPE — the Fabric view name as the component, the intrinsic tag beside it. Passing
// the tag as the component would match the behavior registry by accident and leave every case green
// over a registration that can never fire in an app.
const PRESSABLE_VIEW = 'RCTView';

registerPressableBehavior();
// The two tags that COMPOSE this rule rather than being it. Registered here because the tag only
// reaches the host when a behavior attaches — an unregistered tag emits no `OP_SET_TAG`, so the
// rule would correctly not fire and the case would pass by measuring nothing.
registerTouchableOpacityBehavior();
registerButtonBehavior();

type ICommitted = {
  readonly payload: Readonly<Record<string, unknown>>;
  readonly folds: number;
};

function commit(tag: string, props: Record<string, unknown>): ICommitted {
  const surface = createSurface(ROOT_TAG);
  const node: ISymbioteNode = createElement(PRESSABLE_VIEW, false, tag);
  for (const [name, value] of Object.entries(props)) setProp(node, name, value);
  surface.appendChild(node);
  surface.commit();
  mounted();

  const payload = committedPayloadOf(node);
  if (payload === undefined)
    throw new Error('the pressable committed no payload');
  return { payload, folds: readSurfaceTelemetry(ROOT_TAG)?.foldsFound ?? 0 };
}

const pressable = (props: Record<string, unknown>): ICommitted =>
  commit('pressable', props);

// Field by field is how the a11y state is read throughout this file: the harness compares by
// serialisation and a `folly::dynamic` object does not preserve the authored key order, so a
// whole-object match would be asserting the host's hash order.
function fieldsOf(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object') {
    throw new Error('the payload carried no accessibilityState object');
  }
  return { ...value };
}

describe('what a pressable sends native, resolved by the engine', () => {
  // why: THE PRICE. Every case below would pass just as well with the rule still in a JS closure;
  // this is the one that says it moved.
  it('costs no trip into JS at all', () => {
    const plain = pressable({ testID: 'subject' });
    print(`DEBUG pressable folds=${plain.folds}`);
    expect(plain.folds).toBe(0);

    // And still zero when every prop the rule reads is present — the case a gate could not have
    // covered, since the work is real here and simply happens on this side of the wire.
    const loaded = pressable({
      disabled: true,
      accessibilityState: { selected: true },
      android_ripple: { color: '#ff0000' },
      delayLongPress: 700,
    });
    expect(loaded.folds).toBe(0);
  });

  // why: `disabled` reaches a screen reader ONLY as `accessibilityState.disabled` — it is not a
  // native View prop. Pressable.js:257. Lowering once dropped this fold and nothing went red: press
  // suppression kept working off the node's own prop, so a disabled button behaved correctly and
  // announced itself as enabled.
  it('announces a disabled button as disabled', () => {
    const payload = pressable({ disabled: true }).payload;

    expect(payload.accessibilityState).toEqual({ disabled: true });
  });

  // why: RN merges rather than replaces — `{...accessibilityState, disabled}` — so an app that set
  // its own state keeps it.
  it('merges into an accessibilityState the app already set', () => {
    const state = fieldsOf(
      pressable({ disabled: true, accessibilityState: { selected: true } })
        .payload.accessibilityState,
    );

    expect(state.selected).toBe(true);
    expect(state.disabled).toBe(true);
  });

  // why: `disabled != null` is the gate, so a pressable that never mentions it must not grow the
  // key. An unconditional write would put `accessibilityState` on every pressable in the tree.
  it('leaves accessibilityState alone when nothing is disabled', () => {
    const payload = pressable({ testID: 'subject' }).payload;

    // Absence, not an undefined value: this payload crossed as JSON, so a key either carries a
    // value or is not there — the two cannot be confused here.
    expect(payload.accessibilityState).toBe(undefined);
  });

  // why: an explicit `disabled: false` is still a value RN forwards — it is `!= null` that decides,
  // not truthiness, and a screen reader reading "enabled" is a real announcement.
  it('announces an explicitly enabled button too', () => {
    const payload = pressable({ disabled: false }).payload;

    expect(payload.accessibilityState).toEqual({ disabled: false });
  });

  // why: the props the press MACHINE reads are not native props. A wrapper dropped them by
  // destructuring; a tag has no destructure, so each one rode into the payload as a key no
  // ViewConfig declares — wire slot, interned string and hashed RawProps entry, per pressable.
  it('does not send the props only the machine reads', () => {
    const payload = pressable({
      disabled: true,
      cancelable: false,
      delayLongPress: 700,
      minPressDuration: 130,
      unstable_pressDelay: 50,
      pressRetentionOffset: 20,
      delayHoverIn: 10,
      delayHoverOut: 20,
      android_ripple: { color: '#ff0000' },
      android_disableSound: true,
      blockNativeResponder: true,
    }).payload;
    print(`payload keys: ${Object.keys(payload).sort().join(' ')}`);

    for (const key of [
      'disabled',
      'cancelable',
      'delayLongPress',
      'minPressDuration',
      'unstable_pressDelay',
      'pressRetentionOffset',
      'delayHoverIn',
      'delayHoverOut',
      'android_ripple',
      'android_disableSound',
      'blockNativeResponder',
    ]) {
      expect(payload[key]).toBe(undefined);
    }
  });

  // why: `hitSlop` sits next to `pressRetentionOffset` in the same prop family and is the opposite
  // case — a real native View prop Fabric reads. Stripping it with its neighbours would be
  // invisible until a touch landed a few points outside the frame.
  it('keeps hitSlop, which the platform reads and the machine does not own', () => {
    const payload = pressable({
      hitSlop: 12,
      pressRetentionOffset: 20,
    }).payload;

    expect(payload.hitSlop).toBe(12);
  });

  // why: RN makes every pressable accessible unless the app opts OUT — Pressable.js:252,
  // `accessible: accessible !== false`. Nothing in this repo did it until 2026-09-09, so a Pressable
  // reached a screen reader as a plain view unless the app wrote the prop.
  it('is accessible unless the app opts out', () => {
    expect(pressable({}).payload.accessible).toBe(true);
    expect(pressable({ accessible: false }).payload.accessible).toBe(false);
    // `!== false`, not `?? true`: only a literal false opts out.
    expect(pressable({ accessible: true }).payload.accessible).toBe(true);
  });

  // why: Pressable.js:258, the same shape. We computed `focusable` nowhere until 2026-09-09, so a
  // keyboard, a TV remote or switch control could land on a control it could not press.
  it('is focusable unless the app opts out', () => {
    expect(pressable({}).payload.focusable).toBe(true);
    expect(pressable({ focusable: false }).payload.focusable).toBe(false);
  });

  // why: `Pressable.js:340` renders its View with `collapsable={false}`, unconditionally — a plain
  // View with no distinguishing paint props is Yoga's to flatten out of the native tree, which a
  // touch target cannot survive. `usePressability`'s responder wiring is invisible to that decision,
  // so the flag is the only thing standing between an unstyled Pressable and a dropped touch target.
  it('stays out of Yoga flattening, unconditionally', () => {
    expect(pressable({}).payload.collapsable).toBe(false);
  });

  // why: the whole reason there are TWO focusable formulas rather than one. Pressable's has no
  // press-handler and no disabled leg — a disabled Pressable with no callback STAYS in the focus
  // order — so collapsing it onto the Touchable* formula would silently drop it out. Travelled
  // here from `core/components/src/behaviors/pressable.test.ts`.
  it('keeps a disabled pressable in the focus order', () => {
    expect(pressable({ disabled: true }).payload.focusable).toBe(true);
  });

  // why: a Touchable composing this tag has already resolved its own three-leg formula and passes
  // the answer down as `focusable`. `!== false` leaves a computed `true` alone and honours a
  // computed `false` — which is what lets the two compose without either knowing about the other.
  it('honours a focusable a composing touchable computed', () => {
    expect(
      pressable({ focusable: false, disabled: true }).payload.focusable,
    ).toBe(false);
  });

  // why: the ripple is Android's, so this host — which is not Android — must strip the config
  // WITHOUT a native background appearing. That the branch is a branch and not a default.
  //
  // AND THE GAP THIS LEAVES IS REAL, recorded rather than hidden: the Android SIDE of the branch is
  // `#ifdef ANDROID` and cannot be reached from this build at all, so the shape of
  // `nativeBackgroundAndroid` is now asserted nowhere headless. It used to be —
  // `core/components/src/behaviors/ripple-android.test.ts` mocked `Platform.OS` and read the
  // payload — and that file went with the rule, because what it mocked was a JS function that no
  // longer exists.
  //
  // The same gap already applies to the text-input port's `underlineColorAndroid` default and its
  // `search` keyboard split, which is what makes it a PROPERTY of porting a platform-split rule
  // rather than a mistake in this one: a compile-time branch is only testable in a build that
  // compiles it. Closing it means an Android arm of the test host, not a mock.
  it('resolves no android background off Android', () => {
    const payload = pressable({
      android_ripple: { color: '#ff0000', borderless: true },
    }).payload;

    expect(payload.nativeBackgroundAndroid).toBe(undefined);
    expect(payload.nativeForegroundAndroid).toBe(undefined);
  });

  // why: a `<touchable-opacity>` is a pressable plus a fade, and it COMPOSED this rule in JS —
  // `press.foldPayload(props)` was the first line of its own fold. The composition is now a name on
  // the engine's tag list, and the thing that would break silently is a tag falling off that list:
  // the payload stays plausible and a disabled control simply stops announcing itself.
  it('serves touchable-opacity, which composes the same rule', () => {
    const payload = commit('touchable-opacity', {
      disabled: true,
      delayLongPress: 700,
    }).payload;

    expect(payload.accessibilityState).toEqual({ disabled: true });
    expect(payload.accessible).toBe(true);
    expect(payload.delayLongPress).toBe(undefined);
  });

  // why: and a `<button>` is a touchable plus a label — TouchableOpacity on iOS, a
  // TouchableNativeFeedback on Android (Button.js:283), so the rule applies on both. Button keeps a
  // JS fold of its own for the half that IS Button's (the role, the greyed label, the styled view),
  // which is why `folds` is not asserted here and is asserted for `pressable`.
  //
  // `focusable` is Button's own three-leg answer overriding this rule's plain one, which is RN's
  // composition exactly: TouchableOpacity.js:336 requires a press handler, and this one has none.
  it('serves button, whose own fold runs over it', () => {
    const payload = commit('button', {
      disabled: true,
      cancelable: false,
    }).payload;

    expect(payload.accessibilityState).toEqual({ disabled: true });
    expect(payload.accessibilityRole).toBe('button');
    expect(payload.accessible).toBe(true);
    expect(payload.cancelable).toBe(undefined);
    expect(payload.focusable).toBe(false);
  });

  // why: RN's Button pins its role AFTER the caller's props so a caller cannot announce it as
  // something else — but it does NOT seize the other two. `accessible` passes through and the
  // touchable defaults it (`accessible !== false`, TouchableOpacity.js:303), so an explicit false
  // survives; the state MERGES, keeping busy/checked/expanded/selected and overriding only
  // `disabled` (Button.js:333-338). Travelled from `adapters/solid/src/button-tag.test.tsx`, which
  // once asserted the divergence here rather than catching it.
  it('lets a button caller keep its own accessible and a11y state', () => {
    const payload = commit('button', {
      disabled: true,
      accessibilityRole: 'link',
      accessible: false,
      accessibilityState: { busy: true },
    }).payload;

    expect(payload.accessibilityRole).toBe('button');
    expect(payload.accessible).toBe(false);
    expect(fieldsOf(payload.accessibilityState).busy).toBe(true);
    expect(fieldsOf(payload.accessibilityState).disabled).toBe(true);
  });

  // why: THE CONTROL. Every `not.toContain` above would be satisfied by a payload with no rule at
  // all, so pin that the same props on a tag carrying no behavior are untouched. This is what makes
  // the folds attributable to the tag rather than to something the engine does for every node.
  it('folds nothing on a tag with no behavior', () => {
    const payload = commit('view', {
      disabled: true,
      cancelable: false,
    }).payload;

    expect(payload.disabled).toBe(true);
    expect(payload.cancelable).toBe(false);
    expect(payload.accessibilityState).toBe(undefined);
    expect(payload.accessible).toBe(undefined);
  });
});

report();
