<script lang="ts" module>
  // TextInput: the controlled-value / event-count handshake, calling straight into
  // core/components/src/view/render-text-input.ts's renderTextInput() for the prop assembly —
  // its returned Descriptor's `.props` is spread onto whichever of the two literal host tags
  // `isMultiline` picks below. NOT `<svelte:element this={descriptor.type}>`: a dynamic tag
  // compiles through Svelte's generic setAttribute path, not the custom-element `p=` property-set
  // codegen every symbiote-* tag used to need under the DOM shim — under the official
  // custom-renderer API every element goes through the ordinary per-attribute path regardless
  // (svelte-adapter-custom-renderer skill §5), but the tag still needs to be a literal for the
  // `{@attach}` ref-capture idiom below. Reuses the shared logic verbatim (resolveTextInputProps
  // / foldText / textFromChange / eventCountFromChange / shouldCommandText), exactly like React's
  // useState+useRef+useLayoutEffect+useImperativeHandle and Vue's ref+shallowRef+watch+expose().
  // Runes: `$state.raw` holds the host node reference by IDENTITY (imperative commands read the
  // RAW node — see switch/index.svelte's header comment for why `$state()` would break the
  // engine's WeakMap-keyed identity lookup), `$state` tracks the acknowledged event count, and
  // `$effect` drives the controlled-write command — the TextInput twin of Switch's snap-back
  // effect. Nodes are bound eagerly via `{@attach}` (svelte-adapter-custom-renderer skill §4), so
  // `hostRef` is already the real, dispatchable engine node the instant it fires — no more
  // `.engineNode` indirection. The imperative handle (focus/blur/clear/isFocused/setSelection) is
  // exposed the Svelte 5 way: plain functions declared in the INSTANCE script (not here in
  // `<script module>`, which is shared across every instance) become callable off a parent's
  // `bind:this` target.
  //
  // `value` is `$bindable()`: `<TextInput bind:value={x}>` round-trips a native edit into `x`
  // with no adapter-side translation beyond the one-line echo in handleChange, GATED on
  // `onValueChange` being absent. Ungated, it would defeat the controlled-write correction below
  // for every plain `value`+`onValueChange` consumer too, not just bind: ones: a `$bindable`
  // prop with no `bind:` caller still caches the child's own write as a local override (verified
  // against svelte's real `prop()` runtime, `reactivity/props.js`), so an unconditional echo
  // would make `value` agree with `lastNativeText` on every native report and silently
  // short-circuit `shouldCommandText` — even for a parent that never once accepts.
  import type { ITextInputProps } from './text-input-props';

  export type { ITextInputProps };
  export type { ITextInputHandle } from '@symbiote-native/components';
</script>

