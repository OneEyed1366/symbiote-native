import { useState } from 'react';
import type { IViewProps } from '@symbiote-native/react';
import Animated, {
  createAnimatedComponent,
  getViewProp,
  makeMutable,
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type IAnimatedHostProps,
} from '@symbiote-native/reanimated/react';
import { createSynchronizable } from 'react-native-worklets';
import { ActionButton } from '../../components/ActionButton';
import { Section } from './Section';

const RUN_COLOR = '#4ea1ff';
const GROWN = 1.4;
const SMALL = 1;

// Made at module load, outside any component, so nothing in React owns its lifetime
const clicks = makeMutable(0);
const reads = createSynchronizable(0);

function Badge(props: IAnimatedHostProps<IViewProps>) {
  return <Animated.View className="ra-tile ra-tile-small" {...props} />;
}

// Returns the component itself: every host tag already takes an animated style
const AnimatedBadge = createAnimatedComponent(Badge);

// A mutable and a synchronizable made outside React, a component of ours animated, and a view prop
// read back from the UI side
export function SharedStateSection() {
  const [mutable, setMutable] = useState(clicks.value);
  const [synchronizable, setSynchronizable] = useState(reads.getBlocking());
  const [opacity, setOpacity] = useState('unread');
  const scale = useSharedValue<number>(SMALL);
  const badgeRef = useAnimatedRef();

  const grow = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const countMutable = () => {
    clicks.value += 1;
    setMutable(clicks.value);
  };

  const countSynchronizable = () => {
    reads.setBlocking(previous => previous + 1);
    setSynchronizable(reads.getBlocking());
  };

  const readOpacity = async () => {
    const tag = badgeRef.getTag();
    if (tag === null) return;
    const read = await getViewProp<number>(tag, 'opacity', badgeRef.current);
    setOpacity(String(read));
  };

  return (
    <Section
      title="Shared state"
      note="makeMutable, createSynchronizable, createAnimatedComponent and getViewProp"
    >
      <text className="ra-note">{`mutable: ${mutable}`}</text>
      <text className="ra-note">{`synchronizable: ${synchronizable}`}</text>
      <text className="ra-note">{`opacity: ${opacity}`}</text>
      <view className="ra-stage">
        <AnimatedBadge ref={badgeRef} style={grow} />
      </view>
      <view className="ra-wrap">
        <ActionButton
          testID="ra-shared-mutable"
          title="makeMutable +1"
          onPress={countMutable}
          color={RUN_COLOR}
        />
        <ActionButton
          testID="ra-shared-sync"
          title="synchronizable +1"
          onPress={countSynchronizable}
          color={RUN_COLOR}
        />
        <ActionButton
          testID="ra-shared-grow"
          title="grow badge"
          onPress={() => {
            scale.value = withSpring(scale.value === SMALL ? GROWN : SMALL);
          }}
          color={RUN_COLOR}
        />
        <ActionButton
          testID="ra-shared-read"
          title="getViewProp"
          onPress={readOpacity}
          color={RUN_COLOR}
        />
      </view>
    </Section>
  );
}
