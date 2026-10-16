import { Component } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import * as Reanimated from '@symbiote-native/reanimated/angular';

type IName = keyof typeof Reanimated;

const ANIMATIONS = [
  'withTiming',
  'withSpring',
  'withDecay',
  'withRepeat',
  'withSequence',
  'withDelay',
  'withClamp',
  'cancelAnimation',
  'defineAnimation',
] as const satisfies readonly IName[];

const VALUES = [
  'Easing',
  'interpolate',
  'interpolateColor',
  'Extrapolation',
  'clamp',
  'convertToRGBA',
  'isColor',
  'processColor',
  'makeMutable',
  'isSharedValue',
] as const satisfies readonly IName[];

const HOOKS = [
  'useSharedValue',
  'useDerivedValue',
  'useAnimatedStyle',
  'useAnimatedProps',
  'useAnimatedReaction',
  'useAnimatedRef',
  'useAnimatedScrollHandler',
  'useScrollOffset',
  'useEvent',
  'useHandler',
  'useComposedEventHandler',
  'useFrameCallback',
  'useAnimatedSensor',
  'useAnimatedKeyboard',
  'useReducedMotion',
  'useTimestamp',
] as const satisfies readonly IName[];

const COMPONENTS = [
  'createAnimatedComponent',
  'createCSSAnimatedComponent',
  'LayoutAnimationConfig',
  'ReducedMotionConfig',
  'PerformanceMonitor',
  'SharedTransitionBoundary',
] as const satisfies readonly IName[];

const LAYOUT = [
  'FadeIn',
  'SlideInRight',
  'ZoomIn',
  'BounceIn',
  'FlipInXUp',
  'RotateInDownLeft',
  'LightSpeedInRight',
  'PinwheelIn',
  'RollInLeft',
  'StretchInX',
  'Keyframe',
  'LinearTransition',
  'FadingTransition',
  'SequencedTransition',
  'JumpingTransition',
  'CurvedTransition',
  'EntryExitTransition',
  'SharedTransition',
] as const satisfies readonly IName[];

const PLATFORM = [
  'measure',
  'scrollTo',
  'dispatchCommand',
  'setNativeProps',
  'getRelativeCoords',
  'getViewProp',
  'startMapper',
  'stopMapper',
  'runOnUI',
  'runOnJS',
  'runOnRuntime',
  'createWorkletRuntime',
  'executeOnUIRuntimeSync',
  'makeShareableCloneRecursive',
  'isWorkletFunction',
  'ScreenTransition',
] as const satisfies readonly IName[];

const CSS = [
  'css',
  'cubicBezier',
  'linear',
  'steps',
] as const satisfies readonly IName[];

const GROUPS: ReadonlyArray<readonly [string, readonly IName[]]> = [
  ['Animations', ANIMATIONS],
  ['Values and colours', VALUES],
  ['Hooks', HOOKS],
  ['Components', COMPONENTS],
  ['Layout animations', LAYOUT],
  ['Platform and worklets', PLATFORM],
  ['CSS', CSS],
];

const isExported = (name: IName) => name in Reanimated;

const all = GROUPS.flatMap(([, names]) => names);
const present = all.filter(isExported).length;

// A checklist that reads the real exports of the package, so a name that goes missing turns red
@Component({
  selector: 'RaParity',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `
    <view class="ra-section">
      <text class="ra-section-title">Parity with Reanimated 4.7.1</text>
      <text class="ra-note">{{ summary }}</text>
      @for (group of groups; track group.title) {
        <view class="ra-group">
          <text class="ra-group-title">{{ group.label }}</text>
          <view class="ra-chips">
            @for (chip of group.chips; track chip.name) {
              <text [class]="chip.chipClass">{{ chip.name }}</text>
            }
          </view>
        </view>
      }
    </view>
  `,
})
export class RaParity {
  readonly summary = `${present} of ${all.length} sampled exports are there; the whole list is tested against upstream`;
  readonly groups = GROUPS.map(([title, names]) => ({
    title,
    label: `${title}: ${names.filter(isExported).length}/${names.length}`,
    chips: names.map(name => ({
      name,
      chipClass: isExported(name)
        ? 'ra-chip ra-chip-ok'
        : 'ra-chip ra-chip-missing',
    })),
  }));
}
