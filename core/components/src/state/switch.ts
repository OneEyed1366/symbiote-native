// Switch logic half, controlled like RN's: `value` is a Fabric prop, state is the last report
// TODO(rn-port): RN's `Switch.js` keeps this machine inside a React component, nothing to import

import type { ISymbioteEvent } from '@symbiote-native/engine';

// The value native last reported via `change`, or null before any report. Native is
// optimistic (it flips its own grip before JS approves), so the lifecycle layer diffs this
// against the JS-held value to decide whether to command native back (see shouldSnapBack).
export type ISwitchState = { lastNativeReport: boolean | null };

export type ISwitchAction = { type: 'native-reported'; value: boolean };

export function createInitialSwitchState(): ISwitchState {
  return { lastNativeReport: null };
}

export function switchReducer(
  state: ISwitchState,
  action: ISwitchAction,
): ISwitchState {
  switch (action.type) {
    case 'native-reported':
      // Always a fresh object, even when the boolean is unchanged from the prior report.
      // The snap-back effect keys on state identity, so native is commanded back on every report
      return { lastNativeReport: action.value };
  }
}

// The change payload carries the new boolean as nativeEvent.value; a non-boolean payload is
// ignored upstream (no onValueChange, no report). nativeEvent is an untyped Record, so narrow.
export function valueFromChange(event: ISymbioteEvent): boolean | undefined {
  const value = event.nativeEvent.value;
  return typeof value === 'boolean' ? value : undefined;
}

// Snap-back fires only when native reported a value that disagrees with the JS-held value:
// the parent rejected the toggle (its onValueChange did not update `value`). A plain prop
// re-push cannot cover this: when the handler is a no-op the prop never changes, so the
// retained tree never diverges and nothing re-commits. The imperative command is the only
// correction path. No report yet (null) or agreement → no command.
export function shouldSnapBack(
  state: ISwitchState,
  fabricValue: boolean,
): boolean {
  return (
    state.lastNativeReport !== null && state.lastNativeReport !== fabricValue
  );
}
