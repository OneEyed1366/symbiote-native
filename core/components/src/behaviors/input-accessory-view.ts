// InputAccessoryView's host behavior. This file itself still owns no per-node runtime — the
// primitive's real rule lives in `foldInputAccessoryViewProps` (`SymbioteFabricProps.cpp`) now.
//
// THE OLD FOLD WAS GONE, not moved (2026-09-18): read end to end it split the bag into
// consumed/passthrough and reassembled it — there was no aliasing at all, every consumed name left
// under the same name, and the one thing it actually changed was dropping a `nativeID` or
// `backgroundColor` that was not a `string`. That is defensive narrowing of a typed view object,
// not a rule native cares about — and it was WRONG on `backgroundColor`, whose validAttributes
// entry carries `processColor` and therefore accepts a number.
//
// A REAL RULE WAS FOUND WHILE READING VENDOR FOR THE PORT (2026-09-20):
// `InputAccessoryView.js`'s `styles.container = {position: 'absolute'}`, composed AFTER the app's
// own style (`[props.style, styles.container]`) so it wins over any `position` an app authors.
// Every InputAccessoryView is positioned absolutely; nothing about it is per-instance, so it is
// `foldInputAccessoryViewProps` now rather than anything here. Contract:
// `core/engine/cpp/tests/js/touchable-payload.itest.ts`.
//
// NOT YET PORTED, and recorded honestly rather than silently skipped: vendor also wraps the app's
// children in an inner `SafeAreaView` sized to `useWindowDimensions().width` (`InputAccessoryView.js`
// render body) and returns nothing at all when it has zero children. Both are real structural gaps
// — a composed child node plus a live window-dimension binding — genuinely larger than a tag-only
// rule, and are NOT covered by this pass.
//
// TODO(rn-parity): port both. Needs (a) a `buildStructure` composing an inner wrapper node styled
// `{flex: 1, width}` around the app's children, with `width` read from a live window-dimensions
// subscription (no `SafeAreaView` primitive exists in this codebase yet — it would need building),
// and (b) suppressing the whole node (both platforms, not just Android's void case already fixed
// here) when it has zero children, matching `React.Children.count(props.children) === 0`.
//
// The `id -> nativeID` alias — is `foldIdAlias` in `SymbioteFabricProps.cpp`, applied to every
// tagged node rather than per primitive.
//
// PLATFORM. This is the only primitive in its group that is not platform-invariant in what it
// COMMITS TO: `input-accessory-view` resolves to `RCTInputAccessoryView` on iOS and to a
// plain `RCTView` on Android. The fold itself is platform-invariant on purpose.
//
// FIXED (2026-09-20). `InputAccessoryView.js` on Android does `console.warn('<InputAccessoryView>
// is only supported on iOS.'); return null` — the WHOLE component, children included, renders
// NOTHING. We used to commit a real `RCTView` and its whole children subtree (the toolbar content
// an app wrapped in it) — an extra, laid-out, potentially visible view where a real device shows
// none. `backgroundColor` being a declared iOS prop vs an Android style key is the SAME already-
// narrow gap, unaffected by this.
//
// The fix needed a new engine primitive, because every existing "commits no node of its own"
// tier-2 primitive (`touchable-native-feedback`, `touchable-without-feedback`) is an ANCHOR — it
// hoists its single child up in its own place, which is the opposite of what this tag needs: its
// whole subtree must vanish. `VOID_COMPONENT` (`core/engine/src/node.ts`, `OP_CREATE_VOID` in
// `mutation-buffer.ts`) is that primitive — a node the commit walk stops at, recursively,
// contributing neither itself nor its children. Wired purely through
// `core/components/src/component-names/index.android.ts`'s per-platform table, the same seam
// `ANCHOR_COMPONENT` already used — this behavior file needed no change at all.
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
