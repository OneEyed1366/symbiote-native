// RefreshControl's machine, on the engine node instead of inside a framework component.
//
// WHAT THE FIVE WRAPPERS ACTUALLY DO, counted before writing this — the audit rule's instruction to
// grep the fold's OUTPUT rather than trust one wrapper. Four of the five (react, vue, solid,
// svelte) fold exactly `resolveAccessibilityProps` and forward, and that fold ALREADY runs in the
// engine at `fabricProps` on every path (the aria fold `SafeAreaView`'s spec entry cites). So there
// is nothing left for a `foldPayload` here to do, and this behavior deliberately declares none.
//
// The fifth is Angular, and it is the whole reason this file exists: it alone reproduces RN's
// CONTROLLED handshake (`RefreshControl.js:145-166`) — mirror what native last reported, and when
// the app's `refreshing` disagrees, command native back with `setNativeRefreshing`. React, Vue,
// Solid and Svelte have never had it, so a pull whose handler leaves `refreshing` false spins
// forever on four of five adapters. Moving it here closes that as a P0 parity gap rather than
// porting it four more times.
//
// ONE COMMAND NAME ON BOTH PLATFORMS — no `Platform.OS` branch, unlike Switch's snap-back
// (`setValue` / `setNativeValue`). RN sends `setNativeRefreshing` through both
// `PullToRefreshCommands` and `AndroidSwipeRefreshLayoutCommands` (`RefreshControl.js:152,157`).
//
// PLACEMENT IS NOT THIS FILE'S PROBLEM, though the tier audit once filed the primitive as
// impossible over it. iOS puts the control BESIDE the scroll view's content and Android makes it
// the scroll view's PARENT, and that decision belongs to the ScrollView, which now states it as
// data — `claimedChildren: { [REFRESH_CONTROL]: platform.claimMode }` in
// `behaviors/scroll-view/shared.ts`, honoured by the engine's `appendChild`. A claim is keyed on
// the child's FABRIC name and needs nothing from the child's own behavior, so the two are
// independent; `refresh-control-placement.test.ts` pins that both ways round.
//
// WHY THE DIVERGENCE CHECK IS DEFERRED A MICROTASK, and why `afterCommit` alone is not enough:
// `behaviors/switch.ts`'s module header, verbatim. Same shape, same two triggers, same reasons —
// an ACCEPTING app's state reaches `node.props` only after its own reconciliation, and a REJECTING
// app writes no prop at all, so the commit that `afterCommit` waits for never comes.
import {
  appListenerFor,
  dispatchViewCommand,
  dlog,
  registerHostBehavior,
  setBehaviorListener,
  type ISymbioteEvent,
  type ISymbioteNode,
} from '@symbiote-native/engine';

export const REFRESH_CONTROL_TAG = 'refresh-control';

// RN's own name for the command, sent to whichever of the two native views the platform resolved.
const SET_NATIVE_REFRESHING = 'setNativeRefreshing';

// What native LAST reported, absent until it has reported at all. Absent is not `false`: native is
// optimistic — it spins on the gesture before JS approves — so only a report can make the mirror
// authoritative, and an app that drives `refreshing` on its own initiative must never be corrected
// against a value native never claimed.
const reported = new WeakMap<ISymbioteNode, boolean>();

// Shared by both triggers — see the module header for why there are two.
function evaluateSnapBack(node: ISymbioteNode): void {
  const lastNativeReport = reported.get(node);
  if (lastNativeReport === undefined) return; // no report yet, nothing to disagree with

  const refreshing = node.props.refreshing === true;
  if (lastNativeReport === refreshing) {
    dlog(`RefreshControl behavior snap-back no-op refreshing=${refreshing}`);
    return;
  }

  dlog(
    `RefreshControl behavior ${SET_NATIVE_REFRESHING} reported=${lastNativeReport} refreshing=${refreshing}`,
  );
  dispatchViewCommand(node, SET_NATIVE_REFRESHING, [refreshing]);
  reported.set(node, refreshing);
}

function onRefresh(node: ISymbioteNode, event: ISymbioteEvent): void {
  // Native has already started spinning by the time this arrives (RefreshControl.js:180), so the
  // mirror moves BEFORE the app's handler runs — a handler that flips `refreshing` to true then
  // agrees with it, and one that does nothing is what the deferred check corrects.
  reported.set(node, true);

  const listener = appListenerFor(node, 'refresh');
  if (typeof listener === 'function') listener(event);

  queueMicrotask(() => evaluateSnapBack(node));
}

function attach(node: ISymbioteNode): void {
  setBehaviorListener(node, 'refresh', event => onRefresh(node, event));
}

function detach(node: ISymbioteNode): void {
  reported.delete(node);
}

// Idempotent: an adapter entry may be imported more than once in a bundle, and re-registering the
// same tag with an equivalent behavior must not double-install anything.
export function registerRefreshControlBehavior(): void {
  registerHostBehavior(REFRESH_CONTROL_TAG, {
    attach,
    // Closes the case a microtask scheduled from `onRefresh` cannot: the app moves `refreshing` on
    // its own while a past report is still unresolved. Costs nothing extra — it fires only on a
    // commit that already changed something.
    afterCommit: evaluateSnapBack,
    detach,
    ownedListeners: ['refresh'],
  });
}
