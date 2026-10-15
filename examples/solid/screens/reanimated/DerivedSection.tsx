import { createSignal } from 'solid-js';
import {
  Extrapolation,
  interpolate,
  interpolateColor,
  useAnimatedProps,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from '@symbiote-native/reanimated/solid';
import { scheduleOnRN } from 'react-native-worklets';
import { ActionButton } from '../../components/ActionButton';
import { GO_COLOR } from './colors';
import { Section } from './Section';

const DONE = 1;
const START = 0;
const RUN_MS = 1_500;
const QUARTERS = 4;
const FULL_TURN = 360;
const MAX_SCALE = 1.4;
const FROM_COLOR = '#4ea1ff';
const TO_COLOR = '#ff7a59';

// One progress value feeds a derived angle, an interpolated colour and scale, a reaction that
// reports to the JS thread, and a `text` prop written straight to a native TextInput
export function DerivedSection() {
  const progress = useSharedValue<number>(START);
  const [quarter, setQuarter] = createSignal(0);

  const angle = useDerivedValue(() => {
    'worklet';
    return interpolate(
      progress.value,
      [START, DONE],
      [0, FULL_TURN],
      Extrapolation.CLAMP,
    );
  });

  const look = useAnimatedStyle(() => {
    'worklet';
    return {
      backgroundColor: interpolateColor(
        progress.value,
        [START, DONE],
        [FROM_COLOR, TO_COLOR],
      ),
      transform: [
        { rotate: `${angle.value}deg` },
        {
          scale: interpolate(
            progress.value,
            [START, DONE],
            [1, MAX_SCALE],
            Extrapolation.CLAMP,
          ),
        },
      ],
    };
  });

  useAnimatedReaction(
    () => {
      'worklet';
      return Math.min(Math.floor(progress.value * QUARTERS), QUARTERS - 1);
    },
    (now, before) => {
      'worklet';
      if (now !== before) scheduleOnRN(setQuarter, now);
    },
  );

  const readout = useAnimatedProps(() => {
    'worklet';
    return { text: `${Math.round(progress.value * 100)}%` };
  });

  const run = () => {
    progress.value = withTiming(progress.value > DONE / 2 ? START : DONE, {
      duration: RUN_MS,
    });
  };

  return (
    <Section
      title="Derived values and animated props"
      note="useDerivedValue, interpolate, interpolateColor, useAnimatedReaction and useAnimatedProps"
    >
      <view class="ra-row">
        <view testID="ra-derived-box" class="ra-box" style={look} />
        <text-input
          testID="ra-derived-readout"
          class="ra-readout"
          editable={false}
          defaultValue="0%"
          {...{ animatedProps: readout }}
        />
      </view>
      <text class="ra-note">{`reaction saw quarter ${quarter() + 1} of ${QUARTERS}`}</text>
      <ActionButton
        testID="ra-derived-run"
        title="run"
        onPress={run}
        color={GO_COLOR}
      />
    </Section>
  );
}
