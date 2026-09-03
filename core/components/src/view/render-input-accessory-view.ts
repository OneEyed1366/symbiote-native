// InputAccessoryView: the render half (framework-agnostic, iOS). A real Fabric host node,
// RCTInputAccessoryView, that docks its content above the keyboard. It is referenced by
// `nativeID`, which a TextInput points at through its `inputAccessoryViewID` prop; native pairs
// the two by id. There is no JS-side translation: style / nativeID / backgroundColor map straight
// onto the intrinsic and the user children (injected by the adapter) nest under it. Shared
// verbatim across adapters: React and Vue both bridge this Descriptor.

import {
  dlog,
  type IStyleProp,
  type IViewStyle,
} from '@symbiote-native/engine';
import { el, type IDescriptor } from '../descriptor';

// The pre-resolved inputs renderInputAccessoryView paints from. The adapter narrows the typed
// fields (nativeID / backgroundColor / style) and folds everything else (accessibility*, testID)
// into `passthrough`, which lands on the host node untouched.
export type IInputAccessoryViewViewProps = {
  // The id a TextInput's inputAccessoryViewID points at to dock above its keyboard.
  nativeID?: string;
  backgroundColor?: string;
  style?: IStyleProp<IViewStyle>;
  passthrough: Record<string, unknown>;
};

// The names this fold CONSUMES, exported so an adapter splitting props before calling the render fn
// reads the list instead of copying it — the drift `render-image.ts` records paying for once.
export const INPUT_ACCESSORY_VIEW_PROP_NAMES = [
  'nativeID',
  'backgroundColor',
  'style',
] as const;

// The whole mapping, so the wrapper path and the lowered path share ONE implementation. There is no
// aliasing here at all: every consumed name leaves under the same name, which is what makes the
// fold idempotent by construction (asserted in `behaviors/input-accessory-view.test.ts`, not
// assumed).
//
// The `undefined` guards on `nativeID` / `backgroundColor` are LOAD-BEARING, and the asymmetry with
// the unguarded `style` above is not the tell it looks like.
//
// They were removed on 2026-09-01 on the reasoning `.claude/rules/fabric-boolean-event-gates.md`
// states — `setProp` collapses an undefined value to an absent key, so a conditional write in a
// shared render fn is cosmetic — and that reasoning was checked against a payload carrying no `id`,
// which is exactly the case where it holds. The equivalence oracle caught it on its first run:
//
//   authored <InputAccessoryView id="p" testID="p" />
//   guarded    RCTInputAccessoryView{testID, nativeID:"p"}
//   unguarded  RCTInputAccessoryView{testID}              <- the alias result, deleted
//
// `nativeID` has an ALIAS SOURCE. The wrapper leaves `id` in `passthrough`, the renderer's
// PROP_ALIASES renames it to `nativeID`, and a `nativeID: undefined` written afterwards deletes what
// the rename just produced — last write wins, and `undefined` collapsing to "absent" is precisely
// what makes it destructive rather than inert. So the guard is cosmetic for a key nothing else can
// produce, and required for a key an alias also targets.
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

export function renderInputAccessoryView(
  view: IInputAccessoryViewViewProps,
): IDescriptor {
  dlog('InputAccessoryView -> RCTInputAccessoryView');

  // Empty structural children: the adapter appends the user children directly under the host.
  return el(
    'symbiote-input-accessory-view',
    mapInputAccessoryViewProps(view),
    [],
  );
}
