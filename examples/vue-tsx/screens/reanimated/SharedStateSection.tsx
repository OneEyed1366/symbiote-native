import { defineComponent, ref, shallowRef } from 'vue';
import Reanimated, {
  createAnimatedComponent,
  getViewProp,
  makeMutable,
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from '@symbiote-native/reanimated/vue';
import { createSynchronizable } from 'react-native-worklets';
import { ActionButton } from '../../components/ActionButton';
import { ACCENT } from './colors';
import { Section } from './Section';

const GROWN = 1.4;
const SMALL = 1;

// Made at module load, outside any component, so nothing in Vue owns its lifetime
const clicks = makeMutable(0);
const reads = createSynchronizable(0);

// A ref on a component gets what it exposes, so the node goes out as `hostNode`
const Badge = defineComponent(
  (_props, { attrs, expose }) => {
    const hostNode = shallowRef<unknown>(null);
    expose({
      get hostNode() {
        return hostNode.value;
      },
    });
    return () => (
      <Reanimated.View
        class="ra-tile ra-tile-small"
        ref={(node: unknown) => (hostNode.value = node)}
        {...attrs}
      />
    );
  },
  { name: 'Badge', inheritAttrs: false },
);

// Returns the component itself: every host tag already takes an animated style
const AnimatedBadge = createAnimatedComponent(Badge);

// A mutable and a synchronizable made outside Vue, a component of ours animated, and a view prop
// read back from the UI side
export const SharedStateSection = defineComponent(() => {
  const mutable = ref(clicks.value);
  const synchronizable = ref(reads.getBlocking());
  const opacity = ref('unread');
  const scale = useSharedValue<number>(SMALL);
  const badgeRef = useAnimatedRef();

  const grow = useAnimatedStyle(() => {
    'worklet';
    return { transform: [{ scale: scale.value }] };
  });

  const countMutable = () => {
    clicks.value += 1;
    mutable.value = clicks.value;
  };

  const countSynchronizable = () => {
    reads.setBlocking(previous => previous + 1);
    synchronizable.value = reads.getBlocking();
  };

  const readOpacity = async () => {
    const tag = badgeRef.getTag();
    if (tag === null) return;
    const read = await getViewProp<number>(tag, 'opacity', badgeRef.current);
    opacity.value = String(read);
  };

  return () => (
    <Section
      title="Shared state"
      note="makeMutable, createSynchronizable, createAnimatedComponent and getViewProp"
    >
      <text class="ra-note">{`mutable: ${mutable.value}`}</text>
      <text class="ra-note">{`synchronizable: ${synchronizable.value}`}</text>
      <text class="ra-note">{`opacity: ${opacity.value}`}</text>
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
});
