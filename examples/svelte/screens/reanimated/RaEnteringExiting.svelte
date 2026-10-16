<script lang="ts">
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
  } from '@symbiote-native/reanimated/svelte';
  import ActionButton from '../../components/ActionButton.svelte';
  import { GO_COLOR, NEXT_COLOR } from './colors';
  import RaSection from './RaSection.svelte';

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
  let preset = $state.raw(FADE);
  let isTileShown = $state(true);
  let isPopShown = $state(true);
  let mounts = $state(0);
  let isSkipping = $state(true);

  const toggleSkip = () => {
    isSkipping = !isSkipping;
    mounts += 1;
  };
</script>

<RaSection
  title="Entering and exiting"
  note="ready-made animations, a Keyframe of our own and LayoutAnimationConfig"
>
  <text class="ra-note">{`preset: ${preset.name}`}</text>
  <view class="ra-stage">
    {#if isTileShown}
      {#key preset.name}
        <view
          testID="ra-preset-tile"
          class="ra-tile"
          p={{ entering: preset.entering, exiting: preset.exiting }}
        />
      {/key}
    {/if}
  </view>
  <view class="ra-wrap">
    <ActionButton
      testID="ra-preset-toggle"
      title={isTileShown ? 'hide' : 'show'}
      onPress={() => (isTileShown = !isTileShown)}
      color={GO_COLOR}
    />
    <ActionButton
      testID="ra-preset-next"
      title="next preset"
      onPress={() => (preset = nextPreset(preset))}
      color={NEXT_COLOR}
    />
  </view>

  <text class="ra-note">Keyframe</text>
  <view class="ra-stage">
    {#if isPopShown}
      <view
        testID="ra-pop-tile"
        class="ra-tile"
        p={{ entering: POP, exiting: FadeOut }}
      />
    {/if}
  </view>
  <ActionButton
    testID="ra-pop-toggle"
    title={isPopShown ? 'hide' : 'show'}
    onPress={() => (isPopShown = !isPopShown)}
    color={GO_COLOR}
  />

  <text class="ra-note">
    {`LayoutAnimationConfig, skip entering: ${isSkipping ? 'on' : 'off'}`}
  </text>
  {#key mounts}
    <LayoutAnimationConfig skipEntering={isSkipping} skipExiting={isSkipping}>
      <view class="ra-row">
        {#each TILE_INDEXES as index (index)}
          <view
            testID={`ra-config-tile-${index}`}
            class="ra-tile ra-tile-small"
            p={{ entering: FadeIn.delay(index * STAGGER_MS) }}
          />
        {/each}
      </view>
    </LayoutAnimationConfig>
  {/key}
  <view class="ra-wrap">
    <ActionButton
      testID="ra-config-skip"
      title="toggle skip"
      onPress={toggleSkip}
      color={NEXT_COLOR}
    />
    <ActionButton
      testID="ra-config-remount"
      title="mount again"
      onPress={() => (mounts += 1)}
      color={GO_COLOR}
    />
  </view>
</RaSection>
