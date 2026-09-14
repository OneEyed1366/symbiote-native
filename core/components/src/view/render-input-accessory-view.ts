// InputAccessoryView: the framework-agnostic prop fold (iOS). The tag commits a real Fabric host
// node, RCTInputAccessoryView, that docks its content above the keyboard; it is referenced by
// `nativeID`, which a TextInput points at through its `inputAccessoryViewID` prop, and native pairs
// the two by id. There is no JS-side translation — style / nativeID / backgroundColor map straight
// onto the intrinsic.

import type { IStyleProp, IViewStyle } from '@symbiote-native/engine';

// The pre-resolved inputs the fold reads. The adapter narrows the typed fields (nativeID /
// backgroundColor / style) and folds everything else (accessibility*, testID) into `passthrough`,
// which lands on the host node untouched.
export type IInputAccessoryViewViewProps = {
  // The id a TextInput's inputAccessoryViewID points at to dock above its keyboard.
  nativeID?: string;
  backgroundColor?: string;
  style?: IStyleProp<IViewStyle>;
  passthrough: Record<string, unknown>;
};

// The names this fold CONSUMES, exported so an adapter splitting props beforehand reads the list
// instead of copying it — the drift `render-image.ts` records paying for once.
export const INPUT_ACCESSORY_VIEW_PROP_NAMES = [
  'nativeID',
  'backgroundColor',
  'style',
] as const;

// There is no aliasing here at all: every consumed name leaves under the same name, which is what
// makes the fold idempotent by construction (asserted in `behaviors/input-accessory-view.test.ts`,
// not assumed).
//
// The `undefined` guards on `nativeID` / `backgroundColor` are LOAD-BEARING, and the asymmetry with
// the unguarded `style` above is not the tell it looks like. They were removed on 2026-09-01 on the
// reasoning `.claude/rules/fabric-boolean-event-gates.md` states — `setProp` collapses an undefined
// value to an absent key, so a conditional write is cosmetic — and that holds only for a payload
// carrying no `id`:
//
//   authored <input-accessory-view id="p" testID="p">
//   guarded    RCTInputAccessoryView{testID, nativeID:"p"}
//   unguarded  RCTInputAccessoryView{testID}              <- the alias result, deleted
//
// `nativeID` has an ALIAS SOURCE. `id` arrives in `passthrough`, the renderer's PROP_ALIASES renames
// it to `nativeID`, and a `nativeID: undefined` written afterwards deletes what the rename just
// produced — last write wins, and `undefined` collapsing to "absent" is precisely what makes it
// destructive rather than inert. So the guard is cosmetic for a key nothing else can produce, and
// required for a key an alias also targets.
export function mapInputAccessoryViewProps(
  view: IInputAccessoryViewViewProps,
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    ...view.passthrough,
    style: view.style,
  };
  if (view.nativeID !== undefined) out.nativeID = view.nativeID;
  if (view.backgroundColor !== undefined)
    out.backgroundColor = view.backgroundColor;
  return out;
}
