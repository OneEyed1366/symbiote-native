// Metro rewrites every compiled `from 'vue'` import to point HERE instead of at bare
// @vue/runtime-core (see examples/*/metro-vue-transformer.js). Most compiler-injected helpers
// (ref, computed, withDirectives, openBlock, ...) live in runtime-core untouched, re-exported
// below. But two Vue template directives compile to a runtime-helper import that ONLY exists in
// @vue/runtime-dom (vShow, vModelText, vModelCheckbox, vModelSelect), written directly against a
// real HTMLElement - we have no DOM, so this module supplies our OWN implementation under the
// same export name instead of leaving `v-show` a silent no-op.
//
// Scope: Vue's own template directives (v-show, Teleport) and, since host-primitive lowering
// landed, `v-model` on an ELEMENT — see vModelText below for why that stopped being out of scope.

export * from '@vue/runtime-core';

import {
  getCurrentInstance,
  mergeProps as baseMergeProps,
  normalizeClass,
  normalizeStyle as baseNormalizeStyle,
  warn,
  type ObjectDirective,
} from '@vue/runtime-core';
import {
  componentOf,
  propOf,
  requestCommitFor,
  setNativeProps,
  setProp,
  whenCommitted,
  type ISymbioteEvent,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { descriptorFor, SWITCH_TAG } from '@symbiote-native/components';

// Shadows runtime-core's own Teleport for every compiled `from 'vue'` import (see the header):
// same component, plus a runtime guard on `to`. Lives in ../create-portal so the adapter's portal
// sits where every other adapter's does; re-exported here because THIS is the module Metro
// rewrites `vue` to, and an `export *` alone would resolve `Teleport` to the unguarded original.
export { Teleport, type ITeleportTarget } from '../create-portal';

// Shadows @vue/shared's own `normalizeProps` for every compiled `from 'vue'` import, for ONE
// divergence: a FUNCTION-valued `style` survives it.
//
// `v-bind="obj"` compiles to `_normalizeProps(_guardReactiveProps(obj))`, and Vue's version runs
// `normalizeStyle` over the style key. That helper knows array / string / object and returns
// `undefined` for a function — so `style: ({ pressed }) => …` arriving inside a spread is destroyed
// before any adapter code runs, with no error and nothing red. A functional style is a React Native
// idiom the engine resolves in `routeProp` (`isStyleCallback`); Vue's normaliser is DOM-shaped and
// cannot know that.
//
// Measured 2026-09-01 through the real SFC pipeline, which is the ONLY path that reaches this:
// `h(Component, { ...bag })` skips `normalizeProps` entirely and shows the style arriving intact,
// so a probe written that way reports the bug as absent.
//
//   <View v-bind="bag">       fn style   committed {testID}              <- style gone
//   <Pressable v-bind="bag">  fn style   committed {testID}              <- style gone
//   either, object style                 committed {testID, opacity}     <- fine
//
// EVERY primitive, not only the stateful ones — both arms measured. Only `style`: `normalizeClass`
// has no equivalent hazard that anyone has shown, and an override wider than the measured defect is
// how one adapter's problem becomes a shared law.
//
// MIRRORS Vue's four lines rather than delegating to them, because hiding the key from the original
// and restoring it afterwards would mutate the caller's object twice. The normalisation itself is
// still Vue's — only the dispatch is ours, and `normalize-props.test.ts` pins it against the
// compiled path.
export function normalizeProps(
  props: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!props) return null;
  const { class: klass, style } = props;
  if (klass && typeof klass !== 'string') props.class = normalizeClass(klass);
  if (style && typeof style !== 'function')
    props.style = baseNormalizeStyle(style);
  return props;
}

