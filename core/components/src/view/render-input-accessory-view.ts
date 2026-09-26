// InputAccessoryView: the framework-agnostic prop SHAPE (iOS). The tag commits a real Fabric host
// node, RCTInputAccessoryView, that docks its content above the keyboard; it is referenced by
// `nativeID`, which a TextInput points at through its `inputAccessoryViewID` prop, and native pairs
// the two by id. There is no JS-side translation — style / nativeID / backgroundColor map straight
// onto the intrinsic.
//
// THE MAPPING FUNCTION IS GONE — only the type is left: `mapInputAccessoryViewProps` took the bag
// apart and put it back unchanged, so nothing calls it any more. Angular still names the type for
// its `@Input()` declarations (`adapters/angular/src/elements.ts`); the fold does not exist.

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

// WHAT THE DELETED FOLD KNEW: the `undefined` guards on `nativeID`/`backgroundColor` were
// load-bearing because `nativeID` has an ALIAS SOURCE (`id`) — `setProp` collapsing undefined to
// an absent key is normally cosmetic, but here it would delete what the alias fold just produced.

// It cannot recur here: the rename is `foldIdAlias` in `SymbioteFabricProps.cpp`, the LAST rule
// in the payload build with nothing downstream to overwrite it.
