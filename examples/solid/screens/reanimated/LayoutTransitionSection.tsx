import { createSignal, For } from 'solid-js';
import {
  CurvedTransition,
  EntryExitTransition,
  FadeIn,
  FadeOut,
  FadingTransition,
  JumpingTransition,
  LinearTransition,
  SequencedTransition,
  type ILayoutAnimationBuilder,
} from '@symbiote-native/reanimated/solid';
import { ActionButton } from '../../components/ActionButton';
import { ACCENT, GO_COLOR, NEXT_COLOR, STOP_COLOR } from './colors';
import { Section } from './Section';

const FIRST_ROWS = 4;

type ITransition = { name: string; layout: ILayoutAnimationBuilder };

const LINEAR: ITransition = { name: 'Linear', layout: LinearTransition };

const TRANSITIONS: readonly ITransition[] = [
  LINEAR,
  { name: 'Fading', layout: FadingTransition },
  { name: 'Sequenced', layout: SequencedTransition },
  { name: 'Jumping', layout: JumpingTransition },
  { name: 'Curved', layout: CurvedTransition },
  {
    name: 'EntryExit',
    layout: EntryExitTransition.entering(FadeIn).exiting(FadeOut),
  },
];

function nextTransition(current: ITransition): ITransition {
  const at = TRANSITIONS.indexOf(current);
  return TRANSITIONS[(at + 1) % TRANSITIONS.length] ?? LINEAR;
}

function startingNumbers(): number[] {
  return Array.from({ length: FIRST_ROWS }, (_, index) => index);
}

// Rows that move when the list changes: the layout prop animates the move, entering and exiting
// animate the rows that come and go
export function LayoutTransitionSection() {
  const [rows, setRows] = createSignal(startingNumbers());
  const [transition, setTransition] = createSignal(LINEAR);
  let nextRow = FIRST_ROWS;

  const add = () => {
    setRows([nextRow, ...rows()]);
    nextRow += 1;
  };

  const shuffle = () => setRows([...rows().slice(1), ...rows().slice(0, 1)]);

  return (
    <Section
      title="Layout transitions"
      note="Linear, Fading, Sequenced, Jumping and Curved, on rows that shuffle, join and leave"
    >
      <text class="ra-note">{`transition: ${transition().name}`}</text>
      <view class="ra-list">
        <For each={rows()}>
          {row => (
            <view
              testID={`ra-row-${row}`}
              class="ra-item"
              {...{
                layout: transition().layout,
                entering: FadeIn,
                exiting: FadeOut,
              }}
            >
              <text class="ra-item-text">{`row ${row}`}</text>
            </view>
          )}
        </For>
      </view>
      <view class="ra-wrap">
        <ActionButton
          testID="ra-layout-shuffle"
          title="shuffle"
          onPress={shuffle}
          color={ACCENT}
        />
        <ActionButton
          testID="ra-layout-add"
          title="add"
          onPress={add}
          color={GO_COLOR}
        />
        <ActionButton
          testID="ra-layout-remove"
          title="remove"
          onPress={() => setRows(rows().slice(1))}
          color={STOP_COLOR}
        />
        <ActionButton
          testID="ra-layout-next"
          title="next transition"
          onPress={() => setTransition(nextTransition(transition()))}
          color={NEXT_COLOR}
        />
      </view>
    </Section>
  );
}
