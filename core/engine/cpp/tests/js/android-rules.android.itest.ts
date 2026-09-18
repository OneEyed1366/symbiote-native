// THE ANDROID ARM — the platform branches every port so far had to leave unasserted.
//
// Five ported rules carry a split that no view NAME can express, and each one landed with the same
// note: "a compile-time branch is only testable in a build that compiles it". `Switch` was the lucky
// case — `Switch` and `AndroidSwitch` are genuinely two Fabric components, so its rule branches on a
// name already on the wire and both halves are reachable from one binary. The rest are not: an
// `android_ripple` sits on an ordinary `RCTView`, a Button's label commits as `RCTRawText` on both
// platforms, and a TouchableNativeFeedback's child is a plain view. Those rules are `#ifdef ANDROID`,
// and until 2026-09-18 the only thing that ran them was a device.
//
// What made the arm cheap is a fact about where the rules live rather than a trick: ALL TWELVE
// `#ifdef ANDROID` sites are in `SymbioteFabricProps.cpp`, which includes `folly/dynamic.h` and our
// own headers and nothing else. So the define is scoped to that one translation unit
// (`tests/CMakeLists.txt`, `SYMBIOTE_PLATFORM_ANDROID`) and never reaches ReactCommon, whose own
// Android branches want fbjni and a real NDK. Defining it target-wide is the version that does not
// build.
//
//   pnpm run test:android
//
// RUN AGAINST THE ORDINARY BUILD IT WOULD BE A LIE, so this file refuses rather than reporting
// agreement: every case below asserts a key that only the Android branch writes, and on the default
// host those keys are absent. The refusal is the first case, so a runner pointed at the wrong binary
// says so in one line instead of in eleven.
//
// WHAT IT DOES NOT COVER, said plainly. `Platform.OS` in JS still reads the HOST, so a behavior whose
// JS half branches on it (`touchable-native-feedback.ts`'s `IS_ANDROID`) still takes its iOS path
// here. This build settles what the RULE emits, which is where the ported logic now lives; it is not
// a device and does not replace one.

import {
  registerButtonBehavior,
  registerPressableBehavior,
  registerTouchableNativeFeedbackBehavior,
} from '@symbiote-native/components';

