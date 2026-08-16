// TextInput, the Vue lifecycle half. The folds/maps (value->text, W3C/alias resolution) and the
// controlled-write predicate live in @symbiote-native/components/state, the render in
// @symbiote-native/components/view, both shared verbatim with React. Vue supplies only the
// reactivity: a shallowRef holds the host node, a ref holds the acknowledged event count, setup-
// scope `let`s hold the last native text + focus flag, a post-flush watch runs the
// controlled-write command, and expose() wires the imperative handle.
//
// Inputs arrive as attrs (untyped), so each is narrowed with a runtime guard, never a cast.
// onValueChange MUST be stripped from the forwarded attrs: it is not a ViewConfig event, so
// leaking it would reach Fabric as a function prop and crash Android's folly::dynamic.

import { defineComponent, onBeforeUnmount, ref, shallowRef, watch } from '@vue/runtime-core';
import {
  resolveAccessibilityProps,
  resolveTextInputProps,
  renderTextInput,
  foldText,
  textFromChange,
  eventCountFromChange,
  shouldCommandText,
  INITIAL_EVENT_COUNT,
  SELECTION_NONE,
  type ITextInputProps as ITextInputBaseProps,
  type ITextInputHandle,
  type ITextInputSelection,
} from '@symbiote-native/components';
import {
  dispatchViewCommand,
  isSymbioteNode,
  dlog,
  blurTextInput,
  setInputFocused,
  setInputBlurred,
  whenCommitted,
  type IClassNameValue,
  type ISymbioteEvent,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { descriptorToVue } from '../../descriptor-to-vue';
import { normalizeVueAttrs } from '../../utils/normalize-attrs';
import { resolveModelValue, emitModelUpdate } from '../../utils/model-binding';

// `class` can't join ITextInputBaseProps since it's framework-agnostic, so it's added locally
// (like Image's IImageProps). Not in HANDLED_ATTRS below, so it rides through forwardAttrs.
export type ITextInputProps = Omit<ITextInputBaseProps, 'onValueChange' | 'onFocus' | 'onBlur'> & {
  modelValue?: string;
  class?: IClassNameValue;
};
export type { ITextInputHandle };

type ITextInputEmits = {
  valueChange: (text: string, event: ISymbioteEvent) => boolean;
  focus: (event: ISymbioteEvent) => boolean;
  blur: (event: ISymbioteEvent) => boolean;
  'update:modelValue': (text: string) => boolean;
  'update:value': (text: string) => boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function normalizeSelection(value: unknown): ITextInputSelection | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.start !== 'number') return undefined;
  const selection: ITextInputSelection = { start: value.start };
  if (typeof value.end === 'number') selection.end = value.end;
  return selection;
}

// Everything else forwards onto the host node. onFocus/onBlur are re-supplied as our wrapped
// handlers; onValueChange is pure JS and must never reach Fabric.
const HANDLED_ATTRS = [
  'value',
  'modelValue',
  'defaultValue',
  'multiline',
  'selection',
  'inputMode',
  'enterKeyHint',
  'readOnly',
  'submitBehavior',
  'blurOnSubmit',
  'cursorColor',
  'selectionColor',
  'selectionHandleColor',
  'keyboardType',
  'returnKeyType',
  'editable',
  'autoComplete',
  'textContentType',
  'autoFocus',
  'showSoftInputOnFocus',
  'underlineColorAndroid',
  'onValueChange',
  'onFocus',
  'onBlur',
];

function forwardAttrs(attrs: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(attrs)) {
    if (!HANDLED_ATTRS.includes(key)) result[key] = attrs[key];
  }
  return result;
}

