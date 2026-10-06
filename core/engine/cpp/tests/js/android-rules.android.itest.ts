// THE ANDROID ARM — the platform branches every port so far had to leave unasserted.
//
// Five ported rules carry a split that no view NAME can express, and each one landed with the same
// note: "a compile-time branch is only testable in a build that compiles it". `Switch` was the lucky
// case — `Switch` and `AndroidSwitch` are genuinely two Fabric components, so its rule branches on a
// name already on the wire and both halves are reachable from one binary. The rest are not: an
// `android_ripple` sits on an ordinary `RCTView`, a Button's label commits as `RCTRawText` on both
// platforms, and a TouchableNativeFeedback's child is a plain view. Those rules are `#ifdef ANDROID`,
// so only a device build could run them before this file.
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

// What Android commits for both text-input tags (`component-names/index.android.ts`)
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

// One field out of a committed nested object, narrowed rather than cast
function fieldOf(value: unknown, name: string): unknown {
  if (typeof value !== 'object' || value === null) return undefined;
  return Object.hasOwn(value, name) ? Reflect.get(value, name) : undefined;
}

describe('the rules that only an Android build compiles', () => {
  // Каждый кейс ниже проверяет ключ, которого нет на хосте по умолчанию, этот падает первым
  it('is running against a build that compiled the Android branches', () => {
    const payload = commitOne('RCTView', 'pressable', {
      android_ripple: { color: '#ff0000' },
    });

    expect(fieldOf(payload.nativeBackgroundAndroid, 'type')).toBe(
      'RippleAndroid',
    );
  });

  // Словарь ripple собирает правило: цвет, borderless и необязательный radius
  it('builds the ripple dict from android_ripple', () => {
    const background = commitOne('RCTView', 'pressable', {
      android_ripple: { color: '#ff0000', borderless: true, radius: 12 },
    }).nativeBackgroundAndroid;

    expect(fieldOf(background, 'type')).toBe('RippleAndroid');
    // Int, как после `processColor` в RN, Java читает цвет через `getInt`
    expect(fieldOf(background, 'color')).toBe(0xff_ff_00_00 | 0);
    expect(fieldOf(background, 'borderless')).toBe(true);
    expect(fieldOf(background, 'rippleRadius')).toBe(12);
  });

  // `foreground: true` выбирает другой нативный слот, и ripple рисуется поверх контента
  it('picks the foreground slot when the ripple asks for it', () => {
    const payload = commitOne('RCTView', 'pressable', {
      android_ripple: { color: '#ff0000', foreground: true },
    });

    expect(fieldOf(payload.nativeForegroundAndroid, 'color')).toBe(
      0xff_ff_00_00 | 0,
    );
    expect(payload.nativeBackgroundAndroid).toBe(undefined);
  });

  // `null` цвет это "без оттенка" в Android, он должен дойти null, а не пропасть ключом
  it('keeps a missing ripple colour as an explicit null', () => {
    const background = commitOne('RCTView', 'pressable', {
      android_ripple: { borderless: false },
    }).nativeBackgroundAndroid;

    expect(fieldOf(background, 'color')).toBe(null);
  });

  // `useAndroidRippleForView.js:66` шлёт `alpha: alpha ?? null`
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

  // `useAndroidRippleForView.js:57` строит ripple только при color, borderless или radius
  it('installs no ripple for a config without color, borderless or radius', () => {
    const payload = commitOne('RCTView', 'pressable', {
      android_ripple: { foreground: true },
    });

    expect(payload.nativeForegroundAndroid).toBe(undefined);
    expect(payload.nativeBackgroundAndroid).toBe(undefined);
  });

  // RN гонит цвет ripple через `processColor`, `PlatformColor` он пропускает как есть
  it('passes a PlatformColor ripple colour through', () => {
    const platformColor = { resource_paths: ['?attr/colorAccent'] };
    const background = commitOne('RCTView', 'pressable', {
      android_ripple: { color: platformColor },
    }).nativeBackgroundAndroid;

    expect(fieldOf(background, 'color')).toEqual(platformColor);
  });

  // Material-вид из `Button.js:394-437`, на iOS это `{}`, читается по поднятым ключам payload
  it('paints the Material button style', () => {
    const payload = commitOne('RCTView', 'button', { title: 'Save' });

    expect(payload.elevation).toBe(4);
    expect(payload.backgroundColor).toBe(0xff_21_96_f3 | 0);
    expect(payload.borderRadius).toBe(2);
  });

  // Авторский `color` перекрывает синий, сам `color` дальше не идёт, ViewConfig его не знает
  it('lets an authored color win over the Material blue', () => {
    const payload = commitOne('RCTView', 'button', {
      title: 'Save',
      color: '#00ff00',
    });

    expect(payload.backgroundColor).toBe(0xff_00_ff_00 | 0);
    expect(payload.color).toBe(undefined);
  });

  // RN кладёт `{backgroundColor: color}` для любого ColorValue (`Button.js:321-325`)
  it('lets a PlatformColor color win over the Material blue', () => {
    const platformColor = { resource_paths: ['?android:attr/colorAccent'] };
    const payload = commitOne('RCTView', 'button', {
      title: 'Save',
      color: platformColor,
    });

    expect(payload.backgroundColor).toEqual(platformColor);
  });

  // Disabled красит в серый и сплющивает, иначе серая приподнятая кнопка выглядит активной
  it('greys and flattens a disabled button', () => {
    const payload = commitOne('RCTView', 'button', {
      title: 'Save',
      disabled: true,
    });

    expect(payload.elevation).toBe(0);
    expect(payload.backgroundColor).toBe(0xff_df_df_df | 0);
  });

  // Стиль пересчитывается при поздней записи, а не фиксируется при монтировании
  // Берём `color`, т.к. JS-половина читает `Platform.OS` хоста и у `disabled` стартует анимация
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

  // TNF не рисует вью и клонируется на него (`:339`), foreground остаётся пустым
  it('gives the button the selectable background and no foreground', () => {
    const payload = commitOne('RCTView', 'button', { title: 'Save' });

    expect(fieldOf(payload.nativeBackgroundAndroid, 'attribute')).toBe(
      'selectableItemBackground',
    );
    expect(payload.nativeForegroundAndroid).toBe(undefined);
  });

  // Заглавные буквы кнопки на Android считает JS, см. `slotValueFor` в `behaviors/button.ts`

  // Фон TNF по умолчанию без `background` (`:343-348`), это ThemeAttr, а не ripple
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

  // Авторский `background` это словарь приложения, правило лишь выбирает слот
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
    // `useForeground` берёт другой слот, `canUseNativeForeground()` на Android всегда true
    // `TouchableNativeFeedback.Ripple` оставляет цвет строкой, правило её переводит
    expect(fieldOf(payload?.nativeForegroundAndroid, 'color')).toBe(
      0xff_ff_00_00 | 0,
    );
    expect(payload?.nativeBackgroundAndroid).toBe(undefined);
    // Ни одно из имён не должно дойти до Fabric сырым, ViewConfig их не знает
    expect(payload?.background).toBe(undefined);
    expect(payload?.useForeground).toBe(undefined);
  });

  // `transparent` по умолчанию только здесь, iOS ViewConfig это поле не объявляет
  it('defaults a text input underline to transparent', () => {
    const payload = commitOne(ANDROID_TEXT_INPUT, 'text-input', {
      text: 'input 0',
    });

    expect(payload.underlineColorAndroid).toBe(0x00_00_00_00);
  });

  // Значение по умолчанию не должно перекрывать явный выбор приложения
  it('lets an authored underline colour win', () => {
    const payload = commitOne(ANDROID_TEXT_INPUT, 'text-input', {
      underlineColorAndroid: '#00ff00',
    });

    expect(payload.underlineColorAndroid).toBe(0xff_00_ff_00 | 0);
  });

  // `search` единственный `inputMode`, который RN решает по платформе (`TextInput.js:815-825`)
  it('falls the search keyboard back to the default', () => {
    const payload = commitOne('AndroidTextInput', 'text-input', {
      inputMode: 'search',
    });

    expect(payload.keyboardType).toBe('default');
  });

  // Оба тега TextInput на Android это `AndroidTextInput`, `value` идёт как `text`
  it('runs the text input rules on the Android component name', () => {
    const single = commitOne('AndroidTextInput', 'text-input', { value: 'x' });
    expect(single.text).toBe('x');
    expect(single.value).toBe(undefined);
    expect(single.submitBehavior).toBe('blurAndSubmit');

    const multi = commitOne('AndroidTextInput', 'text-input-multiline', {});
    expect(multi.submitBehavior).toBe('newline');
  });

  // `pagingEnabled` инвертируется между платформами (`ScrollView.js:1810-1821`)
  it('turns paging ON for a snapping scroller', () => {
    expect(
      commitOne('RCTScrollView', 'scroll-view', { snapToInterval: 100 })
        .pagingEnabled,
    ).toBe(true);
    expect(
      commitOne('RCTScrollView', 'scroll-view', { snapToOffsets: [0, 100] })
        .pagingEnabled,
    ).toBe(true);
    // Собственный запрос приложения остаётся в силе, без обоих флагов будет false
    expect(
      commitOne('RCTScrollView', 'scroll-view', { pagingEnabled: true })
        .pagingEnabled,
    ).toBe(true);
    expect(commitOne('RCTScrollView', 'scroll-view', {}).pagingEnabled).toBe(
      false,
    );
  });

  // `snapToAlignment` не даёт схлопнуть детей контента только на Android (`ScrollView.js:1731`)
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

  // Android по умолчанию: sentences и пустой `placeholder`, `autoComplete` по таблице
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

  // `Text.js:145-150`: неуказанный `accessible` следует за обработчиками нажатия
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

  // `ScrollView.js:1740-1745`: клиппинг ломает sticky-заголовки, поэтому у контента он false
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

  // RN отдаёт Android знаковый int32, беззнаковый Kotlin `toInt()` насыщает до 0x7fffffff
  it('commits an opaque colour as a signed int32, as RN does on Android', () => {
    const payload = commitOne('RCTView', 'view', {
      style: { backgroundColor: '#0b1220' },
    });

    expect(payload.backgroundColor).toBe(0xff0b1220 | 0);
  });

  // `ReactImageManager.setDefaultSource` берёт `String?`, словарь даёт красный экран
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

  // Заголовки доходят до запроса через верхний `headers` из `source_[0]` (`Image.android.js`)
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

describe('srcSet on an Android image', () => {
  // Заголовки берутся из `source_[0]`, у `srcSet` их даёт `crossOrigin`
  it('lifts the credentials header to the headers prop', () => {
    const surface = createSurface(ROOT_TAG);
    const image: ISymbioteNode = createElement('RCTImageView', false, 'image');
    setProp(image, 'srcSet', 'https://a/2.png 2x extra');
    setProp(image, 'crossOrigin', 'use-credentials');
    surface.appendChild(image);
    surface.commit();
    mounted();

    expect(
      fieldOf(
        committedPayloadOf(image)?.headers,
        'Access-Control-Allow-Credentials',
      ),
    ).toBe('true');
  });
});

report();
