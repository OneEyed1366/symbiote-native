<script lang="ts" module>
  // Button: the minimal cross-platform button, rendered in RN's iOS shape (Button.js): a
  // TouchableOpacity wrapping a Text. The base text style, the role constant, and the color fold
  // (caller color tints the label; disabled greys it) are shared in
  // @symbiote-native/components/view/render-button — this component only composes its
  // TouchableOpacity + a raw `symbiote-text` host and forwards the native-only props, the Svelte
  // twin of React's/Vue's Button.
  import type { IButtonProps } from './button-props';

  export type { IButtonProps };
</script>

<script lang="ts">
  import { BUTTON_ACCESSIBILITY_ROLE, resolveButtonTextStyle } from '@symbiote-native/components';
  import TouchableOpacity from './touchable-opacity/index.svelte';

  let {
    title,
    onPress,
    color,
    disabled,
    touchSoundDisabled,
    testID,
    hasTVPreferredFocus,
    nextFocusDown,
    nextFocusForward,
    nextFocusLeft,
    nextFocusRight,
    nextFocusUp,
    class: className,
    ...accessibilityRest
  }: IButtonProps = $props();

  const textStyle = $derived(resolveButtonTextStyle(color, disabled));

  // The native-only props TouchableOpacity does not type but forwards to Fabric (testID +
  // TV-focus). Carried as a plain record (the pass-through idiom Image/React's Button use) so
  // excess-property typing does not reject the native-only keys. TV-focus is inert on a phone.
  const nativeForward = $derived.by(() => {
    const forward: Record<string, unknown> = { testID };
    if (hasTVPreferredFocus !== undefined) forward.hasTVPreferredFocus = hasTVPreferredFocus;
    if (nextFocusDown !== undefined) forward.nextFocusDown = nextFocusDown;
    if (nextFocusForward !== undefined) forward.nextFocusForward = nextFocusForward;
    if (nextFocusLeft !== undefined) forward.nextFocusLeft = nextFocusLeft;
    if (nextFocusRight !== undefined) forward.nextFocusRight = nextFocusRight;
    if (nextFocusUp !== undefined) forward.nextFocusUp = nextFocusUp;
    return forward;
  });
</script>

<!--
  RN's Button sets role=button, is accessible, and propagates the disabled accessibility state.
  The caller's accessibility props pass through via {...accessibilityRest}, but Button's fixed
  role/accessible/disabled-state win, applied after the spread. touchSoundDisabled maps to the
  pressable's android_disableSound.
-->
<TouchableOpacity
  {...accessibilityRest}
  {...nativeForward}
  {onPress}
  {disabled}
  class={className}
  android_disableSound={touchSoundDisabled}
  accessibilityRole={BUTTON_ACCESSIBILITY_ROLE}
  accessible={true}
  accessibilityState={{ disabled }}
>
  {#snippet children()}
    <symbiote-text p={{ style: textStyle }}>{title}</symbiote-text>
  {/snippet}
</TouchableOpacity>
