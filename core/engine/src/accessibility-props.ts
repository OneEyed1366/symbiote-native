// RN's aria-* / role -> accessibility* fold, at the layer every path goes through: it can't run
// per attribute (aria-checked folds against a sibling accessibilityState), so it belongs at the
// one point where the whole bag is known, the payload build.

// A move, not a rewrite: the function carries two contradictory precedence rules — scalars let an
// explicit accessibility* win, alias only fills a hole; the composites let the alias win per field
// instead. Both mirror RN's View.js. accessibility-props.test.ts pins both directions.

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

  const role = bag.role;
  const ariaLabel = bag['aria-label'];
  const ariaLabelledBy = bag['aria-labelledby'];
  const ariaLive = bag['aria-live'];
  const ariaHidden = bag['aria-hidden'];
  const ariaBusy = bag['aria-busy'];
  const ariaChecked = bag['aria-checked'];
  const ariaDisabled = bag['aria-disabled'];
  const ariaExpanded = bag['aria-expanded'];
  const ariaSelected = bag['aria-selected'];
  const ariaModal = bag['aria-modal'];
  const ariaValueMax = bag['aria-valuemax'];
  const ariaValueMin = bag['aria-valuemin'];
  const ariaValueNow = bag['aria-valuenow'];
  const ariaValueText = bag['aria-valuetext'];

  for (let index = 0; index < ARIA_ALIAS_KEYS.length; index += 1) {
    bag[ARIA_ALIAS_KEYS[index]] = undefined;
  }

  // RULE ONE, for every scalar: the explicit prop WINS, the alias only fills a hole.
  if (
    typeof ariaLabelledBy === 'string' &&
    bag.accessibilityLabelledBy === undefined
  ) {
    bag.accessibilityLabelledBy = ariaLabelledBy.split(/\s*,\s*/g);
  }

  if (ariaLabel !== undefined && bag.accessibilityLabel === undefined) {
    bag.accessibilityLabel = ariaLabel;
  }

  if (ariaLive !== undefined && bag.accessibilityLiveRegion === undefined) {
    bag.accessibilityLiveRegion = ariaLive === 'off' ? 'none' : ariaLive;
  }

  // One input, TWO outputs, and the second is conditional on the VALUE rather than on presence.
  if (ariaHidden !== undefined) {
    if (bag.accessibilityElementsHidden === undefined) {
      bag.accessibilityElementsHidden = ariaHidden;
    }
    if (ariaHidden === true && bag.importantForAccessibility === undefined) {
      bag.importantForAccessibility = 'no-hide-descendants';
    }
  }

  if (ariaModal !== undefined && bag.accessibilityViewIsModal === undefined) {
    bag.accessibilityViewIsModal = ariaModal;
  }

  if (typeof role === 'string' && bag.accessibilityRole === undefined) {
    bag.accessibilityRole = ROLE_TO_ACCESSIBILITY_ROLE[role] ?? role;
  }

  // Rule two, inside the composites: the polarity inverts and the alias wins per field. Read from
  // the original props, not bag — the loop above has already blanked the aliases there.

  // Upstream bug, ported verbatim: RN's View.js does `checked: ariaChecked ?? accessibilityState
  // ?.checked` with no coercion, so a string "true" reaches native where it declares boolean |
  // 'mixed'. No cast without recording a divergence (aria-fold-parity.test.ts pins it).

  // A second, smaller divergence, ours rather than upstream's: upstream gates the composite on
  // `!= null`, this on `!== undefined`, so `aria-busy={null}` builds an all-undefined
  // accessibilityState here but nothing upstream — the values agree either way.

  // The composite is replaced by a fresh literal listing exactly the known fields, so an unknown
  // field riding on the incoming object is dropped, faithful to RN.
  const existingState = fieldOf(props, 'accessibilityState');
  if (
    existingState !== undefined ||
    ariaBusy !== undefined ||
    ariaChecked !== undefined ||
    ariaDisabled !== undefined ||
    ariaExpanded !== undefined ||
    ariaSelected !== undefined
  ) {
    bag.accessibilityState = {
      busy: ariaBusy ?? fieldOf(existingState, 'busy'),
      checked: ariaChecked ?? fieldOf(existingState, 'checked'),
      disabled: ariaDisabled ?? fieldOf(existingState, 'disabled'),
      expanded: ariaExpanded ?? fieldOf(existingState, 'expanded'),
      selected: ariaSelected ?? fieldOf(existingState, 'selected'),
    };
  }

  const existingValue = fieldOf(props, 'accessibilityValue');
  if (
    existingValue !== undefined ||
    ariaValueMax !== undefined ||
    ariaValueMin !== undefined ||
    ariaValueNow !== undefined ||
    ariaValueText !== undefined
  ) {
    bag.accessibilityValue = {
      max: ariaValueMax ?? fieldOf(existingValue, 'max'),
      min: ariaValueMin ?? fieldOf(existingValue, 'min'),
      now: ariaValueNow ?? fieldOf(existingValue, 'now'),
      text: ariaValueText ?? fieldOf(existingValue, 'text'),
    };
  }

  return bag;
}
