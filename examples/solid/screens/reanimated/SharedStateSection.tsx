import { createSignal } from 'solid-js';
import {
  createAnimatedComponent,
  getViewProp,
  makeMutable,
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type IAnimatedHostProps,
} from '@symbiote-native/reanimated/solid';
import type { IViewProps } from '@symbiote-native/solid';
import { createSynchronizable } from 'react-native-worklets';
import { ActionButton } from '../../components/ActionButton';
import { ACCENT } from './colors';
import { Section } from './Section';

const GROWN = 1.4;
const SMALL = 1;

// Made at module load, outside any component, so nothing in Solid owns its lifetime
const clicks = makeMutable(0);
const reads = createSynchronizable(0);

function Badge(props: IAnimatedHostProps<IViewProps>) {
  return <view class="ra-tile ra-tile-small" {...props} />;
}

// Returns the component itself: every host tag already takes an animated style
const AnimatedBadge = createAnimatedComponent(Badge);

// A mutable and a synchronizable made outside Solid, a component of ours animated, and a view prop
// read back from the UI side
export function SharedStateSection() {
  const [mutable, setMutable] = createSignal(clicks.value);
  const [synchronizable, setSynchronizable] = createSignal(reads.getBlocking());
  const [opacity, setOpacity] = createSignal('unread');
  const scale = useSharedValue<number>(SMALL);
  const badgeRef = useAnimatedRef();

  const grow = useAnimatedStyle(() => {
    'worklet';
    return { transform: [{ scale: scale.value }] };
  });

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
      <text class="ra-note">{`mutable: ${mutable()}`}</text>
      <text class="ra-note">{`synchronizable: ${synchronizable()}`}</text>
      <text class="ra-note">{`opacity: ${opacity()}`}</text>
      <view class="ra-stage">
        <AnimatedBadge ref={badgeRef} style={grow} />
      </view>
      <view class="ra-wrap">
        <ActionButton
          testID="ra-shared-mutable"
          title="makeMutable +1"
          onPress={countMutable}
          color={ACCENT}
        />
        <ActionButton
          testID="ra-shared-sync"
          title="synchronizable +1"
          onPress={countSynchronizable}
          color={ACCENT}
        />
        <ActionButton
          testID="ra-shared-grow"
          title="grow badge"
          onPress={() => {
            scale.value = withSpring(scale.value === SMALL ? GROWN : SMALL);
          }}
          color={ACCENT}
        />
        <ActionButton
          testID="ra-shared-read"
          title="getViewProp"
          onPress={readOpacity}
          color={ACCENT}
        />
      </view>
    </Section>
  );
}
