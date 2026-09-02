<script lang="ts">
  // Drop-in replacement for RN's stock <Button> — a bare Button renders as unstyled tinted text
  // on iOS, visually indistinguishable from a body Text line. One consistent bordered pill,
  // tinted in the caller's own `color`, matching examples/react/components/ActionButton.tsx.
  import { Pressable, Text } from '@symbiote-native/svelte';

  let {
    title,
    onPress,
    color,
    testID,
  }: { title: string; onPress: () => void; color: string; testID?: string } =
    $props();

  // The pressed look, as a `style` FUNCTION of press state — RN's own idiom. It briefly lived in
  // `.action-button:active` instead, because a template that read `pressed` could not compile to an
  // intrinsic tag and this component is 83 call sites. That constraint is GONE: the preprocessor
  // derives both looks from this declaration at build time, so the idiom and the intrinsic tag
  // stopped being a trade-off — and pseudo-class state is now off in the parser, so the CSS route
  // would silently paint nothing.
  //
  // A `$derived` rather than a bare arrow so `color` stays live: the transform calls the callback
  // once per state at render, and a stale closure would freeze the border at its first colour.
  const buttonStyle = $derived(({ pressed }: { pressed: boolean }) => ({
    borderColor: color,
    opacity: pressed ? 0.6 : 1,
  }));
</script>

<Pressable {testID} {onPress} class="action-button" style={buttonStyle}>
  <Text class="action-button-text" style={{ color }}>{title}</Text>
</Pressable>
