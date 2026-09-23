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
  registerImageBehavior,
  registerPressableBehavior,
  registerScrollViewBehavior,
  registerTextInputBehavior,
  registerTouchableNativeFeedbackBehavior,
} from '@symbiote-native/components';

import {
  appendChild,
  childrenOf,
  committedPayloadOf,
  createElement,
  createSurface,
  routeProp,
  setProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { describe, expect, it, mounted, report } from './harness';

const ROOT_TAG = 1;

registerPressableBehavior();
registerButtonBehavior();
registerTouchableNativeFeedbackBehavior();
registerTextInputBehavior();
registerScrollViewBehavior();
registerImageBehavior();

// What Android commits for BOTH text-input tags (`component-names/index.android.ts`).
const ANDROID_TEXT_INPUT = 'AndroidTextInput';

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
    // why: an INT, as RN's processColor leaves it — Java reads the ripple colour with getInt.
    expect(fieldOf(background, 'color')).toBe(0xff_ff_00_00 | 0);
    expect(fieldOf(background, 'borderless')).toBe(true);
    expect(fieldOf(background, 'rippleRadius')).toBe(12);
  });

  // why: `foreground: true` picks the OTHER slot. Two native props, and sending the wrong one paints
  // under the content instead of over it — invisible to any test that only checks the dict.
  it('picks the foreground slot when the ripple asks for it', () => {
    const payload = commitOne('RCTView', 'pressable', {
      android_ripple: { color: '#ff0000', foreground: true },
    });

    expect(fieldOf(payload.nativeForegroundAndroid, 'color')).toBe(
      0xff_ff_00_00 | 0,
    );
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

  // why: useAndroidRippleForView.js:66 sends `alpha: alpha ?? null` in the dict.
  it('carries the ripple alpha, null when unset', () => {
    const withAlpha = commitOne('RCTView', 'pressable', {
      android_ripple: { color: '#ff0000', alpha: 0.5 },
    }).nativeBackgroundAndroid;
    const without = commitOne('RCTView', 'pressable', {
      android_ripple: { color: '#ff0000' },
    }).nativeBackgroundAndroid;

    expect(fieldOf(withAlpha, 'alpha')).toBe(0.5);
    expect(fieldOf(without, 'alpha')).toBe(null);
  });

  // why: useAndroidRippleForView.js:57 builds a ripple only when color, borderless or radius is
  // set; `{foreground: true}` alone installs no background.
  it('installs no ripple for a config without color, borderless or radius', () => {
    const payload = commitOne('RCTView', 'pressable', {
      android_ripple: { foreground: true },
    });

    expect(payload.nativeForegroundAndroid).toBe(undefined);
    expect(payload.nativeBackgroundAndroid).toBe(undefined);
  });

  // why: RN runs the ripple colour through processColor, which passes a PlatformColor through.
  it('passes a PlatformColor ripple colour through', () => {
    const platformColor = { resource_paths: ['?attr/colorAccent'] };
    const background = commitOne('RCTView', 'pressable', {
      android_ripple: { color: platformColor },
    }).nativeBackgroundAndroid;

    expect(fieldOf(background, 'color')).toEqual(platformColor);
  });

  // why: `Button.js:394-437`'s Material look, which is `{}` on iOS and the whole style here. Asserted
  // through the committed payload's hoisted keys, which is where a style lands.
  it('paints the Material button style', () => {
    const payload = commitOne('RCTView', 'button', { title: 'Save' });

    expect(payload.elevation).toBe(4);
    expect(payload.backgroundColor).toBe(0xff_21_96_f3 | 0);
    expect(payload.borderRadius).toBe(2);
  });

  // why: `color` overrides the blue, and it is the app's own prop — the one thing in that style a
  // developer can change. The raw `color` must not survive either: no ViewConfig declares it.
  it('lets an authored color win over the Material blue', () => {
    const payload = commitOne('RCTView', 'button', {
      title: 'Save',
      color: '#00ff00',
    });

    expect(payload.backgroundColor).toBe(0xff_00_ff_00 | 0);
    expect(payload.color).toBe(undefined);
  });

  // why: RN pushes `{backgroundColor: color}` for ANY ColorValue (Button.js:321-325); a
  // PlatformColor must reach native as the opaque object, not fall back to the Material blue.
  it('lets a PlatformColor color win over the Material blue', () => {
    const platformColor = { resource_paths: ['?android:attr/colorAccent'] };
    const payload = commitOne('RCTView', 'button', {
      title: 'Save',
      color: platformColor,
    });

    expect(payload.backgroundColor).toEqual(platformColor);
  });

  // why: disabled greys the button AND flattens it. Both, because a port that kept only the colour
  // leaves a raised grey button, which reads as enabled at a glance.
  it('greys and flattens a disabled button', () => {
    const payload = commitOne('RCTView', 'button', {
      title: 'Save',
      disabled: true,
    });

    expect(payload.elevation).toBe(0);
    expect(payload.backgroundColor).toBe(0xff_df_df_df | 0);
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
    expect(committedPayloadOf(button)?.backgroundColor).toBe(0xff_21_96_f3 | 0);

    routeProp(button, 'color', '#ff0000');
    surface.commit();
    mounted();
    expect(committedPayloadOf(button)?.backgroundColor).toBe(0xff_ff_00_00 | 0);
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

  // (Button's Android uppercase is JS now — `slotValueFor` in `behaviors/button.ts`, because only
  // JavaScript's `toUpperCase` is full Unicode — and is asserted in `button-android.test.ts`.)

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
    // `useForeground` picks the other slot; `canUseNativeForeground()` is true on any Android.
    // why: TouchableNativeFeedback.Ripple leaves the colour a string; the rule converts it.
    expect(fieldOf(payload?.nativeForegroundAndroid, 'color')).toBe(
      0xff_ff_00_00 | 0,
    );
    expect(payload?.nativeBackgroundAndroid).toBe(undefined);
    // Neither name may reach Fabric raw: no ViewConfig declares them, so a leak is silent.
    expect(payload?.background).toBe(undefined);
    expect(payload?.useForeground).toBe(undefined);
  });

  // why: `underlineColorAndroid` defaults to `'transparent'` HERE and is emitted nowhere else
  // (F-76): iOS's `RCTSinglelineTextInputView` ViewConfig does not declare it, so RN's own payload
  // builder filters it out and we must not spend a wire slot on it. The iOS twin asserts its
  // ABSENCE (`text-input-payload.itest.ts`, "sends no alias and no android-only key"); this is the
  // half that had no home until the arm existed.
  it('defaults a text input underline to transparent', () => {
    const payload = commitOne(ANDROID_TEXT_INPUT, 'text-input', {
      text: 'input 0',
    });

    expect(payload.underlineColorAndroid).toBe(0x00_00_00_00);
  });

  // why: the default must not be hardcoded PAST an explicit choice — a designer who wants the
  // underline back must be able to ask for it. The `??` is the whole rule and a port that wrote
  // unconditionally would pass the case above and fail only on a device.
  it('lets an authored underline colour win', () => {
    const payload = commitOne(ANDROID_TEXT_INPUT, 'text-input', {
      underlineColorAndroid: '#00ff00',
    });

    expect(payload.underlineColorAndroid).toBe(0xff_00_ff_00 | 0);
  });

  // why: `search` is the ONE `inputMode` token RN resolves per platform (TextInput.js:815-825) —
  // iOS has a dedicated search keyboard whose return key is a magnifier and Android has none, so it
  // falls back to the default. Every other token is platform-invariant and asserted on the iOS arm;
  // this is the only row where the two builds must disagree, which is what makes it worth an arm.
  it('falls the search keyboard back to the default', () => {
    const payload = commitOne('AndroidTextInput', 'text-input', {
      inputMode: 'search',
    });

    expect(payload.keyboardType).toBe('default');
  });

  // why: Android commits BOTH text-input tags as `AndroidTextInput`; RN runs the same TextInput.js
  // on it — the controlled `value` rides as `text`, and submitBehavior follows the TAG.
  it('runs the text input rules on the Android component name', () => {
    const single = commitOne('AndroidTextInput', 'text-input', { value: 'x' });
    expect(single.text).toBe('x');
    expect(single.value).toBe(undefined);
    expect(single.submitBehavior).toBe('blurAndSubmit');

    const multi = commitOne('AndroidTextInput', 'text-input-multiline', {});
    expect(multi.submitBehavior).toBe('newline');
  });

  // why: `snapToAlignment` stops the content node's children collapsing on ANDROID ONLY — RN's gate
  // is `maintainVisibleContentPosition != null || (Platform.OS === 'android' && snapToAlignment !=
  // null)` (`ScrollView.js:1731-1733`). It was honoured on both platforms here until 2026-09-18, so
  // this is the arm that pins the half a compile-time branch made unreachable from the other one.
  // The iOS NEGATIVE is `scroll-content-payload.itest.ts`, "lets a snapping iOS scroller collapse
  // its children" — the two are twins and neither means much alone.
  // why: `pagingEnabled` INVERTS between the platforms, which is the rarest shape in this file — iOS
  // needs it OFF for snapToInterval/snapToOffsets to work and Android needs it ON
  // (`ScrollView.js:1810-1821`, and the comment there says so in both directions). So the two arms
  // assert opposite answers to the same bag, and neither is meaningful without the other: the iOS
  // twin is `scroll-view-payload.itest.ts`, "drops paging on iOS when the app also asks for
  // snapping". An app that sets only `snapToInterval` gets no snapping at all on Android without it.
  it('turns paging ON for a snapping scroller', () => {
    expect(
      commitOne('RCTScrollView', 'scroll-view', { snapToInterval: 100 })
        .pagingEnabled,
    ).toBe(true);
    expect(
      commitOne('RCTScrollView', 'scroll-view', { snapToOffsets: [0, 100] })
        .pagingEnabled,
    ).toBe(true);
    // The app's own request still stands on its own, and a scroller asking for neither says so.
    expect(
      commitOne('RCTScrollView', 'scroll-view', { pagingEnabled: true })
        .pagingEnabled,
    ).toBe(true);
    expect(commitOne('RCTScrollView', 'scroll-view', {}).pagingEnabled).toBe(
      false,
    );
  });

  it('stops a snapping scroller collapsing its content children', () => {
    const surface = createSurface(ROOT_TAG);
    const owner: ISymbioteNode = createElement(
      'RCTScrollView',
      false,
      'scroll-view',
    );
    routeProp(owner, 'snapToAlignment', 'center');
    const content = owner.childHost;
    if (content === undefined) throw new Error('the behavior built no content');
    appendChild(owner, createElement('RCTView', false, 'view'));
    surface.appendChild(owner);
    surface.commit();
    mounted();

    expect(committedPayloadOf(content)?.collapsableChildren).toBe(false);
  });

  // why: TextInput.js:728-735,938-954 — Android defaults `autoCapitalize` to 'sentences' and
  // `placeholder` to '', maps the W3C autoComplete token for its own native prop, and derives no
  // `textContentType` (an authored one still passes).
  it('applies the Android text input defaults and autoComplete mapping', () => {
    const payload = commitOne('AndroidTextInput', 'text-input', {
      autoComplete: 'email',
    });
    expect(payload.autoCapitalize).toBe('sentences');
    expect(payload.placeholder).toBe('');
    expect(payload.autoComplete).toBe('email');
    expect(payload.textContentType).toBe(undefined);

    const authored = commitOne('AndroidTextInput', 'text-input', {
      autoCapitalize: 'none',
      placeholder: 'Name',
      autoComplete: 'address-line1',
    });
    expect(authored.autoCapitalize).toBe('none');
    expect(authored.placeholder).toBe('Name');
    expect(authored.autoComplete).toBe('postal-address-region');
  });

  // why: Text.js:145-150 — on Android an unset `accessible` follows the press handlers
  // (`onPress != null || onLongPress != null`); an authored value wins.
  it('makes text accessible on Android only when it is pressable', () => {
    const textPayload = (props: Record<string, unknown>) => {
      const surface = createSurface(ROOT_TAG);
      const node: ISymbioteNode = createElement('RCTText', true, 'text');
      for (const [name, value] of Object.entries(props))
        routeProp(node, name, value);
      surface.appendChild(node);
      surface.commit();
      mounted();
      return committedPayloadOf(node);
    };

    expect(textPayload({})?.accessible).toBe(false);
    expect(textPayload({ onPress: () => {} })?.accessible).toBe(true);
    expect(textPayload({ onLongPress: () => {} })?.accessible).toBe(true);
    expect(textPayload({ accessible: true })?.accessible).toBe(true);
  });

  // why: ScrollView.js:1740-1745 — clipping breaks sticky headers on Android, so the content view
  // is forced to false while any header sticks; without one it carries the scroller's value.
  it('turns content clipping off under sticky headers', () => {
    const contentPayload = (props: Record<string, unknown>) => {
      const surface = createSurface(ROOT_TAG);
      const owner: ISymbioteNode = createElement(
        'RCTScrollView',
        false,
        'scroll-view',
      );
      for (const [name, value] of Object.entries(props))
        routeProp(owner, name, value);
      const content = owner.childHost;
      if (content === undefined)
        throw new Error('the behavior built no content');
      appendChild(owner, createElement('RCTView', false, 'view'));
      surface.appendChild(owner);
      surface.commit();
      mounted();
      return committedPayloadOf(content);
    };

    expect(
      contentPayload({ removeClippedSubviews: true, stickyHeaderIndices: [0] })
        ?.removeClippedSubviews,
    ).toBe(false);
    expect(
      contentPayload({ removeClippedSubviews: true, stickyHeaderIndices: [] })
        ?.removeClippedSubviews,
    ).toBe(true);
  });

  // why: RN's `processColor` hands Android a SIGNED int32 (`| 0x0`). An unsigned opaque colour
  // reaches Java ViewManagers as a Double that Kotlin's `toInt()` saturates to 0x7fffffff, so every
  // View background painted translucent white while text colours (read in C++) stayed right.
  it('commits an opaque colour as a signed int32, as RN does on Android', () => {
    const payload = commitOne('RCTView', 'view', {
      style: { backgroundColor: '#0b1220' },
    });

    expect(payload.backgroundColor).toBe(0xff0b1220 | 0);
  });

  // why: `Image.android.js` sends `defaultSource_.uri`, and `ReactImageManager.setDefaultSource`
  // takes a `String?`. A map there is a red-box "Error while updating property 'defaultSource'".
  it('commits an image defaultSource as its bare uri string', () => {
    const surface = createSurface(ROOT_TAG);
    const image: ISymbioteNode = createElement('RCTImageView', false, 'image');
    setProp(image, 'src', 'https://a/1.png');
    setProp(image, 'defaultSource', { uri: 'https://a/placeholder.png' });
    surface.appendChild(image);
    surface.commit();
    mounted();

    expect(committedPayloadOf(image)?.defaultSource).toBe(
      'https://a/placeholder.png',
    );
  });

  // why: `ReactImageView.setSource` reads only `uri`/`cache`/sizes from a source map; headers reach
  // the request ONLY through the top-level `headers` prop, which `Image.android.js` fills from
  // `source_[0].headers` when the source is an ARRAY (a single object's are dropped at write time,
  // in JS — see image-source-write.test.ts). Left inside the source, the request goes without them.
  it('lifts the first source headers to the top-level headers prop', () => {
    const surface = createSurface(ROOT_TAG);
    const image: ISymbioteNode = createElement('RCTImageView', false, 'image');
    setProp(image, 'source', [
      { uri: 'https://a/1.png', headers: { Authorization: 'Bearer t' } },
    ]);
    surface.appendChild(image);
    surface.commit();
    mounted();

    expect(fieldOf(committedPayloadOf(image)?.headers, 'Authorization')).toBe(
      'Bearer t',
    );
  });
});

report();
