import { defineComponent, ref, shallowRef } from 'vue';
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
import { ActionButton } from '../../components/ActionButton';
import { GO_COLOR, NEXT_COLOR } from './colors';
import { Section } from './Section';

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

function nextPreset(current: IPreset): IPreset {
  const at = PRESETS.indexOf(current);
  return PRESETS[(at + 1) % PRESETS.length] ?? FADE;
}

// The ready-made animations one after another, a keyframe of our own, and a config that skips
// the entering animation of what mounts with it
export const EnteringExitingSection = defineComponent(() => {
  const preset = shallowRef(FADE);
  const isTileShown = ref(true);
  const isPopShown = ref(true);
  const mounts = ref(0);
  const isSkipping = ref(true);

  return () => (
    <Section
      title="Entering and exiting"
      note="ready-made animations, a Keyframe of our own and LayoutAnimationConfig"
    >
      <text class="ra-note">{`preset: ${preset.value.name}`}</text>
      <view class="ra-stage">
        {isTileShown.value ? (
          <Reanimated.View
            key={preset.value.name}
            testID="ra-preset-tile"
            class="ra-tile"
            entering={preset.value.entering}
            exiting={preset.value.exiting}
          />
        ) : null}
      </view>
      <view class="ra-wrap">
        <ActionButton
          testID="ra-preset-toggle"
          title={isTileShown.value ? 'hide' : 'show'}
          onPress={() => (isTileShown.value = !isTileShown.value)}
          color={GO_COLOR}
        />
        <ActionButton
          testID="ra-preset-next"
          title="next preset"
          onPress={() => (preset.value = nextPreset(preset.value))}
          color={NEXT_COLOR}
        />
      </view>

      <text class="ra-note">Keyframe</text>
      <view class="ra-stage">
        {isPopShown.value ? (
          <Reanimated.View
            testID="ra-pop-tile"
            class="ra-tile"
            entering={POP}
            exiting={FadeOut}
          />
        ) : null}
      </view>
      <ActionButton
        testID="ra-pop-toggle"
        title={isPopShown.value ? 'hide' : 'show'}
        onPress={() => (isPopShown.value = !isPopShown.value)}
        color={GO_COLOR}
      />

      <text class="ra-note">
        {`LayoutAnimationConfig, skip entering: ${isSkipping.value ? 'on' : 'off'}`}
      </text>
      <LayoutAnimationConfig
        key={mounts.value}
        skipEntering={isSkipping.value}
        skipExiting={isSkipping.value}
      >
        <view class="ra-row">
          {TILE_INDEXES.map(index => (
            <Reanimated.View
              key={index}
              testID={`ra-config-tile-${index}`}
              class="ra-tile ra-tile-small"
              entering={FadeIn.delay(index * STAGGER_MS)}
            />
          ))}
        </view>
      </LayoutAnimationConfig>
      <view class="ra-wrap">
        <ActionButton
          testID="ra-config-skip"
          title="toggle skip"
          onPress={() => {
            isSkipping.value = !isSkipping.value;
            mounts.value += 1;
          }}
          color={NEXT_COLOR}
        />
        <ActionButton
          testID="ra-config-remount"
          title="mount again"
          onPress={() => (mounts.value += 1)}
          color={GO_COLOR}
        />
      </view>
    </Section>
  );
});
