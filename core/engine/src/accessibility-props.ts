// RN's `aria-*` / `role` -> `accessibility*` fold, at the layer every path goes through.
//
// WHY IT IS HERE AND NOT IN A WRAPPER. It used to run inside each primitive's COMPONENT, which is
// exactly the layer host-primitive lowering removes. A per-attribute element path cannot do it —
// `aria-checked` has to be folded against a sibling `accessibilityState` — so the four lowering
// transforms REFUSED any element carrying `role` or an `aria-*` attribute
// (`REFUSAL_CATEGORIES.bagFold`). Accessibility props are ordinary in real code, so that refusal
// cost lowering coverage on every primitive, including the three already lowered. Moving the fold
// down deletes the refusal instead of teaching four transforms a bag operation they cannot express.
//
// IT IS A MOVE, NOT A REWRITE, AND THAT IS DELIBERATE. The function carries TWO CONTRADICTORY
// PRECEDENCE RULES: for the scalars an explicit `accessibility*` WINS and the alias only fills a
// hole (`if (next.X === undefined)`), while INSIDE the `accessibilityState` / `accessibilityValue`
// composites the ALIAS wins per field (`ariaBusy ?? existing?.busy`). Both mirror RN's View.js.
// Anyone "cleaning this up" collapses them into one rule, and every component test stays green
// while real accessibility silently changes. `core/components/src/accessibility-props.test.ts`
// pins both directions; read it before touching the branches below.
//
// Record-level rather than typed, because the engine's caller has a raw `node.props` bag and an
// interface is not assignable to `Record<string, unknown>` (no index signature). The typed
// `resolveAccessibilityProps<T>` in `core/components` stays where adapters already import it and
// delegates here, keeping its own typed gate so the fast path allocates nothing.
import { dlog } from './debug';

// Copied line for line from the wrapper this replaces. The first copy silently dropped five
// entries (`button`, `grid`, `link`, `list`, `listitem`) — a role that falls through simply passes
// unmapped, so `role="listitem"` would have reached Fabric as `listitem` instead of `list` with
// nothing red anywhere. Diff this against RN's View.js rather than reading it for plausibility.
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

const ARIA_KEYS: readonly string[] = [
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

// An indexed loop rather than `.some(key => …)`: the callback captures `props`, so a closure is
// allocated per call, and this is the gate on a path that runs once per node.
function hasAnyAriaKey(props: Readonly<Record<string, unknown>>): boolean {
  for (let index = 0; index < ARIA_KEYS.length; index += 1) {
    if (props[ARIA_KEYS[index]] !== undefined) return true;
  }
  return false;
}

/**
 * Whether one key is an alias this fold consumes. `startsWith` rather than a Set lookup: this runs
 * on `setProp`, the hottest write path in the engine (32 001 writes on one benchmark create), and
 * it is guarded by the node's sticky flag so it is reached at most once per node per key. The
 * `role` comparison comes first because it is the one alias with no prefix.
 */
export function isAriaAliasKey(key: string): boolean {
  return key === 'role' || key.startsWith('aria-');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function fieldOf(source: unknown, field: string): unknown {
  return isRecord(source) ? source[field] : undefined;
}

/**
 * Fold the web-alias `aria-*` / `role` props into RN's canonical `accessibility*` props.
 *
 * Returns the input BY IDENTITY when no alias is present — the fast path that keeps this off the
 * hot path for the ~99% of nodes carrying none, and the property idempotence rests on: pass 1
 * blanks every alias, so a second pass finds nothing and returns by identity again.
 *
 * The alias keys are blanked to `undefined` rather than deleted. That is not laziness: `setProp`
 * treats an `undefined` write as a delete and `fabricProps` skips undefined, so a blanked alias
 * cannot reach Fabric, while a `delete` would deoptimise the object's shape on every folded node.
 */
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

  for (let index = 0; index < ARIA_KEYS.length; index += 1) {
    bag[ARIA_KEYS[index]] = undefined;
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

  // RULE TWO, INSIDE the composites: the polarity INVERTS and the ALIAS wins per field. Read from
  // the ORIGINAL props, not from `bag` — the loop above has already blanked the aliases there.
  //
  // UPSTREAM-BUG(react-native): View.js:96 is `checked: ariaChecked ?? accessibilityState?.checked`
  // — NO type coercion. A template writes `aria-checked="true"` as a STRING in every framework we
  // support, so `accessibilityState.checked` reaches native as `'true'` where the native side
  // declares `boolean | 'mixed'`. Ported verbatim for parity; do NOT add a cast without recording
  // a deliberate divergence. Found by the Svelte session 2026-08-31 and pinned as an ASSERTION in
  // `adapters/svelte/src/aria-fold-parity.test.ts`, so a future decision to coerce shows up as a
  // failing test at the point the decision was made rather than as a silent behaviour change.
  //
  // A SECOND, SMALLER DIVERGENCE, and this one is ours rather than upstream's — it predates the
  // move down and is kept only because changing it here would be an undeclared behaviour change:
  // upstream gates the composite on `!= null` (View.js:87-92) and this gates on `!== undefined`.
  // So an explicit `aria-busy={null}` builds an all-undefined `accessibilityState` here and builds
  // nothing upstream. The VALUES agree either way — `??` treats null and undefined alike — so only
  // the composite's existence differs.
  //
  // The composite is REPLACED by a fresh literal listing exactly the known fields, so an unknown
  // field riding on the incoming object is dropped. Faithful to RN and pinned by a test; it is the
  // shape of bug that only shows for whoever passes a field RN adds later.
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
