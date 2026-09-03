<script lang="ts">
  // Responder: the gesture capabilities exposed here, shown so the grabbed element is the
  // one that moves. Each chip is its OWN responder: it grabs on touch start and drags ITSELF
  // (onResponderMove translates that chip). Drag a chip past a threshold and the surrounding
  // strip STEALS the gesture: its onMoveShouldSetResponder fires once the finger has travelled
  // far enough, the chip yields (onResponderTerminationRequest -> terminate, so it snaps back)
  // and the strip pans the whole row. Port of examples/react/components/ResponderDemo.tsx — the
  // responder handler props are plain passthrough props on View (IViewProps extends
  // IResponderProps), same event names and handler signatures as React's, so no adapter-level
  // translation is needed here beyond useRef/useState -> plain-let/$state.
  import { View, Text, type ISymbioteEvent } from '@symbiote-native/svelte';
  import { firstTouchX } from './event-utils';

  const RESPONDER_CHIPS = [0, 1, 2, 3, 4];
  // Horizontal travel (in the touch's page units: px on Android, pt on iOS, so the feel differs a
  // little per platform) after which the strip steals the gesture from the chip.
  const RESPONDER_STEAL_DX = 64;

  let activeChip = $state<number | null>(null);
  let chipDx = $state(0);
  let rowDx = $state(0);
  let status = $state(
    'tap a chip · drag it to move · drag far → strip steals it',
  );
  let transfer = $state('');
  // useRef-equivalent scratch values: read/written imperatively inside handlers, never meant to
  // drive a re-render themselves — plain closure-scoped `let`, not `$state`.
  let startX = 0;
  let panStartX = 0;
  let grabbed: number | null = null;
</script>

<View class="section-tight">
  <Text class="section-label">
    Responder · drag a chip vs hand-off to the strip
  </Text>
  <Text class="info-text">{status}</Text>
  <Text
    class="transfer-text"
    style={{ color: transfer ? '#f6ad55' : '#41506a' }}
  >
    {transfer || 'transfer: —'}
  </Text>
  <View
    onMoveShouldSetResponder={(event: ISymbioteEvent) =>
      grabbed !== null &&
      Math.abs(firstTouchX(event) - startX) > RESPONDER_STEAL_DX}
    onResponderGrant={(event: ISymbioteEvent) => {
      transfer = `↯ strip stole the gesture from chip ${grabbed ?? '?'}`;
      activeChip = null;
      chipDx = 0;
      panStartX = firstTouchX(event);
      status = 'strip panning';
    }}
    onResponderMove={(event: ISymbioteEvent) =>
      (rowDx = firstTouchX(event) - panStartX)}
    onResponderRelease={() => {
      rowDx = 0;
      status = 'strip released';
    }}
    onResponderTerminate={() => (rowDx = 0)}
    class="strip-box"
  >
    <View class="row-tight" style={{ transform: [{ translateX: rowDx }] }}>
      {#each RESPONDER_CHIPS as index (index)}
        <View
          testID={`resp-chip-${index}`}
          onStartShouldSetResponder={() => true}
          onResponderGrant={(event: ISymbioteEvent) => {
            startX = firstTouchX(event);
            grabbed = index;
            activeChip = index;
            chipDx = 0;
            rowDx = 0;
            transfer = '';
            status = `chip ${index} grabbed`;
          }}
          onResponderMove={(event: ISymbioteEvent) => {
            const dx = firstTouchX(event) - startX;
            chipDx = dx;
            status = `chip ${index} moving · dx=${Math.round(dx)}`;
          }}
          onResponderTerminationRequest={() => true}
          onResponderTerminate={() => {
            chipDx = 0;
            activeChip = null;
          }}
          onResponderRelease={() => {
            chipDx = 0;
            activeChip = null;
            status = `chip ${index} released`;
          }}
          class="chip"
          style={{
            borderColor: activeChip === index ? '#7fb5ff' : 'transparent',
            transform: [{ translateX: activeChip === index ? chipDx : 0 }],
          }}
        >
          <Text class="chip-text">{index}</Text>
        </View>
      {/each}
    </View>
  </View>
</View>
