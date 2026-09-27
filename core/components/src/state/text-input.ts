// TextInput: the logic half (framework-agnostic, zero render). TextInput is the controlled-
// value / event-count handshake primitive. There is NO `value` Fabric prop: JS folds
// value/defaultValue into a single private `text` prop plus a `mostRecentEventCount` counter.
// Native increments its own counter per keystroke and rejects stale writes by
// eventLag = nativeCount - mostRecentEventCount, so a controlled JS write must push the
// ACKNOWLEDGED count (the one native last reported) through the setTextAndSelection view
// command, never a plain prop re-push, which would fight the cursor.
//
// Unlike Switch this is NOT a single reducer: the handshake holds two pieces with different
// reactivity needs: `mostRecentEventCount` must re-render so the imperative handle echoes the
// latest count, while `lastNativeText` is bookkeeping the controlled-write effect mutates
// without a render. So the logic layer is the pure folds/maps + the controlled-write predicate;
// each adapter holds the two pieces in ITS own primitives (React useState/useRef, Vue ref/let).

import type {
  IMeasureOnSuccess,
  IMeasureInWindowOnSuccess,
  IMeasureLayoutOnSuccess,
  ISymbioteNode,
  ISymbioteEvent,
  ITextStyle,
} from '@symbiote-native/engine';
import type { IAccessibilityProps, IAriaProps } from '../accessibility-props';
import type { IRectOffset } from './pressable';

export type IInputMode =
  'none' | 'text' | 'decimal' | 'numeric' | 'tel' | 'search' | 'email' | 'url';
export type IEnterKeyHint =
  'enter' | 'done' | 'go' | 'next' | 'previous' | 'search' | 'send';
export type ISubmitBehavior = 'submit' | 'blurAndSubmit' | 'newline';
export type ITextInputSelection = { start: number; end?: number };
export type ITextInputEventHandler = (event: ISymbioteEvent) => void;

// The acknowledged count starts at 0, native has reported nothing yet, so the first
// controlled write echoes 0 and lands on eventLag 0.
export const INITIAL_EVENT_COUNT = 0;
// RN's "no selection" sentinel for setTextAndSelection: a negative index tells native to
// leave the caret where it is rather than move it (used on a controlled write with no
// explicit selection).
export const SELECTION_NONE = -1;

// THE FOUR W3C->NATIVE LOOKUP TABLES AND THE FOLDS OVER THEM STOOD HERE, and they are the engine's
// now: `foldTextInputAliases` in `SymbioteFabricProps.cpp`, with
// `core/engine/cpp/tests/js/text-input-payload.itest.ts` as their contract.
//
// Deleted in the same pass as `rippleProps` next door, for the same reason. Nothing called them
// after the port — only this file's own tests and the barrel — and a rule that lives in two places
// has two behaviours the day one of them is edited. An exported twin kept alive by its own test is
// the shape the "no mirrors" rule exists to catch.
//
// Gone with them: `inputModeToKeyboardType`, `enterKeyHintToReturnKeyType`,
// `autoCompleteWebToAndroid`, `autoCompleteWebToTextContentType`, `keyboardTypeForInputMode`,
// `mapAutoComplete`, `foldAutoComplete`, `foldSubmitBehavior`, `resolveTextInputProps` and its two
// types. What STAYS below is the machine — `foldText`, the change-event readers, and the
// controlled-write decision — which runs at gesture rate and calls back into app code.
// RN's fold: value wins, else defaultValue, else leave undefined (uncontrolled).
export function foldText(
  value: string | undefined,
  defaultValue: string | undefined,
): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof defaultValue === 'string') return defaultValue;
  return undefined;
}

// The change payload carries the new text + native event counter. nativeEvent is an untyped
// Record, so narrow each.
export function textFromChange(event: ISymbioteEvent): string | undefined {
  const text = event.nativeEvent.text;
  return typeof text === 'string' ? text : undefined;
}

export function eventCountFromChange(
  event: ISymbioteEvent,
): number | undefined {
  const count = event.nativeEvent.eventCount;
  return typeof count === 'number' ? count : undefined;
}

