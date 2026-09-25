// InputAccessoryView's host behavior owns no per-node runtime — the rule is
// `foldInputAccessoryViewProps` in C++, including the container's absolute-position style RN
// always composes over the app's own (`core/engine/cpp/tests/js/touchable-payload.itest.ts`).

// NOT YET PORTED: vendor also wraps children in an inner SafeAreaView sized to
// `useWindowDimensions().width` and renders nothing with zero children.

// TODO(rn-parity): needs a `buildStructure` wrapper node, a live window-dimensions subscription,
// and suppressing the whole node on both platforms when childless.

// Android resolves to `VOID_COMPONENT` (`core/engine/src/node.ts`, `OP_CREATE_VOID`): the commit
// walk stops there recursively, contributing neither the node nor its children — wired through
// `component-names/index.android.ts`, this behavior file needed no change.
import {
  Platform,
  registerHostBehavior,
  type ISymbioteNode,
} from '@symbiote-native/engine';

export const INPUT_ACCESSORY_VIEW_TAG = 'input-accessory-view';

// `InputAccessoryView.js:110-113` — off iOS it warns and renders nothing (the void component).
// RN warns per render; once per node is the nearest beat a tag has.
function attach(_node: ISymbioteNode): void {
  if (Platform.OS !== 'ios') {
    console.warn('<InputAccessoryView> is only supported on iOS.');
  }
}

function detach(_node: ISymbioteNode): void {
  // nothing to release
}

export function registerInputAccessoryViewBehavior(): void {
  registerHostBehavior(INPUT_ACCESSORY_VIEW_TAG, { attach, detach });
}
