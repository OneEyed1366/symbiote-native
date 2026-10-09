import { useRef, useState } from 'react';
import Animated, {
  CurvedTransition,
  FadeIn,
  FadeOut,
  FadingTransition,
  JumpingTransition,
  LinearTransition,
  SequencedTransition,
  type ILayoutAnimationBuilder,
} from '@symbiote-native/reanimated/react';
import { ActionButton } from '../../components/ActionButton';
import { Section } from './Section';

const FIRST_ROWS = 4;
const SHUFFLE_COLOR = '#4ea1ff';
const ADD_COLOR = '#6ad48b';
const REMOVE_COLOR = '#ff5c5c';
const NEXT_COLOR = '#bb86fc';

type ITransition = { name: string; layout: ILayoutAnimationBuilder };

const LINEAR: ITransition = { name: 'Linear', layout: LinearTransition };

const TRANSITIONS: readonly ITransition[] = [
  LINEAR,
  { name: 'Fading', layout: FadingTransition },
  { name: 'Sequenced', layout: SequencedTransition },
  { name: 'Jumping', layout: JumpingTransition },
  { name: 'Curved', layout: CurvedTransition },
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
  const [rows, setRows] = useState(startingNumbers);
  const [transition, setTransition] = useState(LINEAR);
  const nextRow = useRef(FIRST_ROWS);

  const add = () => {
    setRows([nextRow.current, ...rows]);
    nextRow.current += 1;
  };

  const shuffle = () => setRows([...rows.slice(1), ...rows.slice(0, 1)]);

  return (
    <Section
      title="Layout transitions"
      note="Linear, Fading, Sequenced, Jumping and Curved, on rows that shuffle, join and leave"
    >
      <text className="ra-note">{`transition: ${transition.name}`}</text>
      <view className="ra-list">
        {rows.map(row => (
          <Animated.View
            key={row}
            testID={`ra-row-${row}`}
            className="ra-item"
            layout={transition.layout}
            entering={FadeIn}
            exiting={FadeOut}
          >
            <text className="ra-item-text">{`row ${row}`}</text>
          </Animated.View>
        ))}
      </view>
      <view className="ra-wrap">
        <ActionButton
          testID="ra-layout-shuffle"
          title="shuffle"
          onPress={shuffle}
          color={SHUFFLE_COLOR}
        />
        <ActionButton
          testID="ra-layout-add"
          title="add"
          onPress={add}
          color={ADD_COLOR}
        />
        <ActionButton
          testID="ra-layout-remove"
          title="remove"
          onPress={() => setRows(rows.slice(1))}
          color={REMOVE_COLOR}
        />
        <ActionButton
          testID="ra-layout-next"
          title="next transition"
          onPress={() => setTransition(nextTransition(transition))}
          color={NEXT_COLOR}
        />
      </view>
    </Section>
  );
}
