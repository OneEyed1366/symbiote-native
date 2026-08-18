// Metro rewrites every compiled `from 'vue'` import to point HERE instead of at bare
// @vue/runtime-core (see examples/*/metro-vue-transformer.js). Most compiler-injected helpers
// (ref, computed, withDirectives, openBlock, ...) live in runtime-core untouched, re-exported
// below. But two Vue template directives compile to a runtime-helper import that ONLY exists in
// @vue/runtime-dom (vShow, vModelText, vModelCheckbox, vModelSelect), written directly against a
// real HTMLElement - we have no DOM, so this module supplies our OWN implementation under the
// same export name instead of leaving `v-show` a silent no-op.
//
// Scope: this covers only Vue's own template directives (v-show, Teleport); native-element
// v-model is a separate, out-of-scope case.

export * from '@vue/runtime-core';

import {
  defineComponent,
  getCurrentInstance,
  h,
  Teleport as VueTeleport,
  warn,
  type ObjectDirective,
} from '@vue/runtime-core';
import {
  isSymbioteNode,
  setNativeProps,
  whenCommitted,
  type ISymbioteNode,
} from '@symbiote-native/engine';

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

// Teleport's `to` in the DOM world is usually a CSS-selector string ('body', '#modal-root'); we
// have no querySelector, so `to` here must be an already-mounted host node - e.g. a ref to a
// persistent "overlay host" View rendered once near the app root. This wrapper shadows
// runtime-core's own Teleport purely to validate `to` BEFORE handing it to the real Teleport: a
// wrong value throws immediately here instead of silently corrupting the retained tree deep
// inside insert/remove. Scope: same-surface targets only (see the React createPortal twin,
// create-portal.ts) - Vue's own Teleport internals work unmodified once `to` resolves to a real
// ISymbioteNode.
export const Teleport = defineComponent({
  name: 'Teleport',
  inheritAttrs: false,
  props: {
    to: { type: null, default: null },
    disabled: { type: Boolean, default: false },
  },
  setup(props, { slots }) {
    return () => {
      const { to } = props;
      if (typeof to === 'string') {
        throw new Error(
          `Teleport target must be a host node ref, not a CSS-selector string ("${to}") — symbiote has no querySelector. Pass a ref to an already-rendered element instead (e.g. <View ref="overlayHost" />, then :to="overlayHost").`,
        );
      }
      if (to != null && !isSymbioteNode(to)) {
        throw new Error(
          'Teleport target is not a real host node — did you forget `.value` on a ref, or pass something symbiote never rendered?',
        );
      }
      return h(VueTeleport, { to, disabled: props.disabled }, slots);
    };
  },
});

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
