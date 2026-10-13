import { createSignal, For, Show } from 'solid-js';
import {
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
} from '@symbiote-native/reanimated/solid';
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
export function EnteringExitingSection() {
  const [preset, setPreset] = createSignal(FADE);
  const [isTileShown, setIsTileShown] = createSignal(true);
  const [isPopShown, setIsPopShown] = createSignal(true);
  const [mounts, setMounts] = createSignal(0);
  const [isSkipping, setIsSkipping] = createSignal(true);

  return (
    <Section
      title="Entering and exiting"
      note="ready-made animations, a Keyframe of our own and LayoutAnimationConfig"
    >
      <text class="ra-note">{`preset: ${preset().name}`}</text>
      <view class="ra-stage">
        <Show keyed when={isTileShown() ? preset() : undefined}>
          {current => (
            <view
              testID="ra-preset-tile"
              class="ra-tile"
              {...{ entering: current.entering, exiting: current.exiting }}
            />
          )}
        </Show>
      </view>
      <view class="ra-wrap">
        <ActionButton
          testID="ra-preset-toggle"
          title={isTileShown() ? 'hide' : 'show'}
          onPress={() => setIsTileShown(!isTileShown())}
          color={GO_COLOR}
        />
        <ActionButton
          testID="ra-preset-next"
          title="next preset"
          onPress={() => setPreset(nextPreset(preset()))}
          color={NEXT_COLOR}
        />
      </view>

      <text class="ra-note">Keyframe</text>
      <view class="ra-stage">
        <Show when={isPopShown()}>
          <view
            testID="ra-pop-tile"
            class="ra-tile"
            {...{ entering: POP, exiting: FadeOut }}
          />
        </Show>
      </view>
      <ActionButton
        testID="ra-pop-toggle"
        title={isPopShown() ? 'hide' : 'show'}
        onPress={() => setIsPopShown(!isPopShown())}
        color={GO_COLOR}
      />

      <text class="ra-note">
        {`LayoutAnimationConfig, skip entering: ${isSkipping() ? 'on' : 'off'}`}
      </text>
      <For each={[mounts()]}>
        {() => (
          <LayoutAnimationConfig
            skipEntering={isSkipping()}
            skipExiting={isSkipping()}
          >
            <view class="ra-row">
              <For each={TILE_INDEXES}>
                {index => (
                  <view
                    testID={`ra-config-tile-${index}`}
                    class="ra-tile ra-tile-small"
                    {...{ entering: FadeIn.delay(index * STAGGER_MS) }}
                  />
                )}
              </For>
            </view>
          </LayoutAnimationConfig>
        )}
      </For>
      <view class="ra-wrap">
        <ActionButton
          testID="ra-config-skip"
          title="toggle skip"
          onPress={() => {
            setIsSkipping(!isSkipping());
            setMounts(mounts() + 1);
          }}
          color={NEXT_COLOR}
        />
        <ActionButton
          testID="ra-config-remount"
          title="mount again"
          onPress={() => setMounts(mounts() + 1)}
          color={GO_COLOR}
        />
      </view>
    </Section>
  );
}