import {
  appendChild,
  childrenOf,
  committedPayloadOf,
  createElement,
  createSurface,
  routeProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { describe, expect, it, mounted, report } from './harness';

const ROOT_TAG = 1;

registerPressableBehavior();
registerButtonBehavior();
registerTouchableNativeFeedbackBehavior();

function commitOne(
  viewName: string,
  tag: string,
  props: Record<string, unknown>,
): Readonly<Record<string, unknown>> {
  const surface = createSurface(ROOT_TAG);
  const node: ISymbioteNode = createElement(viewName, false, tag);
  for (const [name, value] of Object.entries(props))
    routeProp(node, name, value);
  surface.appendChild(node);
  surface.commit();
  mounted();

  const payload = committedPayloadOf(node);
  if (payload === undefined) throw new Error(`${tag} committed nothing`);
  return payload;
}

// One field out of a committed nested object, narrowed rather than cast.
function fieldOf(value: unknown, name: string): unknown {
  if (typeof value !== 'object' || value === null) return undefined;
  return Object.hasOwn(value, name) ? Reflect.get(value, name) : undefined;
}

describe('the rules that only an Android build compiles', () => {
  // why: THE GATE. Every case below asserts a key the default host never writes, so a run against
  // the wrong binary would report ten identical failures with no hint as to why. This one says it.
  it('is running against a build that compiled the Android branches', () => {
    const payload = commitOne('RCTView', 'pressable', {
      android_ripple: { color: '#ff0000' },
    });

    expect(fieldOf(payload.nativeBackgroundAndroid, 'type')).toBe(
      'RippleAndroid',
    );
  });

  // why: `Pressable.js`'s ripple, resolved into the native slot RN's own `processDecoratedProps`
  // writes. The dict is built by the rule rather than passed through — colour, borderless and the
  // optional radius — so every field is a chance for the port to have dropped one.
  it('builds the ripple dict from android_ripple', () => {
    const background = commitOne('RCTView', 'pressable', {
      android_ripple: { color: '#ff0000', borderless: true, radius: 12 },
    }).nativeBackgroundAndroid;

    expect(fieldOf(background, 'type')).toBe('RippleAndroid');
    expect(fieldOf(background, 'color')).toBe('#ff0000');
    expect(fieldOf(background, 'borderless')).toBe(true);
    expect(fieldOf(background, 'rippleRadius')).toBe(12);
  });

  // why: `foreground: true` picks the OTHER slot. Two native props, and sending the wrong one paints
  // under the content instead of over it — invisible to any test that only checks the dict.
  it('picks the foreground slot when the ripple asks for it', () => {
    const payload = commitOne('RCTView', 'pressable', {
      android_ripple: { color: '#ff0000', foreground: true },
    });

    expect(fieldOf(payload.nativeForegroundAndroid, 'color')).toBe('#ff0000');
    expect(payload.nativeBackgroundAndroid).toBe(undefined);
  });

  // why: a `null` colour is Android's documented "no tint", and it has to survive as a real null
  // rather than becoming an absent key — the rule writes it explicitly for that reason.
  it('keeps a missing ripple colour as an explicit null', () => {
    const background = commitOne('RCTView', 'pressable', {
      android_ripple: { borderless: false },
    }).nativeBackgroundAndroid;

    expect(fieldOf(background, 'color')).toBe(null);
  });

  // why: `Button.js:394-437`'s Material look, which is `{}` on iOS and the whole style here. Asserted
  // through the committed payload's hoisted keys, which is where a style lands.
  it('paints the Material button style', () => {
    const payload = commitOne('RCTView', 'button', { title: 'Save' });

    expect(payload.elevation).toBe(4);
    expect(payload.backgroundColor).toBe(0xff_21_96_f3);
    expect(payload.borderRadius).toBe(2);
  });

  // why: `color` overrides the blue, and it is the app's own prop — the one thing in that style a
  // developer can change. The raw `color` must not survive either: no ViewConfig declares it.
  it('lets an authored color win over the Material blue', () => {
    const payload = commitOne('RCTView', 'button', {
      title: 'Save',
      color: '#00ff00',
    });

    expect(payload.backgroundColor).toBe(0xff_00_ff_00);
    expect(payload.color).toBe(undefined);
  });

  // why: disabled greys the button AND flattens it. Both, because a port that kept only the colour
  // leaves a raised grey button, which reads as enabled at a glance.
  it('greys and flattens a disabled button', () => {
    const payload = commitOne('RCTView', 'button', {
      title: 'Save',
      disabled: true,
    });

    expect(payload.elevation).toBe(0);
    expect(payload.backgroundColor).toBe(0xff_df_df_df);
  });

  // why: the style is REDERIVED on a late write, not frozen at mount. `color` and `disabled` are the
  // button's OWN props, so the write dirties the node it is written on and needs no slot machinery —
  // which is exactly why this pair is cheap to keep and worth keeping: a rule that read its input
  // once would pass every case above.
  // `color` and not `disabled`, and the reason is the arm's own limit rather than a preference: the
  // JS half still reads the HOST for `Platform.OS`, so the button composes the iOS touchable and a
  // late `disabled` write starts its opacity settle, which wants a `requestAnimationFrame` the test
  // host does not have. The greying is asserted on a fresh mount above; what needs a LATE write is
  // the re-derivation, and one prop proves that.
  it('re-tints on a write after mount', () => {
    const surface = createSurface(ROOT_TAG);
    const button: ISymbioteNode = createElement('RCTView', false, 'button');
    routeProp(button, 'title', 'Save');
    surface.appendChild(button);
    surface.commit();
    mounted();
    expect(committedPayloadOf(button)?.backgroundColor).toBe(0xff_21_96_f3);

    routeProp(button, 'color', '#ff0000');
    surface.commit();
    mounted();
    expect(committedPayloadOf(button)?.backgroundColor).toBe(0xff_ff_00_00);
  });

  // why: the button's own view gets TNF's default background, because TNF renders no view and clones
  // onto it (`:339`). The FOREGROUND slot must stay empty — `useForeground` is not a Button prop, so
  // picking it would be the rule inventing a choice the app never made.
  it('gives the button the selectable background and no foreground', () => {
    const payload = commitOne('RCTView', 'button', { title: 'Save' });

    expect(fieldOf(payload.nativeBackgroundAndroid, 'attribute')).toBe(
      'selectableItemBackground',
    );
    expect(payload.nativeForegroundAndroid).toBe(undefined);
  });

  // why: `Button.js:352-353` renders the title UPPERCASE on Android and verbatim everywhere else. It
  // hangs on a raw text, which commits as `RCTRawText` on both platforms — so unlike `Switch` there
  // is no view name to branch on, and this arm is the only place the rule runs outside a device.
  it('uppercases the button label', () => {
    const surface = createSurface(ROOT_TAG);
    const button: ISymbioteNode = createElement('RCTView', false, 'button');
    routeProp(button, 'title', 'Save');
    surface.appendChild(button);
    surface.commit();
    mounted();

    // THE TREE IS iOS's HERE and that is the arm's one honest limit: `buildStructure` branches on
    // `Platform.OS`, which is the JS half and still reads the host, so the shape is
    // `button -> view -> text -> rawtext` rather than Android's three-node one. The RULE is what this
    // build changes, and the rule keys off the label's TAG, which is the same on both shapes — so
    // the uppercase is asserted and the missing wrapper is not this case's subject.
    const [view] = childrenOf(button);
    const [text] = childrenOf(view);
    const [label] = childrenOf(text);
    expect(committedPayloadOf(label)?.text).toBe('SAVE');
  });

  // why: TouchableNativeFeedback's default background, which is what an app gets when it passes no
  // `background` at all (`:343-348`). A ThemeAttr dict, not a ripple — the two shapes are different
  // and only one of them is right here.
  it('gives a cloned child the selectable background', () => {
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

    const background = committedPayloadOf(child)?.nativeBackgroundAndroid;
    expect(fieldOf(background, 'type')).toBe('ThemeAttrAndroid');
    expect(fieldOf(background, 'attribute')).toBe('selectableItemBackground');
  });

  // why: an authored `background` is the APP's dict and the rule only picks the slot — so a
  // `TouchableNativeFeedback.Ripple(...)` must arrive intact rather than be rebuilt.
  it('honours an authored background dict on the clone', () => {
    const surface = createSurface(ROOT_TAG);
    const owner: ISymbioteNode = createElement(
      '#anchor',
      false,
      'touchable-native-feedback',
    );
    routeProp(owner, 'background', {
      type: 'RippleAndroid',
      color: '#ff0000',
      borderless: true,
    });
    routeProp(owner, 'useForeground', true);
    const child: ISymbioteNode = createElement('RCTView', false, 'view');
    appendChild(owner, child);
    surface.appendChild(owner);
    surface.commit();
    mounted();

    const payload = committedPayloadOf(child);
    // `useForeground` picks the other slot, and the api-level guard resolves to the minimum RN
    // supports in a host build — see `androidApiLevel`.
    expect(fieldOf(payload?.nativeForegroundAndroid, 'color')).toBe('#ff0000');
    expect(payload?.nativeBackgroundAndroid).toBe(undefined);
    // Neither name may reach Fabric raw: no ViewConfig declares them, so a leak is silent.
    expect(payload?.background).toBe(undefined);
    expect(payload?.useForeground).toBe(undefined);
  });
});

report();
