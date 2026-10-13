<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue';
import Reanimated, {
  BounceIn,
  BounceOut,
  FadeIn,
  FadeOut,
  FlipInXUp,
  FlipOutXDown,
  Keyframe,
  LayoutAnimationConfig,
  LightSpeedInRight,
  LightSpeedOutLeft,
  PinwheelIn,
  PinwheelOut,
  RollInLeft,
  RollOutRight,
  RotateInDownLeft,
  RotateOutUpRight,
  SlideInRight,
  SlideOutLeft,
  StretchInX,
  StretchOutX,
  ZoomIn,
  ZoomOut,
  type EntryOrExitLayoutType,
} from '@symbiote-native/reanimated/vue';
import ActionButton from '../../components/ActionButton.vue';
import RaSection from './RaSection.vue';
import { GO_COLOR, NEXT_COLOR } from './constants';

const POP_MS = 700;
const POP_PEAK = 60;
const STAGGER_MS = 150;
const TILE_INDEXES = [0, 1, 2];

type IPreset = {
  name: string;
  entering: EntryOrExitLayoutType;
  exiting: EntryOrExitLayoutType;
};

const FADE: IPreset = { name: 'Fade', entering: FadeIn, exiting: FadeOut };

const PRESETS: readonly IPreset[] = [
  FADE,
  { name: 'Slide', entering: SlideInRight, exiting: SlideOutLeft },
  { name: 'Zoom', entering: ZoomIn, exiting: ZoomOut },
  { name: 'Bounce', entering: BounceIn, exiting: BounceOut },
  { name: 'Flip', entering: FlipInXUp, exiting: FlipOutXDown },
  { name: 'Rotate', entering: RotateInDownLeft, exiting: RotateOutUpRight },
  {
    name: 'LightSpeed',
    entering: LightSpeedInRight,
    exiting: LightSpeedOutLeft,
  },
  { name: 'Pinwheel', entering: PinwheelIn, exiting: PinwheelOut },
  { name: 'Roll', entering: RollInLeft, exiting: RollOutRight },
  { name: 'Stretch', entering: StretchInX, exiting: StretchOutX },
];

// A custom animation: a keyframe at every step the author names
const POP = new Keyframe({
  from: { opacity: 0, transform: [{ scale: 0.2 }] },
  [POP_PEAK]: { opacity: 1, transform: [{ scale: 1.2 }] },
  to: { transform: [{ scale: 1 }] },
}).duration(POP_MS);

const TILES = TILE_INDEXES.map(index => ({
  index,
  entering: FadeIn.delay(index * STAGGER_MS),
}));

// The ready-made animations one after another, a keyframe of our own, and a config that skips
// the entering animation of what mounts with it
const preset = shallowRef(FADE);
const isTileShown = ref(true);
const isPopShown = ref(true);
const mounts = ref(0);
const isSkipping = ref(true);
const presetNote = computed(() => `preset: ${preset.value.name}`);
const configNote = computed(
  () => `LayoutAnimationConfig, skip entering: ${isSkipping.value ? 'on' : 'off'}`,
);

const nextPreset = () => {
  const at = PRESETS.indexOf(preset.value);
  preset.value = PRESETS[(at + 1) % PRESETS.length] ?? FADE;
};

const toggleSkip = () => {
  isSkipping.value = !isSkipping.value;
  mounts.value += 1;
};
</script>

<template>
  <RaSection
    title="Entering and exiting"
    note="ready-made animations, a Keyframe of our own and LayoutAnimationConfig"
  >
    <text class="ra-note">{{ presetNote }}</text>
    <view class="ra-stage">
      <Reanimated.View
        v-if="isTileShown"
        :key="preset.name"
        testID="ra-preset-tile"
        class="ra-tile"
        :entering="preset.entering"
        :exiting="preset.exiting"
      />
    </view>
    <view class="ra-wrap">
      <ActionButton
        testID="ra-preset-toggle"
        :title="isTileShown ? 'hide' : 'show'"
        :onPress="() => (isTileShown = !isTileShown)"
        :color="GO_COLOR"
      />
      <ActionButton
        testID="ra-preset-next"
        title="next preset"
        :onPress="nextPreset"
        :color="NEXT_COLOR"
      />
    </view>

    <text class="ra-note">Keyframe</text>
    <view class="ra-stage">
      <Reanimated.View
        v-if="isPopShown"
        testID="ra-pop-tile"
        class="ra-tile"
        :entering="POP"
        :exiting="FadeOut"
      />
    </view>
    <ActionButton
      testID="ra-pop-toggle"
      :title="isPopShown ? 'hide' : 'show'"
      :onPress="() => (isPopShown = !isPopShown)"
      :color="GO_COLOR"
    />

    <text class="ra-note">{{ configNote }}</text>
    <LayoutAnimationConfig
      :key="mounts"
      :skipEntering="isSkipping"
      :skipExiting="isSkipping"
    >
      <view class="ra-row">
        <Reanimated.View
          v-for="tile in TILES"
          :key="tile.index"
          :testID="`ra-config-tile-${tile.index}`"
          class="ra-tile ra-tile-small"
          :entering="tile.entering"
        />
      </view>
    </LayoutAnimationConfig>
    <view class="ra-wrap">
      <ActionButton
        testID="ra-config-skip"
        title="toggle skip"
        :onPress="toggleSkip"
        :color="NEXT_COLOR"
      />
      <ActionButton
        testID="ra-config-remount"
        title="mount again"
        :onPress="() => (mounts += 1)"
        :color="GO_COLOR"
      />
    </view>
  </RaSection>
</template>
