// The accessibility prop surface shared by every user-facing component. symbiote
// forwards any non-function / non-style prop straight to Fabric (engine's
// fabricProps pass-through), so the canonical `accessibility*` props need no
// wiring beyond being declared here. The web-alias `aria-*` / `role` props are
// the exception: native reads only `accessibility*`, so they must be normalized
// in JS before commit; `resolveAccessibilityProps` does that, mirroring RN's
// own View.js transform. Types are kept in sync with RN's ViewAccessibility.js.
//
// Framework-agnostic (imports only @symbiote-native/engine), so every adapter (React,
// Vue, and the next) folds aria/role into accessibility* identically.

import { foldAriaProps, type ISymbioteEvent } from '@symbiote-native/engine';

// Kept in sync with the AccessibilityRolesMask in RN's RCTViewManager.m
// (ViewAccessibility.js `AccessibilityRole`). The trailing `string & {}` keeps
// it open-ended exactly like RN (unknown/future roles still type-check) while
// preserving editor autocomplete for the named members.
export type IAccessibilityRole =
  | 'none'
  | 'button'
  | 'dropdownlist'
  | 'togglebutton'
  | 'link'
  | 'search'
  | 'image'
  | 'keyboardkey'
  | 'text'
  | 'adjustable'
  | 'imagebutton'
  | 'header'
  | 'summary'
  | 'alert'
  | 'checkbox'
  | 'combobox'
  | 'menu'
  | 'menubar'
  | 'menuitem'
  | 'progressbar'
  | 'radio'
  | 'radiogroup'
  | 'scrollbar'
  | 'spinbutton'
  | 'switch'
  | 'tab'
  | 'tabbar'
  | 'tablist'
  | 'timer'
  | 'list'
  | 'toolbar'
  | 'grid'
  | 'pager'
  | 'scrollview'
  | 'horizontalscrollview'
  | 'viewgroup'
  | 'webview'
  | 'drawerlayout'
  | 'slidingdrawer'
  | 'iconmenu'
  | (string & {});

// The web-aligned role values accepted by the `role` alias (RN's `Role`).
export type IRole =
  | 'alert'
  | 'alertdialog'
  | 'application'
  | 'article'
  | 'banner'
  | 'button'
  | 'cell'
  | 'checkbox'
  | 'columnheader'
  | 'combobox'
  | 'complementary'
  | 'contentinfo'
  | 'definition'
  | 'dialog'
  | 'directory'
  | 'document'
  | 'feed'
  | 'figure'
  | 'form'
  | 'grid'
  | 'group'
  | 'heading'
  | 'img'
  | 'link'
  | 'list'
  | 'listitem'
  | 'log'
  | 'main'
  | 'marquee'
  | 'math'
  | 'menu'
  | 'menubar'
  | 'menuitem'
  | 'meter'
  | 'navigation'
  | 'none'
  | 'note'
  | 'option'
  | 'presentation'
  | 'progressbar'
  | 'radio'
  | 'radiogroup'
  | 'region'
  | 'row'
  | 'rowgroup'
  | 'rowheader'
  | 'scrollbar'
  | 'searchbox'
  | 'separator'
  | 'slider'
  | 'spinbutton'
  | 'status'
  | 'summary'
  | 'switch'
  | 'tab'
  | 'table'
  | 'tablist'
  | 'tabpanel'
  | 'term'
  | 'timer'
  | 'toolbar'
  | 'tooltip'
  | 'tree'
  | 'treegrid'
  | 'treeitem';

export interface IAccessibilityStateValue {
  disabled?: boolean;
  selected?: boolean;
  checked?: boolean | 'mixed';
  busy?: boolean;
  expanded?: boolean;
}

export interface IAccessibilityValue {
  min?: number;
  max?: number;
  now?: number;
  text?: string;
}

export interface IAccessibilityActionInfo {
  name: string;
  label?: string;
}

export interface IAccessibilityProps {
  // --- host-node identity anchors ---
  // Not accessibility props per se, but RN puts them on ViewProps so EVERY host view
  // carries them; symbiote's one shared base is this interface, so they live here to
  // reach every component (both adapters) without each redeclaring them. Both forward
  // straight to Fabric via the non-function/non-style pass-through (no extra wiring).
  // testID: the e2e / native-side lookup anchor (Detox by.id). nativeID: a stable
  // native handle (focus anchor / cross-node lookup), distinct from testID.
  testID?: string;
  nativeID?: string;

