<script lang="ts" module>
  // TouchableHighlight: built on Pressable. RN drives the underlay with setState (not Animated —
  // TouchableHighlight.js), so unlike TouchableOpacity this needs no tween: `highlightPressedStyle`
  // (@symbiote-native/components/view/render-touchable-highlight) is a pure function of the live
  // `pressed` flag, fed through Pressable's own style-as-function-of-state prop — the same
  // mechanism React's `pressedStyle` callback and Vue's style-as-function attr use.
  import type { ITouchableHighlightProps } from './touchable-highlight-props';

  export type { ITouchableHighlightProps };
</script>

<script lang="ts">
  import {
    highlightPressedStyle,
    DEFAULT_HIGHLIGHT_CHILD_OPACITY,
    DEFAULT_UNDERLAY_COLOR,
    type IPressState,
  } from '@symbiote-native/components';
  import type { IStyleProp, IViewStyle } from '@symbiote-native/engine';
  import Pressable from '../pressable/index.svelte';

  let {
    activeOpacity = DEFAULT_HIGHLIGHT_CHILD_OPACITY,
    underlayColor = DEFAULT_UNDERLAY_COLOR,
    style,
    children: content,
    ...rest
  }: ITouchableHighlightProps = $props();

  function pressedStyle({ pressed }: IPressState): IStyleProp<IViewStyle> {
    return highlightPressedStyle(pressed, style, underlayColor, activeOpacity);
  }
</script>

<Pressable {...rest} style={pressedStyle}>
  {#snippet children()}
    {@render content?.()}
  {/snippet}
</Pressable>
