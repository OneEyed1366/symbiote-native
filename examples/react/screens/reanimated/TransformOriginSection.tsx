import { useState } from 'react';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from '@symbiote-native/reanimated/react';
import { ActionButton } from '../../components/ActionButton';
import { Section } from './Section';

const TURN_DEGREES = 45;
const TURN_MS = 800;
const PICK_COLOR = '#4ea1ff';

const ORIGINS = [
  'center',
  'top left',
  'top right',
  'bottom right',
  'bottom left',
  '25% 25%',
  '50px 100%',
] as const;

type IOrigin = (typeof ORIGINS)[number];

const idOf = (origin: IOrigin) => origin.replace(/[^a-z0-9]+/g, '-');

// The same turn around a different point each time: the origin is part of the animated style
export function TransformOriginSection() {
  const progress = useSharedValue(0);
  const origin = useSharedValue<IOrigin>('center');
  const [picked, setPicked] = useState<IOrigin>('center');

  const turn = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${interpolate(progress.value, [0, 1], [0, TURN_DEGREES])}deg` },
    ],
    transformOrigin: origin.value,
  }));

  const pick = (next: IOrigin) => {
    origin.value = next;
    progress.value = 0;
    progress.value = withTiming(1, {
      duration: TURN_MS,
      easing: Easing.out(Easing.exp),
    });
    setPicked(next);
  };

  return (
    <Section
      title="Transform origin"
      note="the box turns 45 degrees around the point you pick"
    >
      <view className="ra-stage">
        <Animated.View testID="ra-origin-box" className="ra-box" style={turn} />
      </view>
      <text className="ra-note">{`origin: ${picked}`}</text>
      <view className="ra-wrap">
        {ORIGINS.map(next => (
          <ActionButton
            key={next}
            testID={`ra-origin-${idOf(next)}`}
            title={next}
            onPress={() => pick(next)}
            color={PICK_COLOR}
          />
        ))}
      </view>
    </Section>
  );
}
