// InputAccessoryView's host behavior — and as of 2026-09-18 it is a REGISTRATION and nothing else.
//
// THE FOLD IS GONE, not moved, and that is the finding rather than an omission. Read end to end it
// split the bag into consumed/passthrough and reassembled it: there was no aliasing at all, every
// consumed name left under the same name, and the one thing it actually changed was dropping a
// `nativeID` or `backgroundColor` that was not a `string`. That is defensive narrowing of a typed
// view object, not a rule native cares about — and it was WRONG on `backgroundColor`, whose
// validAttributes entry carries `processColor` and therefore accepts a number. So the tag commits
// the same payload with no fold and no engine rule, pays no JSI round trip per node to find that
// out, and gains a numeric colour it used to lose. Contract:
// `core/engine/cpp/tests/js/touchable-payload.itest.ts`.
//
// A fold that exists to re-shape a typed object is not a behavior. The one that had to move — the
// `id -> nativeID` alias — is `foldIdAlias` in `SymbioteFabricProps.cpp` now, applied to every
// tagged node rather than per primitive.
//
// PLATFORM. This is the only primitive in its group that is not platform-invariant in what it
// COMMITS TO: `input-accessory-view` resolves to `RCTInputAccessoryView` on iOS and to a
// plain `RCTView` on Android. The fold itself is platform-invariant on purpose. What it does NOT do
// is fix the pre-existing Android divergence underneath it:
// upstream RN renders NOTHING there (`InputAccessoryView.js` — `console.warn('<InputAccessoryView>
// is only supported on iOS.'); return null`), while we commit an RCTView, and `backgroundColor` is
// a declared prop of the iOS view but a style key on RCTView. Both predate this behavior; neither
// is in scope here.
import {
  registerHostBehavior,
  type ISymbioteNode,
} from '@symbiote-native/engine';

export const INPUT_ACCESSORY_VIEW_TAG = 'input-accessory-view';

// Required by IHostBehavior and deliberately empty: this primitive owns no per-node runtime.
// Written out rather than shared with a `noop` so the emptiness reads as a decision.
function attach(_node: ISymbioteNode): void {
  // nothing to set up
}

function detach(_node: ISymbioteNode): void {
  // nothing to release
}

export function registerInputAccessoryViewBehavior(): void {
  registerHostBehavior(INPUT_ACCESSORY_VIEW_TAG, { attach, detach });
}
