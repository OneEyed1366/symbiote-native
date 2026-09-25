// Switch's prop semantics, in the engine — the third behavior fold to move, and the first whose
// authored names are ALL invented. `trackColor`, `thumbColor` and `ios_backgroundColor` are not
// Fabric props at all: RN's Switch view declares `onTintColor`/`tintColor` on iOS,
// `trackColorFor*`/`trackTintColor` on Android, plus `thumbTintColor` on both. A wrapper body took
// those per-platform NAMES from an adapter-supplied table; a tag has no adapter to ask.
//
// So this is UA behavior by the same criterion as the two before it — `Switch.js` does it for every
// Switch in every app, and the answer depends only on the tag and the platform.
//
// WHAT STAYED IN JS: the machine. The snap-back handshake — native reports a toggle, the app either
// accepts it or does not, and a microtask later the disagreement is corrected with an imperative
// command. That reads app state and calls back into app code, so it stays where a browser keeps it.
//
// NO TWIN: `switch.ts` keeps no `foldPayload`, and `fabric-props.ts` gets no copy.

import { registerSwitchBehavior } from '@symbiote-native/components';

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
// THE PLATFORM BRANCH IS THE VIEW NAME, not a compile-time macro, and that is what makes both
// halves of this file possible. A switch commits as `Switch` on iOS and `AndroidSwitch` on
// Android — genuinely two native components with two prop surfaces — and the name is already on
// the wire. So the rule reads it, and a test can ask for either.
//
// The ripple in `foldPressableProps` is `#ifdef ANDROID` precisely because it has no such tell: an
// `android_ripple` sits on an `RCTView` like any other view's props do.
const SWITCH_VIEW = 'Switch';
const ANDROID_SWITCH_VIEW = 'AndroidSwitch';

registerSwitchBehavior();

type ICommitted = {
  readonly payload: Readonly<Record<string, unknown>>;
  readonly folds: number;
};

function commitTo(view: string, props: Record<string, unknown>): ICommitted {
  const surface = createSurface(ROOT_TAG);
  const node: ISymbioteNode = createElement(view, false, 'switch');
  for (const [name, value] of Object.entries(props)) setProp(node, name, value);
  surface.appendChild(node);
  surface.commit();
  mounted();

  const payload = committedPayloadOf(node);
  if (payload === undefined) throw new Error('the switch committed no payload');
  return { payload, folds: readSurfaceTelemetry(ROOT_TAG)?.foldsFound ?? 0 };
}

const commit = (props: Record<string, unknown>): ICommitted =>
  commitTo(SWITCH_VIEW, props);
const commitAndroid = (props: Record<string, unknown>): ICommitted =>
  commitTo(ANDROID_SWITCH_VIEW, props);