// Controlled-write decision: command native back only when JS-side `value` is a string that
// diverges from what native last reported. A plain prop re-push would race the user's
// keystrokes; the setTextAndSelection command is the only stale-safe path. The guard narrows
// `value` to string so the caller can build the command args without re-checking.
export function shouldCommandText(
  lastNativeText: string | undefined,
  value: string | undefined,
): value is string {
  return typeof value === 'string' && lastNativeText !== value;
}

// The event `onValueChange` fires with. Svelte's compiler treats any individual `on*`-prefixed
// attribute as a native listener attachment and always calls it with exactly one argument, a real
// object — a two-argument `(text, event)` callback silently drops `event` there and crashes when
// `text` is passed as that sole argument (Svelte's own bookkeeping mutates it, which throws on a
// primitive). So the value rides as a field on the event object itself, never as a second argument.
export type ITextInputChangeEvent = ISymbioteEvent & { text: string };

// The app-facing prop contract, shared by every adapter so the surface CANNOT drift. TextInput
// is its own host element (not a View wrapper), so it carries the accessibility/aria aliases.
export type ITextInputProps = IAccessibilityProps &
  IAriaProps & {
    value?: string;
    defaultValue?: string;
    placeholder?: string;
    placeholderTextColor?: string;
    editable?: boolean;
    keyboardType?: string;
    secureTextEntry?: boolean;
    maxLength?: number;
    multiline?: boolean;
    selection?: ITextInputSelection;
    // Input behavior props, forwarded to Fabric via passthrough (the native TextInput
    // ViewManager reads them directly); declared here so app code is type-checked.
    autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
    autoCorrect?: boolean;
    // W3C autocomplete token. RN resolves it to BOTH the Android `autoComplete` and the iOS
    // `textContentType` native prop (TextInput.js:938); the engine does it — `foldTextInputAliases`.
    autoComplete?: string;
    // iOS content-type hint. An explicit value wins over the autoComplete-derived one.
    textContentType?: string;
    autoFocus?: boolean;
    // iOS keyboard suppression. RN derives it from inputMode (`inputMode !== 'none'`)
    // when inputMode is set, else uses the explicit value (TextInput.js:935).
    showSoftInputOnFocus?: boolean;
    returnKeyType?: string;
    selectTextOnFocus?: boolean;
    scrollEnabled?: boolean;
    numberOfLines?: number;
    textAlign?: 'left' | 'center' | 'right';
    blurOnSubmit?: boolean;
    // Modern W3C-aligned aliases. RN folds each to its legacy native prop in JS before
    // reaching Fabric (TextInput.js): the raw aliases are inert at the native layer, so we
    // fold them here and forward only the legacy value.
    inputMode?: IInputMode;
    enterKeyHint?: IEnterKeyHint;
    readOnly?: boolean;
    submitBehavior?: ISubmitBehavior;
    cursorColor?: string;
    selectionColor?: string;
    selectionHandleColor?: string;
    // Android-only: color of the platform EditText underline. RN defaults it to 'transparent'
    // so the Material default bar is hidden (TextInput.js:908); iOS ignores it.
    underlineColorAndroid?: string;
    // Pairs this input with an InputAccessoryView whose nativeID matches; native docks that
    // view above the keyboard while the input is focused. Forwarded via passthrough.
    inputAccessoryViewID?: string;
    style?: ITextStyle;
    // TextInput.js's own `usePressability` — the same Pressability class every Touchable uses,
    // wired so a tap inside an authored `hitSlop` but outside the native view's focus zone still
    // focuses the input. `onPress`/`onPressIn`/`onPressOut` are forwarded to the app exactly as
    // authored; `onPress` additionally focuses the input when `editable !== false`.
    hitSlop?: IRectOffset;
    onPress?: ITextInputEventHandler;
    onPressIn?: ITextInputEventHandler;
    onPressOut?: ITextInputEventHandler;

    // Fires once per native change with the event, `text` carried on it (e.g. alongside
    // `nativeEvent.eventCount`/`target`) — one argument, always a real object; see
    // `ITextInputChangeEvent`.
    onValueChange?: (event: ITextInputChangeEvent) => void;
    // TextInput.js:506 — `props.onChangeText(currentText)`, called right alongside `onChange` on
    // the SAME native change event. RN's real signature takes the bare STRING; ours cannot — an
    // individual `on*` attribute on a host tag compiles through Svelte's `target_handler`, which
    // always calls with exactly one argument, a real object (`host-tag-invariants.test.ts`, and the
    // identical reason `onValueChange` carries `text` as a FIELD rather than a second argument). So
    // `text` rides on the event exactly like `onValueChange` does — same object, same field.
    onChangeText?: (event: ITextInputChangeEvent) => void;
    onFocus?: ITextInputEventHandler;
    onBlur?: ITextInputEventHandler;
    onEndEditing?: ITextInputEventHandler;
    onSubmitEditing?: ITextInputEventHandler;
    onKeyPress?: ITextInputEventHandler;
    onSelectionChange?: ITextInputEventHandler;
    onContentSizeChange?: ITextInputEventHandler;
  };

