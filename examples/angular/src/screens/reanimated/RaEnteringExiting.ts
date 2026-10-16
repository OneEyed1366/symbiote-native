import { Component, computed, signal } from '@angular/core';
import {
  SYMBIOTE_ELEMENTS,
  SymbioteHostPropsDirective,
} from '@symbiote-native/angular';
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
} from '@symbiote-native/reanimated/angular';
import { ActionButton } from '../../components/ActionButton';
import { GO_COLOR, NEXT_COLOR } from './colors';

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
  props: { entering: FadeIn.delay(index * STAGGER_MS) },
}));

// One bag per preset, so the tile takes both animations through the host props directive
function bagOf({ entering, exiting }: IPreset) {
  return { entering, exiting };
}

function nextPreset(current: IPreset): IPreset {
  const at = PRESETS.indexOf(current);
  return PRESETS[(at + 1) % PRESETS.length] ?? FADE;
}

// The ready-made animations one after another, a keyframe of our own, and a config that skips
// the entering animation of what mounts with it
@Component({
  selector: 'RaEnteringExiting',
  standalone: true,
  imports: [
    ActionButton,
    LayoutAnimationConfig,
    SYMBIOTE_ELEMENTS,
    SymbioteHostPropsDirective,
  ],
  template: `
    <view class="ra-section">
      <text class="ra-section-title">Entering and exiting</text>
      <text class="ra-note"
        >ready-made animations, a Keyframe of our own and
        LayoutAnimationConfig</text
      >
      <text class="ra-note">preset: {{ preset().name }}</text>
      <view class="ra-stage">
        @for (bag of tileKeys(); track bag) {
          <view
            testID="ra-preset-tile"
            class="ra-tile"
            [symbioteHostProps]="bag"
          ></view>
        }
      </view>
      <view class="ra-wrap">
        <ActionButton
          testID="ra-preset-toggle"
          [title]="isTileShown() ? 'hide' : 'show'"
          [color]="goColor"
          (press)="isTileShown.set(!isTileShown())"
        />
        <ActionButton
          testID="ra-preset-next"
          title="next preset"
          [color]="nextColor"
          (press)="preset.set(next(preset()))"
        />
      </view>

      <text class="ra-note">Keyframe</text>
      <view class="ra-stage">
        @if (isPopShown()) {
          <view
            testID="ra-pop-tile"
            class="ra-tile"
            [symbioteHostProps]="popProps"
          ></view>
        }
      </view>
      <ActionButton
        testID="ra-pop-toggle"
        [title]="isPopShown() ? 'hide' : 'show'"
        [color]="goColor"
        (press)="isPopShown.set(!isPopShown())"
      />

      <text class="ra-note">{{ configNote() }}</text>
      @for (mount of mountKeys(); track mount) {
        <LayoutAnimationConfig
          [skipEntering]="isSkipping()"
          [skipExiting]="isSkipping()"
        >
          <view class="ra-row">
            @for (tile of tiles; track tile.index) {
              <view
                [testID]="'ra-config-tile-' + tile.index"
                class="ra-tile ra-tile-small"
                [symbioteHostProps]="tile.props"
              ></view>
            }
          </view>
        </LayoutAnimationConfig>
      }
      <view class="ra-wrap">
        <ActionButton
          testID="ra-config-skip"
          title="toggle skip"
          [color]="nextColor"
          (press)="toggleSkip()"
        />
        <ActionButton
          testID="ra-config-remount"
          title="mount again"
          [color]="goColor"
          (press)="mounts.set(mounts() + 1)"
        />
      </view>
    </view>
  `,
})
export class RaEnteringExiting {
  readonly preset = signal(FADE);
  readonly isTileShown = signal(true);
  readonly isPopShown = signal(true);
  readonly mounts = signal(0);
  readonly isSkipping = signal(true);
  // A new item makes the loop draw its view again, which is how a key remounts
  readonly tileBag = computed(() => bagOf(this.preset()));
  readonly tileKeys = computed(() =>
    this.isTileShown() ? [this.tileBag()] : [],
  );
  readonly mountKeys = computed(() => [this.mounts()]);
  readonly configNote = computed(
    () =>
      `LayoutAnimationConfig, skip entering: ${this.isSkipping() ? 'on' : 'off'}`,
  );

  readonly tiles = TILES;
  readonly popProps = { entering: POP, exiting: FadeOut };
  readonly goColor = GO_COLOR;
  readonly nextColor = NEXT_COLOR;
  readonly next = nextPreset;

  toggleSkip(): void {
    this.isSkipping.set(!this.isSkipping());
    this.mounts.set(this.mounts() + 1);
  }
}