describe('what a switch sends native, resolved by the engine', () => {
  // why: THE PRICE. Every case below would pass with the rule still in a JS closure; this is the
  // one that says it moved.
  it('costs no trip into JS at all', () => {
    const plain = commit({ value: true });
    print(`DEBUG switch folds=${plain.folds}`);
    print(`payload keys: ${Object.keys(plain.payload).sort().join(' ')}`);
    expect(plain.folds).toBe(0);

    const loaded = commit({
      value: true,
      trackColor: { false: '#ff0000', true: '#00ff00' },
      thumbColor: '#0000ff',
      ios_backgroundColor: '#123456',
    });
    expect(loaded.folds).toBe(0);
  });

  // why: `value === true`, not a passthrough. Switch.js:280 coerces on both platforms, because the
  // native prop is a boolean and an authored `undefined` must read as OFF rather than as "no value"
  // — an uncontrolled switch that paints on is worse than one that paints off.
  it('coerces the value to a real boolean', () => {
    expect(commit({ value: true }).payload.value).toBe(true);
    expect(commit({ value: false }).payload.value).toBe(false);
    expect(commit({}).payload.value).toBe(false);
    expect(commit({ value: 'yes' }).payload.value).toBe(false);
  });

  // why: the three authored names are the whole reason this fold exists, and none of them is a
  // Fabric prop. Leaving one in the payload is how a reader concludes the fold ran when it did not.
  it('does not send the authored names, which native does not know', () => {
    const payload = commit({
      value: true,
      trackColor: { false: '#ff0000', true: '#00ff00' },
      thumbColor: '#0000ff',
      ios_backgroundColor: '#123456',
    }).payload;

    expect(payload.trackColor).toBe(undefined);
    expect(payload.thumbColor).toBe(undefined);
    expect(payload.ios_backgroundColor).toBe(undefined);
  });

  // why: Switch.js:264,278 — on iOS the track colours become `onTintColor` (the ON track) and
  // `tintColor` (the OFF track). Getting them the wrong way round paints a switch that reads as its
  // own opposite, which no test of shape would notice.
  it('resolves the track colours onto the iOS names', () => {
    const payload = commit({
      value: true,
      trackColor: { false: '#ff0000', true: '#00ff00' },
    }).payload;

    expect(payload.onTintColor).toBe(0xff_00_ff_00);
    expect(payload.tintColor).toBe(0xff_ff_00_00);
  });

  // why: Switch.js:279 — `thumbColor` is the authored name and `thumbTintColor` the native one, on
  // both platforms. The one rename that is NOT platform-split.
  it('renames thumbColor to the native thumbTintColor', () => {
    const payload = commit({ value: false, thumbColor: '#0000ff' }).payload;

    expect(payload.thumbTintColor).toBe(0xff_00_00_ff);
  });

  // why: Switch.js:266-276 — `ios_backgroundColor` is not a prop, it is a STYLE. RN composes it as
  // a background plus a 16pt radius so the pill shows through the translucent track.
  it('folds ios_backgroundColor into the style, with RN s radius', () => {
    const payload = commit({
      value: false,
      style: { margin: 4 },
      ios_backgroundColor: '#123456',
    }).payload;

    expect(payload.margin).toBe(4);
    expect(payload.backgroundColor).toBe(0xff_12_34_56);
    expect(payload.borderRadius).toBe(16);
  });

  // why: and it must not invent one when the app did not ask. A switch with no
  // `ios_backgroundColor` has no background of its own — the track is the control.
  it('adds no background when none was authored', () => {
    const payload = commit({ value: false, style: { margin: 4 } }).payload;

    expect(payload.backgroundColor).toBe(undefined);
    expect(payload.borderRadius).toBe(undefined);
  });

  // why: `Switch.js:255` and `:293` — `accessibilityRole={props.accessibilityRole ?? 'switch'}`, on
  // BOTH platforms. Without it a screen reader announces the control as a plain view, with nothing
  // visual to notice: the same silent class of gap `accessible`/`focusable` were on Pressable.
  // Found by reading `Switch.js` to port the rule.
  it('announces itself as a switch, unless the app says otherwise', () => {
    expect(commit({ value: true }).payload.accessibilityRole).toBe('switch');
    expect(commitAndroid({ value: true }).payload.accessibilityRole).toBe(
      'switch',
    );
    // `??`, not an override: an app that calls it a checkbox keeps its answer.
    expect(
      commit({ value: true, accessibilityRole: 'checkbox' }).payload
        .accessibilityRole,
    ).toBe('checkbox');
  });

  // why: `Switch.js:266` composes `{alignSelf: 'flex-start'}` UNDER the app's style, so a stock iOS
  // Switch keeps its intrinsic width instead of stretching to its container's cross axis. Ours
  // stretched. UNDER is the whole of it — an app that writes `alignSelf: 'stretch'` must still win.
  it('keeps an iOS switch from stretching, without overriding the app', () => {
    expect(commit({ value: true }).payload.alignSelf).toBe('flex-start');
    expect(
      commit({ value: true, style: { alignSelf: 'stretch' } }).payload
        .alignSelf,
    ).toBe('stretch');
  });

  // why: the iOS composition is iOS's. `Switch.js:263-281` is the `else` branch — Android's `style`
  // is the app's, untouched, and `ios_backgroundColor` is not read there at all.
  it('composes neither the pill nor alignSelf on Android', () => {
    const payload = commitAndroid({
      value: true,
      style: { margin: 4 },
      ios_backgroundColor: '#123456',
    }).payload;

    expect(payload.margin).toBe(4);
    expect(payload.alignSelf).toBe(undefined);
    expect(payload.backgroundColor).toBe(undefined);
    expect(payload.ios_backgroundColor).toBe(undefined);
  });

  // why: Android's native component is a DIFFERENT component with different prop names —
  // `Switch.js:240-243` sends `on` and `enabled`, never `value`/`disabled`. We sent the iOS names on
  // both platforms, so an Android switch painted from nothing and could not be disabled.
  it('sends Android its own prop names', () => {
    const payload = commitAndroid({ value: true, disabled: true }).payload;

    expect(payload.on).toBe(true);
    expect(payload.enabled).toBe(false);
    expect(payload.value).toBe(undefined);
    expect(payload.disabled).toBe(undefined);
  });

  // why: `Switch.js:235-238` — `_accessibilityState` is built only when `_disabled !==
  // accessibilityState?.disabled`. With NEITHER `disabled` nor `accessibilityState` authored, both
  // sides of that comparison are `undefined` — `undefined !== undefined` is FALSE — so RN sends NO
  // `accessibilityState` at all. Inventing `{disabled: false}` here would be a payload a real
  // device never produces for the commonest case: an ordinary, unadorned Android switch.
  it('sends no accessibilityState when neither disabled nor a11y state was authored', () => {
    expect(commitAndroid({ value: true }).payload.accessibilityState).toBe(
      undefined,
    );
  });

  // why: `Switch.js:232` — `disabled != null ? disabled : accessibilityState?.disabled`. The a11y
  // state is the FALLBACK, so an app that only spells `accessibilityState.disabled` still gets a
  // switch that cannot be toggled, and an explicit `disabled` still wins over it.
  it('resolves Android s enabled through the a11y state when disabled is unset', () => {
    expect(
      commitAndroid({ accessibilityState: { disabled: true } }).payload.enabled,
    ).toBe(false);
    expect(
      commitAndroid({ disabled: false, accessibilityState: { disabled: true } })
        .payload.enabled,
    ).toBe(true);
  });

  // why: `Switch.js:235-238` writes the resolved answer BACK into the a11y state, so the screen
  // reader and the view agree. It merges rather than replaces — an authored `busy` survives.
  it('folds Android s resolved disabled back into the a11y state', () => {
    const state = commitAndroid({
      disabled: true,
      accessibilityState: { busy: true },
    }).payload.accessibilityState;

    if (state === null || typeof state !== 'object') {
      throw new Error('the android switch sent no accessibilityState');
    }
    const fields: Record<string, unknown> = { ...state };
    expect(fields.busy).toBe(true);
    expect(fields.disabled).toBe(true);
  });

  // why: `Switch.js:230` destructures `onTintColor`/`tintColor` OUT of what reaches the Android
  // view. They are iOS names; forwarding them is a key that component does not declare.
  it('does not forward the iOS colour names to the Android view', () => {
    const payload = commitAndroid({
      value: true,
      onTintColor: '#00ff00',
      tintColor: '#ff0000',
      trackColor: { false: '#767577', true: '#81b0ff' },
    }).payload;

    expect(payload.onTintColor).toBe(undefined);
    expect(payload.tintColor).toBe(undefined);
    expect(payload.trackColorForTrue).toBe(0xff_81_b0_ff);
    expect(payload.trackColorForFalse).toBe(0xff_76_75_77);
    // `Switch.js:248` — the active track follows the value.
    expect(payload.trackTintColor).toBe(0xff_81_b0_ff);
  });

  // why: RN passes trackColor/thumbColor/ios_backgroundColor through as ANY ColorValue
  // (Switch.js:187-188,245-278), so a PlatformColor must reach native as the opaque object.
  it('carries PlatformColor track and thumb colours on both platforms', () => {
    const off = { resource_paths: ['@android:color/black'] };
    const on = { resource_paths: ['@android:color/white'] };
    const thumb = { resource_paths: ['?android:attr/colorAccent'] };
    const android = commitAndroid({
      value: true,
      trackColor: { false: off, true: on },
      thumbColor: thumb,
    }).payload;
    expect(android.trackColorForFalse).toEqual(off);
    expect(android.trackColorForTrue).toEqual(on);
    expect(android.trackTintColor).toEqual(on);
    expect(android.thumbTintColor).toEqual(thumb);

    const semanticOn = { semantic: ['systemGreen'] };
    const semanticOff = { semantic: ['systemGray'] };
    const ios = commit({
      trackColor: { false: semanticOff, true: semanticOn },
    }).payload;
    expect(ios.onTintColor).toEqual(semanticOn);
    expect(ios.tintColor).toEqual(semanticOff);
  });

  // why: THE CONTROL. Every absence assertion above would be satisfied by a payload with no rule at
  // all, so pin that the same props on a behaviorless tag are untouched.
  it('folds nothing on a tag with no behavior', () => {
    const surface = createSurface(ROOT_TAG);
    const node: ISymbioteNode = createElement(SWITCH_VIEW, false, 'view');
    setProp(node, 'value', 'yes');
    setProp(node, 'thumbColor', '#0000ff');
    surface.appendChild(node);
    surface.commit();
    mounted();

    const payload = committedPayloadOf(node);
    if (payload === undefined) throw new Error('nothing committed');
    expect(payload.value).toBe('yes');
    expect(payload.thumbTintColor).toBe(undefined);
    // A SHARPER CONTROL THAN INTENDED, and worth keeping for what it shows: the authored name rides
    // through as the STRING it was written as, un-parsed. Colour conversion is keyed on the NATIVE
    // names (`kColorProps`), so `thumbColor` is not a colour to this engine — which is another way
    // of saying the rename is the rule, not a formality.
    expect(payload.thumbColor).toBe('#0000ff');
  });
});

report();
