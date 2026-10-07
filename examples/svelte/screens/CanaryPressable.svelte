<script lang="ts">
  import type { IPressState } from '@symbiote-native/components';
  import { ACCENT, CHALK, SURFACE, SURFACE_PRESSED } from './canary-shared';

  const { onTap }: { onTap: () => void } = $props();

  // The tag resolves its own style at both values of `pressed`, a child has no such channel
  let isPressed = $state(false);
</script>

<pressable
  p={{ onPress: onTap, onPressIn: () => (isPressed = true), onPressOut: () => (isPressed = false) }}
  class="pressable-card"
  style={({ pressed }: IPressState) => ({
    backgroundColor: pressed ? SURFACE_PRESSED : SURFACE,
    borderColor: ACCENT,
  })}
>
  <text class="pressable-label" style={{ color: isPressed ? ACCENT : CHALK }}>
    {isPressed ? 'holding…' : 'press me (also +1)'}
  </text>
</pressable>
