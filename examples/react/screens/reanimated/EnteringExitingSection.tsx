import { useState } from 'react';
import Animated, {
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
} from '@symbiote-native/reanimated/react';
import { ActionButton } from '../../components/ActionButton';
import { Section } from './Section';

const POP_MS = 700;
const POP_PEAK = 60;
const STAGGER_MS = 150;
const SHOW_COLOR = '#6ad48b';
const NEXT_COLOR = '#bb86fc';
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
  const [preset, setPreset] = useState(FADE);
  const [isTileShown, setIsTileShown] = useState(true);
  const [isPopShown, setIsPopShown] = useState(true);
  const [mounts, setMounts] = useState(0);
  const [isSkipping, setIsSkipping] = useState(true);

  return (
    <Section
      title="Entering and exiting"
      note="ready-made animations, a Keyframe of our own and LayoutAnimationConfig"
    >
      <text className="ra-note">{`preset: ${preset.name}`}</text>
      <view className="ra-stage">
        {isTileShown ? (
          <Animated.View
            key={preset.name}
            testID="ra-preset-tile"
            className="ra-tile"
            entering={preset.entering}
            exiting={preset.exiting}
          />
        ) : null}
      </view>
      <view className="ra-wrap">
        <ActionButton
          testID="ra-preset-toggle"
          title={isTileShown ? 'hide' : 'show'}
          onPress={() => setIsTileShown(!isTileShown)}
          color={SHOW_COLOR}
        />
        <ActionButton
          testID="ra-preset-next"
          title="next preset"
          onPress={() => setPreset(nextPreset(preset))}
          color={NEXT_COLOR}
        />
      </view>

      <text className="ra-note">Keyframe</text>
      <view className="ra-stage">
        {isPopShown ? (
          <Animated.View
            testID="ra-pop-tile"
            className="ra-tile"
            entering={POP}
            exiting={FadeOut}
          />
        ) : null}
      </view>
      <ActionButton
        testID="ra-pop-toggle"
        title={isPopShown ? 'hide' : 'show'}
        onPress={() => setIsPopShown(!isPopShown)}
        color={SHOW_COLOR}
      />

      <text className="ra-note">
        {`LayoutAnimationConfig, skip entering: ${isSkipping ? 'on' : 'off'}`}
      </text>
      <LayoutAnimationConfig
        key={mounts}
        skipEntering={isSkipping}
        skipExiting={isSkipping}
      >
        <view className="ra-row">
          {TILE_INDEXES.map(index => (
            <Animated.View
              key={index}
              testID={`ra-config-tile-${index}`}
              className="ra-tile ra-tile-small"
              entering={FadeIn.delay(index * STAGGER_MS)}
            />
          ))}
        </view>
      </LayoutAnimationConfig>
      <view className="ra-wrap">
        <ActionButton
          testID="ra-config-skip"
          title="toggle skip"
          onPress={() => {
            setIsSkipping(!isSkipping);
            setMounts(mounts + 1);
          }}
          color={NEXT_COLOR}
        />
        <ActionButton
          testID="ra-config-remount"
          title="mount again"
          onPress={() => setMounts(mounts + 1)}
          color={SHOW_COLOR}
        />
      </view>
    </Section>
  );
}