export const TextInput = defineComponent<ITextInputProps, ITextInputEmits>(
  (_props, { attrs: rawAttrs, emit, expose }) => {
    // shallowRef, NOT ref: a plain ref() would hand back a reactive Proxy the engine's WeakMap
    // mirror doesn't recognize, so every imperative command would silently no-op. Same rule as
    // the Switch / ScrollView host node.
    const nodeRef = shallowRef<ISymbioteNode | null>(null);
    const setNodeRef = (el: unknown): void => {
      nodeRef.value = isSymbioteNode(el) ? el : null;
    };

    // The count native last acknowledged. A ref so render echoes it as mostRecentEventCount; the
    // controlled write commands it so native's eventLag lands on 0.
    const mostRecentEventCount = ref(INITIAL_EVENT_COUNT);
    // Seeded from the mount-time value (the `text` prop already carries it down via createNode,
    // so the FIRST controlled value is not a divergence and must NOT re-command).
    let lastNativeText = foldText(
      resolveModelValue(rawAttrs, isString),
      asString(rawAttrs.defaultValue),
    );
    // Mirrored from focus/blur events for isFocused(): native exposes no synchronous focus getter.
    let focused = false;
    // Guard so a later node identity change does not re-focus.
    let autoFocused = false;

    const handleChange = (event: ISymbioteEvent): void => {
      // iOS and Android Fabric can key the change payload differently, so log the actual shape.
      dlog(
        `TextInput change keys=[${Object.keys(event.nativeEvent).join(',')}] ` +
          `text=${JSON.stringify(event.nativeEvent.text)} count=${JSON.stringify(event.nativeEvent.eventCount)}`,
      );
      const text = textFromChange(event);
      if (text !== undefined) {
        // Record the text first, so the count never runs ahead of the text it stands for.
        lastNativeText = text;
        emit('valueChange', text, event);
        emitModelUpdate<string>(emit, text);
      }
      const count = eventCountFromChange(event);
      if (count !== undefined) mostRecentEventCount.value = count;
    };

    const handleFocus = (event: ISymbioteEvent): void => {
      focused = true;
      // Track focus app-wide so Keyboard.dismiss can blur this input without a ref.
      const node = nodeRef.value;
      if (node !== null) setInputFocused(node);
      emit('focus', event);
    };

    const handleBlur = (event: ISymbioteEvent): void => {
      focused = false;
      const node = nodeRef.value;
      if (node !== null) setInputBlurred(node);
      emit('blur', event);
    };

    // Controlled write: when JS-side `value` diverges from what native reported, command the new
    // text down with the acknowledged count - a plain prop re-push would race the user's
    // keystrokes. flush:'post' so the node is committed before the command reads its Fabric handle.
    watch(
      () => resolveModelValue(rawAttrs, isString),
      value => {
        const node = nodeRef.value;
        if (node === null) return;
        if (!shouldCommandText(lastNativeText, value)) return;
        const selection = normalizeSelection(rawAttrs.selection);
        const selStart = selection?.start ?? SELECTION_NONE;
        const selEnd = selection?.end ?? selection?.start ?? SELECTION_NONE;
        dlog(
          `TextInput setTextAndSelection count=${mostRecentEventCount.value} text=${JSON.stringify(value)}`,
        );
        dispatchViewCommand(node, 'setTextAndSelection', [
          mostRecentEventCount.value,
          value,
          selStart,
          selEnd,
        ]);
        lastNativeText = value;
      },
      { flush: 'post' },
    );

    // autoFocus is driven in JS: once the node first commits, command `focus` down once. Under
    // Vue's async-batched commit the node has no Fabric tag yet at post-flush, so
    // whenCommitted defers it to the commit that assigns the tag. Cancelled on unmount so an
    // un-committed pending focus can't leak.
    let cancelAutoFocus: (() => void) | undefined;
    watch(
      nodeRef,
      node => {
        if (autoFocused || node === null || rawAttrs.autoFocus !== true) return;
        autoFocused = true;
        dlog('TextInput autoFocus -> focus command');
        cancelAutoFocus = whenCommitted(node, () => dispatchViewCommand(node, 'focus', []));
      },
      { flush: 'post' },
    );
    onBeforeUnmount(() => cancelAutoFocus?.());

    // Methods read nodeRef.value / the count LIVE, so no stale capture. clear/setSelection reuse
    // setTextAndSelection, the same path as a controlled write.
    expose({
      focus: (): void => {
        const node = nodeRef.value;
        if (node !== null) dispatchViewCommand(node, 'focus', []);
      },
      blur: (): void => {
        // Routes through TextInputState so the app-wide focus tracking clears too.
        blurTextInput(nodeRef.value);
      },
      clear: (): void => {
        const node = nodeRef.value;
        if (node === null) return;
        dispatchViewCommand(node, 'setTextAndSelection', [mostRecentEventCount.value, '', 0, 0]);
        lastNativeText = '';
      },
      isFocused: (): boolean => focused,
      setSelection: (start: number, end: number): void => {
        const node = nodeRef.value;
        if (node === null) return;
        const current = lastNativeText ?? '';
        dispatchViewCommand(node, 'setTextAndSelection', [
          mostRecentEventCount.value,
          current,
          start,
          end,
        ]);
      },
    });

    return () => {
      const attrs = normalizeVueAttrs(rawAttrs);
      const multiline = attrs.multiline === true;
      const folded = resolveTextInputProps({
        inputMode: asString(attrs.inputMode),
        keyboardType: asString(attrs.keyboardType),
        enterKeyHint: asString(attrs.enterKeyHint),
        returnKeyType: asString(attrs.returnKeyType),
        readOnly: asBoolean(attrs.readOnly),
        editable: asBoolean(attrs.editable),
        submitBehavior: asString(attrs.submitBehavior),
        blurOnSubmit: asBoolean(attrs.blurOnSubmit),
        multiline,
        cursorColor: asString(attrs.cursorColor),
        selectionColor: asString(attrs.selectionColor),
        selectionHandleColor: asString(attrs.selectionHandleColor),
        autoComplete: asString(attrs.autoComplete),
        textContentType: asString(attrs.textContentType),
        showSoftInputOnFocus: asBoolean(attrs.showSoftInputOnFocus),
        underlineColorAndroid: asString(attrs.underlineColorAndroid),
      });
      const text = foldText(resolveModelValue(attrs, isString), asString(attrs.defaultValue));
      return descriptorToVue(
        renderTextInput({
          multiline,
          text,
          mostRecentEventCount: mostRecentEventCount.value,
          selection: normalizeSelection(attrs.selection),
          folded,
          passthrough: {
            ...resolveAccessibilityProps(forwardAttrs(attrs)),
            ref: setNodeRef,
            onChange: handleChange,
            onFocus: handleFocus,
            onBlur: handleBlur,
          },
        }),
      );
    };
  },
  {
    name: 'TextInput',
    inheritAttrs: false,
    emits: {
      valueChange: (_text: string, _event: ISymbioteEvent): boolean => true,
      focus: (_event: ISymbioteEvent): boolean => true,
      blur: (_event: ISymbioteEvent): boolean => true,
      'update:modelValue': (_text: string): boolean => true,
      'update:value': (_text: string): boolean => true,
    },
  },
);