// The SECOND door to the same defect, and the one the first fix missed. `v-bind="rest"` standing
// beside a separate `:style="fn"` does not compile to `normalizeProps` at all — it compiles to
// `mergeProps`, whose own `style` branch is `ret.style = normalizeStyle([ret.style, toMerge.style])`.
// The array branch of `normalizeStyle` drops a function element, so the callback dies here too:
//
//   <View v-bind="bag" />                  normalizeProps   <- fixed above
//   <View v-bind="rest" :style="fn" />     mergeProps       <- fixed here
//   <View :style="fn" />                   neither          <- was never broken
//
// Delegates the whole merge — classes, event-handler concatenation, key precedence — and only
// rescues the callback afterwards, scanning the args in mergeProps' own order so LAST wins. A
// later non-function `style` clears it again, which is that same precedence.
//
// The merge itself cannot be preserved when one side is a callback: a function returns a COMPLETE
// style, so there is nothing to merge it into. It replaces, which is also how React Native's own
// contract reads it (`Pressable.js`: `ViewStyleProp | ((state) => ViewStyleProp)` — the callback is
// top-level, never an array element, so `:style="[a, fn]"` is out of contract here exactly as it is
// there, and is deliberately NOT rescued).
// The THIRD door, and the one that decides whether the state-style split can leave the transforms
// at all. A `:style` binding on a lowered element compiles to `_normalizeStyle(expr)` whenever the
// compiler cannot keep it on the cheap patch-flag path — an inline arrow and a call expression both
// do, a bare identifier does not. So `<Pressable :style="({pressed}) => …" />` loses its callback
// here, and today nothing notices because the lowering transform rewrites that attribute into a
// resting/active pair before Vue ever emits the helper.
//
// A TOP-LEVEL function is preserved; one nested inside an array is not, and that asymmetry is the
// contract rather than an omission. React Native types the prop
// `ViewStyleProp | ((state) => ViewStyleProp)` (`Pressable.js`), so the callback is top-level or it
// is not a callback, and the engine's `isStyleCallback` reads it the same way. Rescuing an array
// element would invent a shape neither side supports.
export function normalizeStyle(value: unknown): unknown {
  if (typeof value === 'function') return value;
  return baseNormalizeStyle(value as Parameters<typeof baseNormalizeStyle>[0]);
}

export function mergeProps(
  ...args: Record<string, unknown>[]
): Record<string, unknown> {
  const merged = baseMergeProps(...args);
  let callback: unknown;
  for (const arg of args) {
    if (arg === null || arg === undefined || !('style' in arg)) continue;
    callback = typeof arg.style === 'function' ? arg.style : undefined;
  }
  if (callback !== undefined) merged.style = callback;
  return merged;
}

// whenCommitted, not a direct call: Vue's `mounted` hook fires synchronously during the patch
// pass, but this renderer coalesces the actual Fabric commit onto a microtask
// (surface.requestCommit()), so the node may have no committed tag yet - the same async-commit
// race TextInput's autoFocus guards against. A bare setNativeProps here would silently no-op
// with no retry on the very first mount.
const pendingShowCommits = new WeakMap<ISymbioteNode, () => void>();

function applyShow(el: ISymbioteNode, value: boolean): void {
  pendingShowCommits.get(el)?.();
  const cancel = whenCommitted(el, () =>
    setNativeProps(el, { style: { display: value ? undefined : 'none' } }),
  );
  pendingShowCommits.set(el, cancel);
}

export const vShow: ObjectDirective<ISymbioteNode, boolean> = {
  mounted: (el, { value }) => applyShow(el, value),
  updated: (el, { value }) => applyShow(el, value),
  // Drop a still-pending first-commit wait if the element unmounts before it ever lands.
  unmounted: el => pendingShowCommits.get(el)?.(),
};

// `v-model` on an ELEMENT, which is what a lowered `<TextInput>` now is. Device-found 2026-08-31 in
// examples/vue-sfc's canary: the field echoed keystrokes and the greeting beside it never left
// "Hello, stranger".
//
// THE COMPILER PICKS A DIFFERENT TARGET FOR AN ELEMENT THAN FOR A COMPONENT, and that is the whole
// defect. On a component `v-model="name"` expands to the prop/emit pair `modelValue` +
// `onUpdate:modelValue`, which the wrapper reads. On an element it expands to a RUNTIME DIRECTIVE:
//
//   _withDirectives(_createElementBlock("symbiote-text-input", {
//     "onUpdate:modelValue": $event => (name.value = $event)
//   }), [[_vModelText, name.value]])
//
// Measured identical on BOTH Vue paths — `@vue/compiler-sfc` and `babel-jsx.cjs` emit the same two
// lines — which is why the repair is here and not in the two lowering transforms. One runtime
// implementation also covers a hand-written `h('symbiote-text-input', …)`, the fourth path, exactly
// as `PROP_ALIASES` covers all four for `id` -> `nativeID`.
//
// AND IT FAILED SILENTLY, which is the part worth remembering. `vModelText` lives in
// @vue/runtime-dom, so the compiled import resolved to `undefined` here — and `withDirectives`
// guards with `if (dir)`, so an undefined directive is SKIPPED rather than thrown. No error, no
// warning, and native echoes the keystrokes on its own, so the field looks alive while every value
// derived from it is frozen.
//
// The two channels below are the machine's, not the DOM's: the value goes down as the `value` prop
// that `core/components/src/behaviors/text-input.ts` reads for its controlled write, and the text
// comes back through `onValueChange`, the fold that behavior does over the raw `change` payload.