<script lang="ts">
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
  } from '@symbiote-native/components';
  import {
    dispatchViewCommand,
    dlog,
    blurTextInput,
    setInputFocused,
    setInputBlurred,
    type ISymbioteEvent,
    type IHostInstance,
  } from '@symbiote-native/engine';
  import { createDescriptorChildrenSync } from '../../descriptor-to-svelte';
  import { createAttachmentsSync } from '../../runes/attachments';
  import { toTemplateSafeProps } from '../../renderer';

  // The exact destructure list React's index.ts pulls out of props before building
  // `passthrough` (everything else rides through to Fabric untouched — placeholder,
  // secureTextEntry, style, class, testID, the remaining native events, the accessibility*
  // props already folded below). `class`/`style` are deliberately NOT here, same as Vue's
  // HANDLED_ATTRS, so they forward like every other adapter's TextInput.
  const HANDLED_KEYS: readonly string[] = [
    'defaultValue',
    'multiline',
    'selection',
    'onValueChange',
    'onFocus',
    'onBlur',
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
  ];

  // `resolveAccessibilityProps` only transforms accessibility*/aria-*/role fields, so it's
  // applied HERE, once, at the one place that needs the folded result, rather than wrapped
  // around the whole props object in an outer $derived — every other derived/effect keeps a
  // plain, direct property read on the raw `$props()` proxy. `source` is a closed interface (no
  // index signature), so `Object.keys` + bracket-indexing would need an `as` cast; `Object.entries`
  // falls onto TS's `entries(o: {}): [string, any][]` overload instead, which needs no cast.
  function forwardProps(source: Omit<ITextInputProps, 'value'>): Record<string, unknown> {
    const resolved = resolveAccessibilityProps(source);
    const result: Record<string, unknown> = {};
    for (const [key, propValue] of Object.entries(resolved)) {
      if (!HANDLED_KEYS.includes(key)) result[key] = propValue;
    }
    return result;
  }

  // `value` is $bindable() (see the module-script header for the full reasoning); everything
  // else keeps flowing through `rest`, the exact twin of the old whole-object `rawProps` for
  // every non-`value` field.
  let { value = $bindable(), ...rest }: ITextInputProps = $props();

  // $state.raw, NOT $state: identity concern, see the module-script header above.
  let hostRef = $state.raw<IHostInstance | null>(null);

  // The count native last acknowledged. $state so the bag echoes it back on every commit and
  // the exposed handle reads the latest (the Svelte twin of React's useState / Vue's ref).
  let mostRecentEventCount = $state(INITIAL_EVENT_COUNT);
  // The last text native holds, as far as JS knows. Seeded from the mount-time value — the
  // `text` prop already carries it down via the bag, so the FIRST controlled value is not a
  // divergence and must NOT re-command. Bookkeeping, not render state: a plain `let`, same as
  // Vue's setup-scope `let lastNativeText`.
  let lastNativeText = foldText(value, rest.defaultValue);
  // JS-side focus state, mirrored from the focus/blur events for isFocused(): native exposes no
  // synchronous focus getter (RN's TextInputState keeps the same).
  let focused = false;
  // autoFocus fires once, when the host node first goes live; guarded so a later re-render (or
  // an intrinsic swap between single/multiline) doesn't re-focus.
  let autoFocused = false;

  const isMultiline = $derived(rest.multiline === true);
  const text = $derived(foldText(value, rest.defaultValue));
  const folded = $derived(
    resolveTextInputProps({
      inputMode: rest.inputMode,
      keyboardType: rest.keyboardType,
      enterKeyHint: rest.enterKeyHint,
      returnKeyType: rest.returnKeyType,
      readOnly: rest.readOnly,
      editable: rest.editable,
      submitBehavior: rest.submitBehavior,
      blurOnSubmit: rest.blurOnSubmit,
      multiline: isMultiline,
      cursorColor: rest.cursorColor,
      selectionColor: rest.selectionColor,
      selectionHandleColor: rest.selectionHandleColor,
      autoComplete: rest.autoComplete,
      textContentType: rest.textContentType,
      showSoftInputOnFocus: rest.showSoftInputOnFocus,
      underlineColorAndroid: rest.underlineColorAndroid,
    }),
  );

  function handleChange(event: ISymbioteEvent): void {
    // Event seam: the controlled handshake hinges on the change payload carrying `text`
    // (+ `eventCount`). iOS and Android Fabric can key these differently, so log the actual
    // shape here; a missing `text` means onValueChange never fires.
    dlog(
      `TextInput change keys=[${Object.keys(event.nativeEvent).join(',')}] ` +
        `text=${JSON.stringify(event.nativeEvent.text)} count=${JSON.stringify(event.nativeEvent.eventCount)}`,
    );
    const changedText = textFromChange(event);
    if (changedText !== undefined) {
      // Record the text first, then bump the acknowledged count, so the count never runs ahead
      // of the text it stands for.
      lastNativeText = changedText;
      rest.onValueChange?.(changedText, event);
      // $bindable() sugar: with no onValueChange nothing could reject this report, so mirror it
      // straight into the bound value. A caller that ALSO supplies onValueChange keeps full
      // accept/reject control via the controlled-write effect below — see the module-script
      // header for why echoing unconditionally would break that for it too.
      if (rest.onValueChange === undefined) value = changedText;
    }
    const count = eventCountFromChange(event);
    if (count !== undefined) mostRecentEventCount = count;
  }

  function handleFocus(event: ISymbioteEvent): void {
    focused = true;
    // Track focus app-wide so Keyboard.dismiss can blur this input without a ref.
    if (hostRef !== null) setInputFocused(hostRef);
    rest.onFocus?.(event);
  }

  function handleBlur(event: ISymbioteEvent): void {
    focused = false;
    if (hostRef !== null) setInputBlurred(hostRef);
    rest.onBlur?.(event);
  }

  // Controlled write: when JS-side `value` diverges from what native reported, command the new
  // text down with the acknowledged count — a plain prop re-push would race the user's
  // keystrokes; the command is the only stale-safe path. Mirrors React's useLayoutEffect / Vue's
  // post-flush watch; Svelte's `$effect` reruns whenever a value it read on its LAST run changes,
  // so `value` and `count` are read UNCONDITIONALLY up front, before either early return — a
  // rejecting parent never changes `props.value`, only `mostRecentEventCount` (bumped inside
  // handleChange), so reading `count` only after the `shouldCommandText` guard would drop it from
  // the tracked dependency set on the run that first falls through the guard, and a later
  // event-count-only change would then silently fail to retrigger this effect (same class of bug
  // Switch's snap-back effect avoids by reading `switchState` unconditionally too). `hostRef` is
  // bound eagerly by `{@attach}` (svelte-adapter-custom-renderer skill §4), always populated by
  // the time this first runs — no more commit-timing guard needed here. The local `currentValue`
  // (rather than reusing the name `value`) avoids shadowing the outer, now-`$bindable()`, prop.
  $effect(() => {
    const node = hostRef;
    const currentValue = value;
    const count = mostRecentEventCount;
    if (node === null) return;
    if (!shouldCommandText(lastNativeText, currentValue)) return;
    const selStart = rest.selection?.start ?? SELECTION_NONE;
    const selEnd = rest.selection?.end ?? rest.selection?.start ?? SELECTION_NONE;
    dlog(`TextInput setTextAndSelection count=${count} text=${JSON.stringify(currentValue)}`);
    dispatchViewCommand(node, 'setTextAndSelection', [count, currentValue, selStart, selEnd]);
    lastNativeText = currentValue;
  });

  // autoFocus is driven in JS, not as a native prop: once the host node first goes live, command
  // `focus` down once (RN does the same via TextInputState.focusInput). No commit-timing retry
  // needed here (unlike Vue's whenCommitted) — same eager-binding guarantee the controlled-write
  // effect above relies on.
  $effect(() => {
    const node = hostRef;
    if (autoFocused || node === null || rest.autoFocus !== true) return;
    autoFocused = true;
    dlog('TextInput autoFocus -> focus command');
    dispatchViewCommand(node, 'focus', []);
  });

  // The imperative API RN exposes on a TextInput ref, as plain instance-script functions — the
  // Svelte 5 mechanism (no useImperativeHandle/expose() rune): a parent's `bind:this={ref}` gets
  // `ref.focus()` etc. callable directly, typed via the re-exported `ITextInputHandle` above.
  // focus/blur drive native view commands; clear/setSelection reuse setTextAndSelection (the
  // same stale-safe path as a controlled write), echoing the acknowledged event count.
  export function focus(): void {
    if (hostRef !== null) dispatchViewCommand(hostRef, 'focus', []);
  }

  export function blur(): void {
    // Routes through TextInputState so the app-wide focus tracking clears too.
    blurTextInput(hostRef);
  }

  export function clear(): void {
    if (hostRef === null) return;
    dispatchViewCommand(hostRef, 'setTextAndSelection', [mostRecentEventCount, '', 0, 0]);
    lastNativeText = '';
  }

  export function isFocused(): boolean {
    return focused;
  }

  export function setSelection(start: number, end: number): void {
    if (hostRef === null) return;
    const current = lastNativeText ?? '';
    dispatchViewCommand(hostRef, 'setTextAndSelection', [
      mostRecentEventCount,
      current,
      start,
      end,
    ]);
  }

  const descriptor = $derived(
    renderTextInput({
      multiline: isMultiline,
      text,
      mostRecentEventCount,
      selection: rest.selection,
      folded,
      passthrough: {
        ...forwardProps(rest),
        onChange: handleChange,
        onFocus: handleFocus,
        onBlur: handleBlur,
      },
    }),
  );

  // renderTextInput()'s Descriptor has zero children (the whole surface is the `text`/
  // `mostRecentEventCount` prop handshake) — wired anyway for the same uniform-shape reason
  // Switch is, see its header comment.
  const syncChildren = createDescriptorChildrenSync();
  $effect(() => {
    syncChildren(hostRef, descriptor.children);
  });

  // See View.svelte's note on `{@attach}`. `rest` (not `value`, which never carries a symbol
  // key) is the same attachment-bearing bag `rawProps` used to be.
  const syncAttachments = createAttachmentsSync();
  $effect(() => {
    syncAttachments(hostRef, rest);
  });

  // `style` collides with Svelte's own special-cased attribute name (renderer.ts's
  // TEMPLATE_KEY_UNMANGLE header comment) — renamed before the spread; `setAttributeOp`'s
  // `realPropName()` reverses it right before `routeProp`.
  const templateProps = $derived(toTemplateSafeProps(descriptor.props));
</script>

{#if isMultiline}
  <symbiote-text-input-multiline {...templateProps} {@attach (node) => (hostRef = node)} />
{:else}
  <symbiote-text-input {...templateProps} {@attach (node) => (hostRef = node)} />
{/if}
