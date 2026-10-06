import { defineComponent, ref } from 'vue';
import type { ISymbioteEvent } from '@symbiote-native/vue';
import { firstTouchX } from './event-utils';

const CHIPS = [0, 1, 2, 3, 4];
// Travel in page units (px on Android, pt on iOS) after which the strip steals the gesture
const STEAL_DX = 64;
const IDLE_HINT = 'tap a chip · drag it to move · drag far → strip steals it';

// Each chip is its own responder and drags itself. Past the threshold the strip steals the
// gesture, the chip yields and snaps back, and the strip pans the row
export const ResponderDemo = defineComponent({
  name: 'ResponderDemo',
  setup() {
    const activeChip = ref<number | null>(null);
    const chipDx = ref(0);
    const rowDx = ref(0);
    const status = ref(IDLE_HINT);
    const transfer = ref('');
    let startX = 0;
    let panStartX = 0;
    let grabbed: number | null = null;

    const grabChip = (index: number, event: ISymbioteEvent): void => {
      startX = firstTouchX(event);
      grabbed = index;
      activeChip.value = index;
      chipDx.value = 0;
      rowDx.value = 0;
      transfer.value = '';
      status.value = `chip ${index} grabbed`;
    };
    const releaseChip = (index: number): void => {
      chipDx.value = 0;
      activeChip.value = null;
      status.value = `chip ${index} released`;
    };
    const stealGesture = (event: ISymbioteEvent): void => {
      transfer.value = `↯ strip stole the gesture from chip ${grabbed ?? '?'}`;
      activeChip.value = null;
      chipDx.value = 0;
      panStartX = firstTouchX(event);
      status.value = 'strip panning';
    };

    return () => (
      <view class="section-tight">
        <text class="section-label">Responder · drag a chip vs hand-off to the strip</text>
        <text class="info-text">{status.value}</text>
        {/* Lit only when the strip steals the gesture, so the color stays dynamic */}
        <text class="transfer-text" style={{ color: transfer.value ? '#f6ad55' : '#3b5266' }}>
          {transfer.value || 'transfer: —'}
        </text>
        <view
          // Claims the gesture once the finger passes the threshold, taking it from the chip
          onMoveShouldSetResponder={(event: ISymbioteEvent) =>
            grabbed !== null && Math.abs(firstTouchX(event) - startX) > STEAL_DX
          }
          onResponderGrant={stealGesture}
          onResponderMove={(event: ISymbioteEvent) => {
            rowDx.value = firstTouchX(event) - panStartX;
          }}
          onResponderRelease={() => {
            rowDx.value = 0;
            status.value = 'strip released';
          }}
          onResponderTerminate={() => {
            rowDx.value = 0;
          }}
          class="strip-box"
        >
          <view class="row-tight" style={{ transform: [{ translateX: rowDx.value }] }}>
            {CHIPS.map(index => (
              <view
                key={index}
                testID={`resp-chip-${index}`}
                onStartShouldSetResponder={() => true}
                onResponderGrant={(event: ISymbioteEvent) => grabChip(index, event)}
                onResponderMove={(event: ISymbioteEvent) => {
                  chipDx.value = firstTouchX(event) - startX;
                  status.value = `chip ${index} moving · dx=${Math.round(chipDx.value)}`;
                }}
                onResponderTerminationRequest={() => true}
                onResponderTerminate={() => {
                  chipDx.value = 0;
                  activeChip.value = null;
                }}
                onResponderRelease={() => releaseChip(index)}
                class="chip"
                // White ring: the chip's own fill is the accent, so an accent ring would be invisible
                style={{
                  borderColor: activeChip.value === index ? '#ffffff' : 'transparent',
                  transform: [{ translateX: activeChip.value === index ? chipDx.value : 0 }],
                }}
              >
                <text class="chip-text">{index}</text>
              </view>
            ))}
          </view>
        </view>
      </view>
    );
  },
});
