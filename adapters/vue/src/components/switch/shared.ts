// Switch, the Vue lifecycle half. The logic (lastNativeReport reducer, valueFromChange, the
// snap-back decision) lives in @symbiote-native/components/state and the render in
// @symbiote-native/components/view, both shared verbatim with React. Vue supplies the
// reactivity: a ref holds what native last reported, a function ref grabs the host node, and a
// post-flush watch snaps native back when the parent rejects a toggle.
//
// Inputs arrive as attrs (untyped), so each is narrowed with a runtime guard, never a cast.
// onValueChange MUST be stripped from the forwarded attrs: it is not a ViewConfig event, so
// leaking it would reach Fabric as a function prop and crash Android's folly::dynamic.

import { defineComponent, ref, shallowRef, watch } from '@vue/runtime-core';
import {
  renderSwitch,
  switchReducer,
  createInitialSwitchState,
  shouldSnapBack,
  valueFromChange,
  type ISwitchPlatform,
  type ISwitchProps as ISwitchBaseProps,
  type ISwitchState,
  type ISwitchTrackColor,
} from '@symbiote-native/components';
import {
  dispatchViewCommand,
  isSymbioteNode,
  dlog,
  type IClassNameValue,
  type ISymbioteEvent,
  type ISymbioteNode,
  type IViewStyle,
} from '@symbiote-native/engine';
import { descriptorToVue } from '../../descriptor-to-vue';
import { normalizeVueAttrs } from '../../utils/normalize-attrs';
import { resolveModelValue, emitModelUpdate } from '../../utils/model-binding';

// The platform piece: the view's track-color name mapping plus the lifecycle's snap-back
// command name. Supplied whole by switch.ios.ts / switch.android.ts (Metro filename-selected).
type ISwitchHostPlatform = ISwitchPlatform & { snapBackCommand: string };

// `class` can't join ISwitchBaseProps since it's framework-agnostic, so it's added locally
// (like Image's IImageProps). Not in HANDLED_ATTRS below, so it rides into `passthrough`.
export type ISwitchProps = Omit<ISwitchBaseProps, 'onValueChange'> & {
  modelValue?: boolean;
  class?: IClassNameValue;
};
export type { ISwitchTrackColor };

type ISwitchEmits = {
  valueChange: (value: boolean, event: ISymbioteEvent) => boolean;
  'update:modelValue': (value: boolean) => boolean;
  'update:value': (value: boolean) => boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function normalizeTrackColor(value: unknown): ISwitchTrackColor | undefined {
  if (!isRecord(value)) return undefined;
  const trackColor: ISwitchTrackColor = {};
  if (typeof value.false === 'string') trackColor.false = value.false;
  if (typeof value.true === 'string') trackColor.true = value.true;
  return trackColor;
}

// The render fn's style param is a plain object; array/registered styles degrade to undefined
// (the engine flattens those on its own).
function isViewStyleObject(value: unknown): value is IViewStyle {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Everything else forwards onto the host node. onValueChange is pure JS and must never reach Fabric.
const HANDLED_ATTRS = [
  'value',
  'modelValue',
  'disabled',
  'trackColor',
  'thumbColor',
  'ios_backgroundColor',
  'style',
  'onValueChange',
];

function forwardAttrs(attrs: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(attrs)) {
    if (!HANDLED_ATTRS.includes(key)) result[key] = attrs[key];
  }
  return result;
}

export function createSwitch(platform: ISwitchHostPlatform) {
  return defineComponent<ISwitchProps, ISwitchEmits>(
    (_props, { attrs: rawAttrs, emit }) => {
      // shallowRef, NOT ref: a plain ref() would hand back a reactive Proxy the engine's WeakMap
      // mirror doesn't recognize, so every imperative command would silently no-op. General rule
      // for this adapter: host nodes live in shallowRef / markRaw.
      const nodeRef = shallowRef<ISymbioteNode | null>(null);
      const state = ref<ISwitchState>(createInitialSwitchState());

      const setNodeRef = (el: unknown): void => {
        nodeRef.value = isSymbioteNode(el) ? el : null;
      };

      const handleChange = (event: ISymbioteEvent): void => {
        const next = valueFromChange(event);
        dlog(
          `Switch onChange value=${String(next)} eventCount=${String(event.nativeEvent.eventCount)}`,
        );
        if (next === undefined) return;
        emit('valueChange', next, event);
        emitModelUpdate<boolean>(emit, next);
        state.value = switchReducer(state.value, { type: 'native-reported', value: next });
      };

      // Snap-back: when native reported a value the parent rejected, command the JS value back
      // down (the controlled-Switch correction RN does via SwitchCommands.setValue). The
      // decision is shared with React (shouldSnapBack); only the command name is platform-
      // imperative. flush:'post' so the node is committed before the command reads its Fabric handle.
      watch(
        () => ({
          fabricValue: resolveModelValue(rawAttrs, isBoolean) === true,
          switchState: state.value,
        }),
        ({ fabricValue, switchState }) => {
          const node = nodeRef.value;
          if (node === null) return;
          if (!shouldSnapBack(switchState, fabricValue)) {
            dlog(
              `Switch snap-back no-op reported=${String(switchState.lastNativeReport)} value=${fabricValue}`,
            );
            return;
          }
          dlog(
            `Switch ${platform.snapBackCommand} snap-back reported=${String(switchState.lastNativeReport)} value=${fabricValue}`,
          );
          dispatchViewCommand(node, platform.snapBackCommand, [fabricValue]);
        },
        { flush: 'post' },
      );

      return () => {
        const attrs = normalizeVueAttrs(rawAttrs);
        return descriptorToVue(
          renderSwitch(
            {
              value: resolveModelValue(attrs, isBoolean) === true,
              disabled: typeof attrs.disabled === 'boolean' ? attrs.disabled : undefined,
              trackColor: normalizeTrackColor(attrs.trackColor),
              thumbColor: asString(attrs.thumbColor),
              ios_backgroundColor: asString(attrs.ios_backgroundColor),
              style: isViewStyleObject(attrs.style) ? attrs.style : undefined,
              passthrough: { ...forwardAttrs(attrs), ref: setNodeRef, onChange: handleChange },
            },
            platform,
          ),
        );
      };
    },
    {
      name: 'Switch',
      inheritAttrs: false,
      emits: {
        valueChange: (_value: boolean, _event: ISymbioteEvent): boolean => true,
        'update:modelValue': (_value: boolean): boolean => true,
        'update:value': (_value: boolean): boolean => true,
      },
    },
  );
}
