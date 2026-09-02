// Whether anything downstream actually wants a gated accessibility event, passed from a wrapper
// component to the inner component that owns the gate.
//
// THE PROBLEM. Six Fabric events fire only if a BOOLEAN prop reaches the payload
// (`.claude/rules/fabric-boolean-event-gates.md`), and the flag follows the VALUE: a handler
// present means `true`, absent means the key is deleted. Every component that owns such a gate
// therefore writes it only while its own `@Output()` is `.observed`.
//
// Angular has no conditional template binding, so a wrapper rendering an inner component must write
// `(accessibilityAction)="accessibilityAction.emit($event)"` unconditionally — which subscribes,
// which makes the inner's `.observed` permanently true, which lights the flag on EVERY instance
// whether or not any app listens. Fixing the inner component does nothing: the wrapper is the
// subscriber. The chain is up to four deep here (SectionList -> VirtualizedSectionList ->
// VirtualizedList -> ScrollView), and every middle link has the same problem for the same reason.
//
// WHY THIS IS DI AND NOT AN `@Input`. An input is public API. An app could write
// `[gatedEvents]="…"` on a `Pressable` and silently switch its accessibility events OFF — a change
// nothing in this repo could detect and nothing on screen would show. A `viewProviders` entry is
// not part of the component's binding surface, so an app cannot reach it by accident.
//
// WHY `viewProviders` AND NOT `providers` — measured, both arms, 2026-09-02:
//
//   viewProviders   the wrapper's OWN template sees it, projected content does NOT
//   providers       both see it
//
// The second half is what matters: an app writing `<TouchableOpacity><Pressable/></TouchableOpacity>`
// projects its own Pressable INTO the wrapper, and that Pressable must behave exactly as it would
// standing alone. Under `providers` it would inherit the wrapper's demand and the debt would just
// move one level down.
//
// Verified on both rungs — JIT through `mount()`, and again by executing the artifact from a real
// `ngc --compilationMode partial` + `babel-linker.cjs` chain, because `viewProviders` compiles into
// the component definition (`ɵɵProvidersFeature`) and this repo has a recorded case of JIT and AOT
// disagreeing on a compiled binding (`.claude/rules/test-harness-false-greens.md` §21/§21a). Both
// arms reported the same four cells.
import {
  EventEmitter,
  InjectionToken,
  forwardRef,
  inject,
} from '@angular/core';
import type { Provider, Type } from '@angular/core';
import type { ISymbioteEvent } from '@symbiote-native/engine';

// The four `on*`-gated accessibility events every wrapper forwards. Not the full gate list from the
// engine: `layout` and `textLayout` are never forwarded wrapper-to-wrapper, and
// KeyboardAvoidingView READS its own `onLayout` internally, so gating that one on a subscriber
// would break inset-following (`.claude/rules/keyboard-avoiding-view-rn-contract.md`).
export const GATED_ACCESSIBILITY_EVENTS = [
  'accessibilityAction',
  'accessibilityTap',
  'magicTap',
  'accessibilityEscape',
] as const;

export type IGatedAccessibilityEvent =
  (typeof GATED_ACCESSIBILITY_EVENTS)[number];

export interface IGateDemand {
  wantsGate(name: IGatedAccessibilityEvent): boolean;
}

export const GATE_DEMAND = new InjectionToken<IGateDemand>(
  'symbiote.gate-demand',
);

/**
 * Declare a wrapper as the demand for everything in its own template.
 *
 * Takes a THUNK rather than the class: the entry sits in the decorator of the very class it names,
 * so the reference has to be late.
 */
export function provideGateDemand(get: () => Type<IGateDemand>): Provider {
  return { provide: GATE_DEMAND, useExisting: forwardRef(get) };
}

/**
 * For a component that OWNS a gate — the innermost one, which writes the flag.
 */
export function injectGateDemand(): IGateDemand | null {
  return inject(GATE_DEMAND, { optional: true });
}

/**
 * For a component that PROVIDES demand and is itself wrapped.
 *
 * `skipSelf` is not optional here: a component resolves its own `viewProviders`, so without it the
 * lookup reaches this class's own `useExisting` entry and Angular throws NG0200 at construction.
 * Loud rather than silent, but the shape is easy to get wrong, which is why the two lookups are
 * separate functions instead of one with a flag.
 */
export function injectGateDemandAbove(): IGateDemand | null {
  return inject(GATE_DEMAND, { optional: true, skipSelf: true });
}

/**
 * The one expression both roles evaluate.
 *
 * A demand from above OVERRIDES the local emitter, and that override is the whole mechanism: a
 * middle link's own emitter is `.observed` precisely because the level above bound it, so answering
 * from it would report "wanted" for a chain nobody subscribed to.
 */
export function gateWanted(
  above: IGateDemand | null,
  name: IGatedAccessibilityEvent,
  own: EventEmitter<ISymbioteEvent>,
): boolean {
  return above !== null ? above.wantsGate(name) : own.observed;
}
