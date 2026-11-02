<script lang="ts">
  import type { IPressState } from '@symbiote-native/components';
  import type { ISymbioteEvent } from '@symbiote-native/svelte';
  import { nativeNumber } from '../components/event-utils';
  import { ACCENT, SURFACE } from './canary-shared';

  let move = $state({ dx: 0, dy: 0 });

  function onMove(event: ISymbioteEvent): void {
    move = {
      dx: Math.round(nativeNumber(event, 'locationX')),
      dy: Math.round(nativeNumber(event, 'locationY')),
    };
  }
</script>

<!-- PASS: press, drag down ~100px and the panel stays highlighted, drag up off the top drops it -->
<pressable
  hitSlop={{ top: 0, bottom: 40, left: 0, right: 0 }}
  pressRetentionOffset={{ top: 0, bottom: 80, left: 0, right: 0 }}
  p={{ onPressMove: onMove }}
  class="retention-card"
  style={({ pressed }: IPressState) => ({
    backgroundColor: pressed ? ACCENT : SURFACE,
  })}
>
  <text class="info-text">{`drag me · dx ${move.dx} · dy ${move.dy}`}</text>
</pressable>