type IValueChangeListener = (text: string, event: ISymbioteEvent) => void;
type IModelAssign = (value: string | number) => void;

interface IModelState {
  // `onUpdate:modelValue` off the vnode, refreshed every beat: Vue re-creates the arrow on each
  // render, so a captured one goes stale against the current closure.
  assign: IModelAssign | undefined;
  // Whatever the app itself bound to `onValueChange`. `v-model` and `@value-change` on one element
  // both work on the component path (the wrapper emits both), so lowering must not make them
  // exclusive — the wrapper below calls the app's first, then assigns.
  appListener: IValueChangeListener | undefined;
  trim: boolean;
  number: boolean;
  listener: IValueChangeListener;
}

const modelStates = new WeakMap<ISymbioteNode, IModelState>();

// Runtime guards, not casts: both slots are read out of untyped bags — `vnode.props` and
// `node.props` are `Record<string, unknown>` — and `typeof x === 'function'` alone narrows to the
// bare `Function`, which carries no signature.
function isModelAssign(value: unknown): value is IModelAssign {
  return typeof value === 'function';
}

function isValueChangeListener(value: unknown): value is IValueChangeListener {
  return typeof value === 'function';
}

// Vue merges duplicate handlers into an array, so the assigner is either a function or a list of
// them — the same shape upstream's `getModelAssigner` normalises.
function modelAssigner(
  props: Record<string, unknown> | null,
): IModelAssign | undefined {
  const bound = props?.['onUpdate:modelValue'] ?? props?.['onUpdate:value'];
  if (isModelAssign(bound)) return bound;
  if (!Array.isArray(bound)) return undefined;
  const fns: IModelAssign[] = bound.filter(isModelAssign);
  return value => fns.forEach(fn => fn(value));
}

function modelText(value: unknown): string {
  if (typeof value === 'string') return value;
  return value === undefined || value === null ? '' : String(value);
}

// `.trim` and `.number` are pure transforms of the text and behave exactly as upstream. `.lazy` is
// NOT: upstream implements it by listening to `change` instead of `input`, and this renderer has
// only the one native stream (RN fires `onChange` per keystroke), so there is no second event to
// switch to. It warns rather than silently behaving like the eager form.
function applyModelModifiers(
  state: IModelState,
  text: string,
): string | number {
  const trimmed = state.trim ? text.trim() : text;
  if (!state.number) return trimmed;
  const parsed = Number.parseFloat(trimmed);
  return Number.isNaN(parsed) ? trimmed : parsed;
}

function modelStateFor(el: ISymbioteNode): IModelState {
  const existing = modelStates.get(el);
  if (existing !== undefined) return existing;
  const state: IModelState = {
    assign: undefined,
    appListener: undefined,
    trim: false,
    number: false,
    listener: (text, event) => {
      state.appListener?.(text, event);
      state.assign?.(applyModelModifiers(state, text));
    },
  };
  modelStates.set(el, state);
  return state;
}

// Re-read every beat rather than installed once: the app's own `onValueChange` binding is written
// by `patchProp` during the same patch, so anything captured earlier is either missing or stale. A
// prop that is already OUR listener means nothing overwrote it and the app half is unchanged.
function syncModelListener(el: ISymbioteNode, state: IModelState): void {
  const current = propOf(el, 'onValueChange');
  if (current === state.listener) return;
  state.appListener = isValueChangeListener(current) ? current : undefined;
  setProp(el, 'onValueChange', state.listener);
}

