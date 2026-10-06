// RN's aria-* / role -> accessibility* fold, at the layer every path goes through: it can't run
// per attribute (aria-checked folds against a sibling accessibilityState), so it belongs at the
// one point where the whole bag is known, the payload build.

// The alias wins everywhere, as in RN's View.js: a scalar is assigned over the explicit prop and a
// composite field is `alias ?? existing`. accessibility-props.test.ts pins both

// Record-level rather than typed: the engine's caller has a raw node.props bag with no index
// signature. The typed resolveAccessibilityProps<T> in core/components delegates here.
import { dlog } from './debug';

// A role that falls through here passes unmapped, reaching Fabric under the wrong name with
// nothing red anywhere. Diff against RN's View.js, don't just read for plausibility.
const ROLE_TO_ACCESSIBILITY_ROLE: Readonly<Record<string, string>> = {
  alert: 'alert',
  button: 'button',
  checkbox: 'checkbox',
  combobox: 'combobox',
  grid: 'grid',
  heading: 'header',
  img: 'image',
  link: 'link',
  list: 'list',
  listitem: 'list',
  menu: 'menu',
  menubar: 'menubar',
  menuitem: 'menuitem',
  none: 'none',
  presentation: 'none',
  progressbar: 'progressbar',
  radio: 'radio',
  radiogroup: 'radiogroup',
  scrollbar: 'scrollbar',
  searchbox: 'search',
  slider: 'adjustable',
  spinbutton: 'spinbutton',
  summary: 'summary',
  switch: 'switch',
  tab: 'tab',
  tablist: 'tablist',
  timer: 'timer',
  toolbar: 'toolbar',
};

// Exported so a behavior folding a different node's bag can name these without restating the
// list — slotDerived (host-behavior.ts) takes prop names, so a derived primitive enumerates them.

// as const rather than readonly string[], so the members are literals: pickAccessibilityProps
// (Svelte adapter) indexes IAriaProps with them, and a name here not a key of IAriaProps then
// fails to compile at the use site instead of going quietly unforwarded.
export const ARIA_ALIAS_KEYS = [
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
] as const;

// An indexed loop rather than `.some(key => …)`: the callback captures `props`, so a closure is
// allocated per call, and this is the gate on a path that runs once per node.
function hasAnyAriaKey(props: Readonly<Record<string, unknown>>): boolean {
  for (let index = 0; index < ARIA_ALIAS_KEYS.length; index += 1) {
    if (props[ARIA_ALIAS_KEYS[index]] !== undefined) return true;
  }
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function fieldOf(source: unknown, field: string): unknown {
  return isRecord(source) ? source[field] : undefined;
}

function anyDefined(values: readonly unknown[]): boolean {
  for (const value of values) {
    if (value !== undefined) return true;
  }
  return false;
}

// Every scalar alias is written over the explicit prop, one input can feed two outputs and the
// second is conditional on the VALUE rather than on presence
function foldScalarAliases(
  bag: Record<string, unknown>,
  props: Readonly<Record<string, unknown>>,
): void {
  const role = props.role;
  const ariaLabelledBy = props['aria-labelledby'];
  const ariaLive = props['aria-live'];
  const ariaHidden = props['aria-hidden'];

  if (typeof ariaLabelledBy === 'string') {
    bag.accessibilityLabelledBy = ariaLabelledBy.split(/\s*,\s*/g);
  }
  if (props['aria-label'] !== undefined) {
    bag.accessibilityLabel = props['aria-label'];
  }
  if (ariaLive !== undefined) {
    bag.accessibilityLiveRegion = ariaLive === 'off' ? 'none' : ariaLive;
  }
  if (ariaHidden !== undefined) {
    bag.accessibilityElementsHidden = ariaHidden;
    if (ariaHidden === true) {
      bag.importantForAccessibility = 'no-hide-descendants';
    }
  }
  if (props['aria-modal'] !== undefined) {
    bag.accessibilityViewIsModal = props['aria-modal'];
  }
  if (typeof role === 'string') {
    bag.accessibilityRole = ROLE_TO_ACCESSIBILITY_ROLE[role] ?? role;
  }
}

// Upstream bug, ported verbatim: `checked: ariaChecked ?? accessibilityState?.checked` has no
// coercion, so a string "true" reaches native (aria-fold-parity.test.ts pins it)
// The composite is rebuilt from the known fields only, an unknown incoming field is dropped
function foldAccessibilityState(
  props: Readonly<Record<string, unknown>>,
): Record<string, unknown> | undefined {
  const existing = fieldOf(props, 'accessibilityState');
  const busy = props['aria-busy'];
  const checked = props['aria-checked'];
  const disabled = props['aria-disabled'];
  const expanded = props['aria-expanded'];
  const selected = props['aria-selected'];
  if (!anyDefined([existing, busy, checked, disabled, expanded, selected])) {
    return undefined;
  }
  return {
    busy: busy ?? fieldOf(existing, 'busy'),
    checked: checked ?? fieldOf(existing, 'checked'),
    disabled: disabled ?? fieldOf(existing, 'disabled'),
    expanded: expanded ?? fieldOf(existing, 'expanded'),
    selected: selected ?? fieldOf(existing, 'selected'),
  };
}

function foldAccessibilityValue(
  props: Readonly<Record<string, unknown>>,
): Record<string, unknown> | undefined {
  const existing = fieldOf(props, 'accessibilityValue');
  const max = props['aria-valuemax'];
  const min = props['aria-valuemin'];
  const now = props['aria-valuenow'];
  const text = props['aria-valuetext'];
  if (!anyDefined([existing, max, min, now, text])) return undefined;
  return {
    max: max ?? fieldOf(existing, 'max'),
    min: min ?? fieldOf(existing, 'min'),
    now: now ?? fieldOf(existing, 'now'),
    text: text ?? fieldOf(existing, 'text'),
  };
}

// Fold the web-alias aria-*/role props into RN's canonical accessibility* props. Returns the input
// by identity when no alias is present, keeping this off the hot path for nodes carrying none —
// and idempotent, since pass 1 blanks every alias so a second pass finds nothing.

// Alias keys are blanked to undefined rather than deleted: setProp treats undefined as a delete
// and fabricProps skips it, while a real delete would deoptimise the object's shape.
export function foldAriaProps(
  props: Record<string, unknown>,
): Record<string, unknown> {
  if (!hasAnyAriaKey(props)) return props;
  const bag: Record<string, unknown> = { ...props };

  dlog('foldAriaProps: folding aria/role aliases into accessibility* props');

  for (let index = 0; index < ARIA_ALIAS_KEYS.length; index += 1) {
    bag[ARIA_ALIAS_KEYS[index]] = undefined;
  }

  // Each helper reads the original props, the loop above has already blanked the aliases in bag
  foldScalarAliases(bag, props);
  const state = foldAccessibilityState(props);
  if (state !== undefined) bag.accessibilityState = state;
  const value = foldAccessibilityValue(props);
  if (value !== undefined) bag.accessibilityValue = value;

  return bag;
}
