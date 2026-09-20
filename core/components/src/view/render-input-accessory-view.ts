// InputAccessoryView: the framework-agnostic prop SHAPE (iOS). The tag commits a real Fabric host
// node, RCTInputAccessoryView, that docks its content above the keyboard; it is referenced by
// `nativeID`, which a TextInput points at through its `inputAccessoryViewID` prop, and native pairs
// the two by id. There is no JS-side translation — style / nativeID / backgroundColor map straight
// onto the intrinsic.
//
// THE MAPPING FUNCTION IS GONE (2026-09-18) and only the type is left, which is the honest residue:
// `mapInputAccessoryViewProps` took the bag apart and put it back together unchanged, so the
// behavior stopped calling it and nothing else ever did. Angular still names the type for its
// `@Input()` declarations (`adapters/angular/src/elements.ts`), so the shape stays; the fold does
// not. Why it was never a rule, and the numeric `backgroundColor` it used to drop:
// `core/components/src/behaviors/input-accessory-view.ts`.

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

// WHAT THE DELETED FOLD KNEW THAT THIS FILE NO LONGER HAS TO, kept because the trap is a property
// of the engine and outlives the function that hit it. The `undefined` guards on `nativeID` /
// `backgroundColor` were LOAD-BEARING, and not for the reason they look it:
//
//   authored <input-accessory-view id="p" testID="p">
//   guarded    RCTInputAccessoryView{testID, nativeID:"p"}
//   unguarded  RCTInputAccessoryView{testID}              <- the alias result, deleted
//
// `setProp` collapses an undefined value to an absent key, so a conditional write is normally
// cosmetic (`.claude/rules/fabric-boolean-event-gates.md`) — it is destructive precisely when the
// key has an ALIAS SOURCE. `id` arrives, something renames it to `nativeID`, and a
// `nativeID: undefined` written afterwards deletes what the rename just produced. Removing the
// guards on that reasoning cost a day on 2026-09-01.
//
// It cannot recur here, and that is the point: the rename is `foldIdAlias` in
// `SymbioteFabricProps.cpp` now, one rule at the end of the payload build with nothing downstream
// of it to overwrite the result. Anything that reintroduces a JS-side alias for this tag
// reintroduces the trap with it.
