<script lang="ts">
  // Split off CanaryScreen.svelte to keep it under 400 lines: press-retention rect + a Text
  // prop-update-after-mount check, both unrelated to lists or scroll.
  import type { IPressState } from '@symbiote-native/components';
  import type { ISymbioteEvent } from '@symbiote-native/svelte';
  import ActionButton from './ActionButton.svelte';
  import { nativeNumber } from './event-utils';

  const ACCENT = '#ff3e00';
  const SURFACE = '#262626';

  let retentionMove = $state({ dx: 0, dy: 0 });

  function onRetentionMove(event: ISymbioteEvent): void {
    retentionMove = {
      dx: Math.round(nativeNumber(event, 'locationX')),
      dy: Math.round(nativeNumber(event, 'locationY')),
    };
  }

  let textLines = $state(1);
  function onToggleTextLines(): void {
    textLines = textLines === 1 ? 3 : 1;
  }
</script>

<!-- Press-retention measured rect. PASS: press, drag DOWN ~100px, the panel stays highlighted
     (inside the measured rect + 80px bottom retention); drag UP off the top, it drops. -->
<pressable
  hitSlop={{ top: 0, bottom: 40, left: 0, right: 0 }}
  pressRetentionOffset={{ top: 0, bottom: 80, left: 0, right: 0 }}
  p={{ onPressMove: onRetentionMove }}
  class="retention-card"
  style={({ pressed }: IPressState) => ({
    backgroundColor: pressed ? ACCENT : SURFACE,
  })}
>
  <text class="info-text">
    {`drag me · dx ${retentionMove.dx} · dy ${retentionMove.dy}`}
  </text>
</pressable>
<!-- Text PROP update after mount: a shim diffing a live rest-props proxy against itself finds
     nothing changed and drops every non-children prop update, while children still render. -->
<text class="section-label">Text · prop update after mount</text>
<text testID="text-lines-probe" class="list-row-text" numberOfLines={textLines}>
  Tapping the button below flips numberOfLines between 1 and 3. This sentence
  is deliberately long enough that the clamp is unmistakable at a glance,
  without needing to read it.
</text>
<ActionButton
  title="Toggle numberOfLines ({textLines})"
  color={ACCENT}
  onPress={onToggleTextLines}
/>
