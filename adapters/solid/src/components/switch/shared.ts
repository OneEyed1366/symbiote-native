// Switch, the Solid lifecycle half. The logic (the lastNativeReport reducer, valueFromChange, the
// snap-back decision) lives in @symbiote-native/components/state and the render (value fold, track
// colors, ios_backgroundColor) in @symbiote-native/components/view — both shared verbatim with
// React, Vue and Svelte. Solid supplies only the reactivity: a signal holding what native last
// reported, an accessor per prop, and the effect that snaps native back when the parent rejects a
// toggle.
//
// Switch is controlled exactly like RN's: the parent's onValueChange MUST update `value` for the
// toggle to stick. If the handler is a no-op, native has already flipped its own grip, so JS
// commands the old value back down — a plain prop re-push cannot cover that case, because the prop
// never changed and the retained tree never diverged. The command name is platform-specific (iOS
// setValue / Android setNativeValue) and arrives via `platform`.
//
// NOTHING here destructures `props`. Solid props are getters; destructuring reads them once at
// setup and freezes the component at its mount-time values. Every read below happens inside an
// accessor (the descriptor memo, the snap-back effect, handleChange) so it re-runs when the caller's
// signal changes.

import { createEffect, createSignal } from 'solid-js';
import type { JSX } from '../../jsx-runtime';
import {
  createInitialSwitchState,
  renderSwitch,
  resolveAccessibilityProps,
  shouldSnapBack,
  switchReducer,
  valueFromChange,
  type ISwitchPlatform,
  type ISwitchProps as ISwitchBaseProps,
  type ISwitchState,
} from '@symbiote-native/components';
import {
  dispatchViewCommand,
  dlog,
  type IClassNameValue,
  type ISymbioteEvent,
} from '@symbiote-native/engine';
import { descriptorToSolid } from '../../descriptor-to-solid';

export type { ISwitchTrackColor } from '@symbiote-native/components';

// The agnostic base (the controlled value contract, colors, style, accessibility) is shared and
// re-exported rather than redeclared; only the class-styling field is per-adapter, and Solid's
// idiom is `class` — the spelling examples/solid already uses on raw host tags. React's is
// `className`, Vue's and Svelte's `class` (<prop_types_split_agnostic_vs_per_adapter>).
export type ISwitchProps = ISwitchBaseProps & { class?: IClassNameValue };

// The platform piece: the view's track-color name mapping plus the lifecycle's snap-back command
// name. Supplied whole by index.ios.ts / index.android.ts (Metro filename-selected).
export type ISwitchHostPlatform = ISwitchPlatform & { snapBackCommand: string };

// Read by the component itself; everything else forwards onto the host node. onValueChange is pure
// JS and must never reach Fabric — a function prop crashes Android's folly::dynamic serializer.
const HANDLED_PROPS = [
  'value',
  'onValueChange',
  'disabled',
  'trackColor',
  'thumbColor',
  'ios_backgroundColor',
  'style',
];

// Switch owns its host element rather than rendering through a symbiote View, so it folds
// aria/role into the canonical accessibility* props here, exactly like React's hook does.
function forwardProps(props: ISwitchProps): Record<string, unknown> {
  const forwarded: Record<string, unknown> = {
    ...resolveAccessibilityProps(props),
  };
  for (const key of HANDLED_PROPS) delete forwarded[key];
  return forwarded;
}

export function createSwitch(
  platform: ISwitchHostPlatform,
): (props: ISwitchProps) => JSX.Element {
  return function Switch(props: ISwitchProps): JSX.Element {
    const [nativeReport, setNativeReport] = createSignal<ISwitchState>(
      createInitialSwitchState(),
    );

    // value is a real Fabric prop, folded to a strict boolean: RN sends `value === true`, so an
    // absent prop reads as "off" rather than riding through as undefined.
    const fabricValue = (): boolean => props.value === true;

    const handleChange = (event: ISymbioteEvent): void => {
      const next = valueFromChange(event);
      dlog(
        `Switch onChange value=${String(next)} eventCount=${String(event.nativeEvent.eventCount)}`,
      );
      if (next === undefined) return;
      props.onValueChange?.(next, event);
      setNativeReport(current =>
        switchReducer(current, { type: 'native-reported', value: next }),
      );
    };

    // The node is created once and kept by identity — descriptorToSolid wires every prop through a
    // render effect on this same node, so the imperative command below always has a live target and
    // never chases a replaced node.
    const node = descriptorToSolid(() =>
      renderSwitch(
        {
          value: fabricValue(),
          disabled: props.disabled,
          trackColor: props.trackColor,
          thumbColor: props.thumbColor,
          ios_backgroundColor: props.ios_backgroundColor,
          style: props.style,
          passthrough: { ...forwardProps(props), onChange: handleChange },
        },
        platform,
      ),
    );

    // createEffect, not createRenderEffect: it runs after the tree is built, the same position
    // React's useLayoutEffect and Vue's flush:'post' watch occupy. The engine commits on a
    // microtask (renderer.ts's requestCommit), so the node has no Fabric tag yet on the first run —
    // which is harmless and not worth a whenCommitted retry here, because shouldSnapBack is false
    // until native has reported, and native cannot report before it exists. Every run that DOES
    // dispatch is therefore downstream of a native event, i.e. long past the first commit.
    createEffect(() => {
      const value = fabricValue();
      const reported = nativeReport();
      if (!shouldSnapBack(reported, value)) {
        dlog(
          `Switch snap-back no-op reported=${String(reported.lastNativeReport)} value=${value}`,
        );
        return;
      }
      dlog(
        `Switch ${platform.snapBackCommand} snap-back reported=${String(reported.lastNativeReport)} value=${value}`,
      );
      dispatchViewCommand(node, platform.snapBackCommand, [value]);
    });

    return node;
  };
}
