<script lang="ts">
import { makeMutable } from '@symbiote-native/reanimated/vue';
import { createSynchronizable } from 'react-native-worklets';

// Made at module load, outside any component, so nothing in Vue owns its lifetime
const clicks = makeMutable(0);
const reads = createSynchronizable(0);
</script>

<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  createAnimatedComponent,
  getViewProp,
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from '@symbiote-native/reanimated/vue';
import ActionButton from '../../components/ActionButton.vue';
import RaBadge from './RaBadge.vue';
import RaSection from './RaSection.vue';
import { ACCENT } from './constants';

const GROWN = 1.4;
const SMALL = 1;

// Returns the component itself: every host tag already takes an animated style
const AnimatedBadge = createAnimatedComponent(RaBadge);

// A mutable and a synchronizable made outside Vue, a component of ours animated, and a view prop
// read back from the UI side
const mutable = ref(clicks.value);
const synchronizable = ref(reads.getBlocking());
const opacity = ref('unread');
const scale = useSharedValue<number>(SMALL);
const badgeRef = useAnimatedRef();
const mutableNote = computed(() => `mutable: ${mutable.value}`);
const synchronizableNote = computed(
  () => `synchronizable: ${synchronizable.value}`,
);
const opacityNote = computed(() => `opacity: ${opacity.value}`);

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

const growBadge = () => {
  scale.value = withSpring(scale.value === SMALL ? GROWN : SMALL);
};

const readOpacity = async () => {
  const tag = badgeRef.getTag();
  if (tag === null) return;
  const read = await getViewProp<number>(tag, 'opacity', badgeRef.current);
  opacity.value = String(read);
};
</script>

<template>
  <RaSection
    title="Shared state"
    note="makeMutable, createSynchronizable, createAnimatedComponent and getViewProp"
  >
    <text class="ra-note">{{ mutableNote }}</text>
    <text class="ra-note">{{ synchronizableNote }}</text>
    <text class="ra-note">{{ opacityNote }}</text>
    <view class="ra-stage">
      <AnimatedBadge :ref="badgeRef" :style="grow" />
    </view>
    <view class="ra-wrap">
      <ActionButton
        testID="ra-shared-mutable"
        title="makeMutable +1"
        :onPress="countMutable"
        :color="ACCENT"
      />
      <ActionButton
        testID="ra-shared-sync"
        title="synchronizable +1"
        :onPress="countSynchronizable"
        :color="ACCENT"
      />
      <ActionButton
        testID="ra-shared-grow"
        title="grow badge"
        :onPress="growBadge"
        :color="ACCENT"
      />
      <ActionButton
        testID="ra-shared-read"
        title="getViewProp"
        :onPress="readOpacity"
        :color="ACCENT"
      />
    </view>
  </RaSection>
</template>