// The callback surface AS A VALUE, so a test can enumerate it instead of restating it. A hand-kept
// second list is exactly the drift that let `onValueChange` go a month without reaching the app,
// so this one is derived: `Record` over the keys of the prop type above makes it
// exhaustive in BOTH directions — a callback declared and not listed fails to compile, and a name
// listed and not declared fails too.
//
// IT LIVES IN A SOURCE FILE ON PURPOSE. The same check written inside the test that consumes it
// would never run: every package tsconfig excludes `*.test.ts`, the root config is an empty
// references shell, and vitest strips types without checking them — so a type-level oracle in a
// test file is inert in this repo. Here `pnpm typecheck` is what enforces it.
//
// The accessibility/aria mixin's own `on*` callbacks are subtracted: they belong to every
// primitive rather than to this one, and the boolean gate they ride has its own oracle
// (`core/engine/src/__tests__/gated-event-props.test.ts`).
type ITextInputOwnCallback = Exclude<
  Extract<keyof ITextInputProps, `on${string}`>,
  Extract<keyof (IAccessibilityProps & IAriaProps), `on${string}`>
>;

const TEXT_INPUT_CALLBACKS: Record<ITextInputOwnCallback, true> = {
  onValueChange: true,
  onChangeText: true,
  onFocus: true,
  onBlur: true,
  onEndEditing: true,
  onSubmitEditing: true,
  onKeyPress: true,
  onSelectionChange: true,
  onContentSizeChange: true,
  onPress: true,
  onPressIn: true,
  onPressOut: true,
};

export const TEXT_INPUT_CALLBACK_NAMES: readonly string[] =
  Object.keys(TEXT_INPUT_CALLBACKS);

// The imperative handle RN exposes on a TextInput ref. focus/blur/clear/setSelection drive
// native view commands; isFocused is tracked JS-side from the focus/blur event pair (RN keeps
// the same state in TextInputState (there is no native getter to query).
//
// IT IS A UNION, and that is the whole point of the type. Exposing only the five TextInput
// methods below closes the node off — losing `measure`/`measureInWindow`/`measureLayout`/
// `setNativeProps`; the bare node loses the other way — no `clear`, `isFocused`, `setSelection`.
export type ITextInputHandle = {
  focus(): void;
  blur(): void;
  clear(): void;
  isFocused(): boolean;
  setSelection(start: number, end: number): void;
  // Forwarded from the engine node, so a TextInput ref is not poorer than any other host ref.
  measure(callback: IMeasureOnSuccess): void;
  measureInWindow(callback: IMeasureInWindowOnSuccess): void;
  measureLayout(
    relativeToNativeNode: ISymbioteNode | number,
    onSuccess: IMeasureLayoutOnSuccess,
    onFail?: () => void,
  ): void;
  setNativeProps(nativeProps: Record<string, unknown>): void;
};