  // --- cross-platform ---
  accessible?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: IAccessibilityRole;
  accessibilityState?: IAccessibilityStateValue;
  accessibilityValue?: IAccessibilityValue;
  accessibilityActions?: ReadonlyArray<IAccessibilityActionInfo>;

  // --- Android-only (harmless on iOS: native ignores unknown props) ---
  accessibilityLabelledBy?: string | string[];
  importantForAccessibility?: 'auto' | 'yes' | 'no' | 'no-hide-descendants';
  accessibilityLiveRegion?: 'none' | 'polite' | 'assertive';
  screenReaderFocusable?: boolean;

  // --- iOS-only (harmless on Android: native ignores unknown props) ---
  accessibilityViewIsModal?: boolean;
  accessibilityElementsHidden?: boolean;
  accessibilityIgnoresInvertColors?: boolean;
  accessibilityLanguage?: string;
  accessibilityRespondsToUserInteraction?: boolean;
  accessibilityShowsLargeContentViewer?: boolean;
  accessibilityLargeContentTitle?: string;

  // --- accessibility event handlers (wired by the shared-events layer) ---
  // cross-platform; nativeEvent.actionName names the triggered action
  onAccessibilityAction?: (event: ISymbioteEvent) => void;
  // iOS-only
  onAccessibilityTap?: (event: ISymbioteEvent) => void;
  // iOS-only
  onMagicTap?: (event: ISymbioteEvent) => void;
  // iOS-only
  onAccessibilityEscape?: (event: ISymbioteEvent) => void;
}

// Web-alias props. A component opts into these by including AriaProps; the
// `resolveAccessibilityProps` transform folds them into the canonical
// `accessibility*` props before they reach native (which never reads `aria-*`).
export interface IAriaProps {
  role?: IRole;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-live'?: 'polite' | 'assertive' | 'off';
  'aria-hidden'?: boolean;
  'aria-busy'?: boolean;
  'aria-checked'?: boolean | 'mixed';
  'aria-disabled'?: boolean;
  'aria-expanded'?: boolean;
  'aria-selected'?: boolean;
  'aria-modal'?: boolean;
  'aria-valuemax'?: number;
  'aria-valuemin'?: number;
  'aria-valuenow'?: number;
  'aria-valuetext'?: string;
}

// The gate's key list, typed against `IAriaProps` so a new alias added to that interface and
// forgotten here is a type error. The engine carries its own untyped copy for the lowered path;
// `core/engine/src/accessibility-props.ts` is the single implementation of the FOLD, this is only
// the cheap probe that decides whether to call it.
const ARIA_KEYS: ReadonlyArray<keyof IAriaProps> = [
  'role',
  'aria-label',
  'aria-labelledby',
  'aria-live',
  'aria-hidden',
  'aria-busy',
  'aria-checked',
  'aria-disabled',
  'aria-expanded',
  'aria-selected',
  'aria-modal',
  'aria-valuemax',
  'aria-valuemin',
  'aria-valuenow',
  'aria-valuetext',
];

// An indexed loop rather than `.some(key => …)`: the callback captures `props`, so the closure is
// allocated on every call, and this runs once per accessibility-bearing component instance — 8 000
// of them on one benchmark create. The fifteen property reads it replaces the closure with are
// cheaper than the allocation.
function hasAnyAriaKey(props: IAriaProps): boolean {
  for (let index = 0; index < ARIA_KEYS.length; index += 1) {
    if (props[ARIA_KEYS[index]] !== undefined) return true;
  }
  return false;
}

/**
 * The typed entry point adapters import. The FOLD itself now lives in `@symbiote-native/engine`
 * (`core/engine/src/accessibility-props.ts`) so it runs at the layer every path goes through —
 * including a LOWERED element, which has no component wrapper to run it. This function stays here
 * because the public types do, and because it keeps the typed gate: `hasAnyAriaKey` is checked
 * before anything is allocated, so the ~99% of nodes carrying no alias cost the same as before.
 *
 * Idempotent by construction, and that is load-bearing now that the engine folds too: pass 1 blanks
 * every alias, so a wrapper still calling this after the engine has run finds nothing and returns
 * by identity.
 */
export function resolveAccessibilityProps<
  T extends IAccessibilityProps & IAriaProps,
>(props: T): T {
  if (!hasAnyAriaKey(props)) return props;
  // `Object.entries` rather than a spread: an interface has no index signature, so a spread of `T`
  // is not assignable to `Record<string, unknown>` and the alternative would be a cast. Paid only
  // on the folding path, never on the gate.
  const folded = foldAriaProps(Object.fromEntries(Object.entries(props)));
  return Object.assign({}, props, folded);
}
