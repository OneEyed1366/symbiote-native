// Responder: the gesture capabilities exposed here, shown so the grabbed element is the one that
// moves. Each chip is its OWN responder: it grabs on touch start and drags ITSELF
// (onResponderMove translates that chip). Drag a chip past a threshold and the surrounding strip
// STEALS the gesture: its onMoveShouldSetResponder fires once the finger has travelled far enough,
// the chip yields (onResponderTerminationRequest -> terminate, so it snaps back) and the strip pans
// the whole row. DEBUG logcat shows "responder transferred … -> …" at that moment.
//
// The responder handlers are plain passthrough props on View (IViewProps extends IResponderProps),
// same names and signatures as every other adapter's — so the only port work is the lifecycle.
//
// WHY EVERY REACTIVE READ HERE SITS IN A PROP BAG, and none in a child position
// (.claude/rules/solid-descriptor-bridge.md §4). A value that crosses into the CHILD tree makes
// Solid REPLACE that subtree, and a rebuild landing between pressIn and the responder grant kills
// the gesture outright — the measured "fires on every other tap" bug. A prop bag reaches the host
// through `spread`, a per-key diff on the SAME element, so `activeChip()` / `chipDx()` inside
// `style` cannot rebuild anything mid-drag. Keep new reads on that side of the line.

import { Index, createSignal } from 'solid-js';
import { Text, View, type ISymbioteEvent } from '@symbiote-native/solid';
import { firstTouchX } from './event-utils';
import './ResponderDemo.css';

const RESPONDER_CHIPS = [0, 1, 2, 3, 4];
// Horizontal travel (in the touch's page units: px on Android, pt on iOS, so the feel differs a
// little per platform) after which the strip steals the gesture from the chip.
const RESPONDER_STEAL_DX = 64;

export function ResponderDemo() {
  const [activeChip, setActiveChip] = createSignal<number | null>(null);
  const [chipDx, setChipDx] = createSignal(0);
  const [rowDx, setRowDx] = createSignal(0);
  const [status, setStatus] = createSignal(
    'tap a chip · drag it to move · drag far → strip steals it',
  );
  const [transfer, setTransfer] = createSignal('');

  // The useRef twins: read and written imperatively inside handlers, never painted. Plain `let` in
  // the body is already the right lifetime — a Solid body runs once, so these survive every later
  // recompute without a ref wrapper.
  let startX = 0;
  let panStartX = 0;
  let grabbed: number | null = null;

  return (
    <View class="section-nested">
      <Text class="section-label">
        Responder · drag a chip vs hand-off to the strip
      </Text>
      <Text class="resp-status">{status()}</Text>
      {/* the separate transfer indicator, lit only when the strip steals the gesture */}
      <Text
        class="resp-transfer"
        style={{ color: transfer() ? '#f6ad55' : '#41506a' }}
      >
        {transfer() || 'transfer: —'}
      </Text>

      <View
        class="resp-strip"
        onMoveShouldSetResponder={(event: ISymbioteEvent) =>
          grabbed !== null &&
          Math.abs(firstTouchX(event) - startX) > RESPONDER_STEAL_DX
        }
        onResponderGrant={(event: ISymbioteEvent) => {
          setTransfer(`↯ strip stole the gesture from chip ${grabbed ?? '?'}`);
          setActiveChip(null);
          setChipDx(0);
          panStartX = firstTouchX(event);
          setStatus('strip panning');
        }}
        onResponderMove={(event: ISymbioteEvent) =>
          setRowDx(firstTouchX(event) - panStartX)
        }
        onResponderRelease={() => {
          setRowDx(0);
          setStatus('strip released');
        }}
        onResponderTerminate={() => setRowDx(0)}
      >
        <View class="resp-row" style={{ transform: [{ translateX: rowDx() }] }}>
          {/* Index, not For: a chip is a fixed positional slot, so keying it by value would
              rebuild the whole column on any array identity change. Imported explicitly — an
              un-imported control-flow name resolves against the renderer module and reads
              `undefined` at RUNTIME, with the bundle building fine (§3). */}
          <Index each={RESPONDER_CHIPS}>
            {(_chip, index) => (
              <View
                testID={`resp-chip-${index}`}
                class="resp-chip"
                style={{
                  borderColor:
                    activeChip() === index ? '#7fb5ff' : 'transparent',
                  transform: [
                    { translateX: activeChip() === index ? chipDx() : 0 },
                  ],
                }}
                onStartShouldSetResponder={() => true}
                onResponderGrant={(event: ISymbioteEvent) => {
                  startX = firstTouchX(event);
                  grabbed = index;
                  setActiveChip(index);
                  setChipDx(0);
                  setRowDx(0);
                  setTransfer('');
                  setStatus(`chip ${index} grabbed`);
                }}
                onResponderMove={(event: ISymbioteEvent) => {
                  const dx = firstTouchX(event) - startX;
                  setChipDx(dx);
                  setStatus(`chip ${index} moving · dx=${Math.round(dx)}`);
                }}
                onResponderTerminationRequest={() => true}
                onResponderTerminate={() => {
                  setChipDx(0);
                  setActiveChip(null);
                }}
                onResponderRelease={() => {
                  setChipDx(0);
                  setActiveChip(null);
                  setStatus(`chip ${index} released`);
                }}
              >
                <Text class="resp-chip-text">{index}</Text>
              </View>
            )}
          </Index>
        </View>
      </View>
    </View>
  );
}