// Vue's compiler picks the directive by ELEMENT, and for anything it does not recognise as a DOM
// input it emits `vModelText` — including a lowered `<symbiote-switch>`. Stringifying there is what
// upstream must do (a DOM input's value IS a string) and what we must not: the Switch behavior
// reads `props.value === true`, so `String(true)` pins the control OFF and no tap can move it.
// Device-confirmed on `examples/vue-sfc` 2026-09-02, both switches on `CanaryScreen`.
//
// Resolved through the shared descriptor table rather than a literal Fabric name, so the check
// follows the platform the bundle actually loaded (iOS `Switch`, Android `AndroidSwitch`) instead
// of carrying a copy of both.
const SWITCH_COMPONENT = descriptorFor(SWITCH_TAG).component;

function isSwitchNode(el: ISymbioteNode): boolean {
  return componentOf(el) === SWITCH_COMPONENT;
}

function syncModelValue(el: ISymbioteNode, value: unknown): void {
  // The READ half needs no branch: the behavior calls `onValueChange(value, event)` for both
  // primitives, and `applyModelModifiers` passes a non-string through untouched.
  if (isSwitchNode(el)) {
    setProp(el, 'value', value === true);
    requestCommitFor(el);
    return;
  }
  setProp(el, 'value', modelText(value));
  // The behavior's `afterCommit` is what turns a changed `value` into the stale-safe
  // setTextAndSelection command, and nothing else in this patch is going to ask for a commit — the
  // template no longer carries a `value` binding at all once `v-model` owns it.
  requestCommitFor(el);
}

export const vModelText: ObjectDirective<ISymbioteNode, unknown> = {
  // `created` runs BEFORE props are patched, which is exactly what the value half needs: the
  // behavior seeds its `lastNativeText` mirror from `value` on the FIRST commit, and a value that
  // arrives after that seed reads as a divergence and commands redundant text down to native.
  created(el, { value, modifiers }) {
    const state = modelStateFor(el);
    state.trim = modifiers.trim === true;
    state.number = modifiers.number === true;
    if (modifiers.lazy === true) {
      warn(
        'v-model.lazy has no effect here: this renderer has one native text stream, so there is no ' +
          'second event to defer to.',
      );
    }
    syncModelValue(el, value);
  },
  mounted(el, { value }, vnode) {
    const state = modelStateFor(el);
    state.assign = modelAssigner(vnode.props);
    syncModelListener(el, state);
    syncModelValue(el, value);
  },
  updated(el, { value }, vnode) {
    const state = modelStateFor(el);
    state.assign = modelAssigner(vnode.props);
    syncModelListener(el, state);
    syncModelValue(el, value);
  },
  unmounted(el) {
    modelStates.delete(el);
  },
};

// `withModifiers`/`withKeys`/`useCssModule` are, like vShow above, template-directive helpers
// Vue's SFC/render-function compiler imports from `'vue'` that upstream happens to define in
// @vue/runtime-dom rather than the renderer-agnostic runtime-core — even though their own logic
// never touches a DOM node. Copied here verbatim from runtime-dom's implementation (event-object
// method calls and a plain instance-options read, nothing renderer-specific), so `v-on.stop`,
// `v-on.self`, `v-on.{key}`, and `useCssModule()` resolve to a REAL shared implementation instead
// of each call site hand-rolling its own copy.

type ISystemModifier = 'ctrl' | 'shift' | 'alt' | 'meta';

type IEventModifier =
  | ISystemModifier
  | 'stop'
  | 'prevent'
  | 'self'
  | 'left'
  | 'middle'
  | 'right'
  | 'exact';

const SYSTEM_MODIFIERS: readonly ISystemModifier[] = [
  'ctrl',
  'shift',
  'alt',
  'meta',
];

type IModifierGuardableEvent = {
  stopPropagation?: () => void;
  preventDefault?: () => void;
  target?: unknown;
  currentTarget?: unknown;
  button?: number;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
};

const MODIFIER_GUARDS: {
  [K in IEventModifier]: (
    event: IModifierGuardableEvent,
    modifiers: readonly IEventModifier[],
  ) => boolean;
} = {
  stop: event => {
    event.stopPropagation?.();
    return false;
  },
  prevent: event => {
    event.preventDefault?.();
    return false;
  },
  self: event => event.target !== event.currentTarget,
  ctrl: event => !event.ctrlKey,
  shift: event => !event.shiftKey,
  alt: event => !event.altKey,
  meta: event => !event.metaKey,
  left: event => event.button !== 0,
  middle: event => event.button !== 1,
  right: event => event.button !== 2,
  exact: (event, modifiers) =>
    SYSTEM_MODIFIERS.some(
      modifier =>
        event[`${modifier}Key` as const] && !modifiers.includes(modifier),
    ),
};

type IEventHandler<TEvent> = ((event: TEvent, ...args: never[]) => unknown) & {
  _withMods?: Record<string, IEventHandler<TEvent>>;
};

/**
 * Render-function/compiled-template equivalent of `v-on.stop`/`.prevent`/`.self`/etc. `fn` is
 * typed as required, matching upstream Vue's own declaration — its runtime-only `!fn` guard below
 * (for a compiler-generated call site that could pass a falsy handler) isn't reflected in the
 * type there either.
 */
export function withModifiers<TEvent extends IModifierGuardableEvent>(
  fn: IEventHandler<TEvent>,
  modifiers: readonly IEventModifier[],
): IEventHandler<TEvent> {
  if (!fn) return fn;
  const cache = fn._withMods ?? (fn._withMods = {});
  const cacheKey = modifiers.join('.');
  return (cache[cacheKey] ??= ((event: TEvent, ...args: never[]) => {
    for (const modifier of modifiers) {
      if (MODIFIER_GUARDS[modifier](event, modifiers)) return undefined;
    }
    return fn(event, ...args);
  }) as IEventHandler<TEvent>);
}

const KEY_ALIASES: Record<string, string> = {
  esc: 'escape',
  space: ' ',
  up: 'arrow-up',
  left: 'arrow-left',
  right: 'arrow-right',
  down: 'arrow-down',
  delete: 'backspace',
};

type IKeyedEvent = { key?: string };
type IKeyedHandler<TEvent extends IKeyedEvent> = ((
  event: TEvent,
) => unknown) & {
  _withKeys?: Record<string, (event: TEvent) => unknown>;
};

// \B (non-word-boundary), not a bare capture: without it, "Enter" hyphenates to "-enter" (a
// leading dash) instead of "enter", since the very first character is otherwise still a match.
function hyphenate(camelCase: string): string {
  return camelCase.replace(/\B([A-Z])/g, '-$1').toLowerCase();
}

/**
 * Render-function/compiled-template equivalent of `v-on.enter`/`.esc`/etc. No-ops on any event
 * without a `.key` field (e.g. Symbiote's Pressable `onPress`) — same as upstream Vue's own
 * behavior on a non-keyboard DOM event, not a Symbiote-specific gap. `TextInput`'s `onKeyPress`
 * carries `nativeEvent.key`, so that is the applicable Symbiote event shape.
 */
export function withKeys<TEvent extends IKeyedEvent>(
  fn: IKeyedHandler<TEvent>,
  modifiers: readonly string[],
): (event: TEvent) => unknown {
  const cache = fn._withKeys ?? (fn._withKeys = {});
  const cacheKey = modifiers.join('.');
  return (cache[cacheKey] ??= (event: TEvent) => {
    if (event.key == null) return undefined;
    const eventKey = hyphenate(event.key);
    if (
      modifiers.some(
        modifier => modifier === eventKey || KEY_ALIASES[modifier] === eventKey,
      )
    ) {
      return fn(event);
    }
    return undefined;
  });
}

type ICssModuleMap = Record<string, Record<string, string>>;

/**
 * Reads the class map a `<style module>` SFC block compiles onto the component's own options
 * (`__cssModules`, set by @symbiote-native/css-parser's SFC compiler — see the
 * `symbiote-sfc-style-compiler` skill). Warns and returns an empty map exactly like upstream Vue
 * does when the current component has no such block, rather than throwing.
 */
export function useCssModule(name: string = '$style'): Record<string, string> {
  const instance = getCurrentInstance();
  if (!instance) {
    warn('useCssModule must be called inside setup()');
    return {};
  }
  const modules = (instance.type as { __cssModules?: ICssModuleMap })
    .__cssModules;
  if (!modules) {
    warn('Current instance does not have CSS modules injected.');
    return {};
  }
  const cssModule = modules[name];
  if (!cssModule) {
    warn(`Current instance does not have CSS module named "${name}".`);
    return {};
  }
  return cssModule;
}
