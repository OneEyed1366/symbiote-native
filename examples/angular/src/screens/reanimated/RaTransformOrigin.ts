import { Component, computed, signal } from '@angular/core';
import {
  SYMBIOTE_ELEMENTS,
  SymbioteHostPropsDirective,
} from '@symbiote-native/angular';
import {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from '@symbiote-native/reanimated/angular';
import { ActionButton } from '../../components/ActionButton';
import { ACCENT } from './colors';

const TURN_DEGREES = 45;
const TURN_MS = 800;

const ORIGINS = [
  'center',
  'top left',
  'top right',
  'bottom right',
  'bottom left',
  '25% 25%',
  '50px 100%',
] as const;

type IOrigin = (typeof ORIGINS)[number];

const idOf = (origin: IOrigin) => origin.replace(/[^a-z0-9]+/g, '-');

// A worklet closes over locals of its factory, as `this` does not cross to the UI runtime
function createTurn() {
  const progress = useSharedValue(0);
  const origin = useSharedValue<IOrigin>('center');

  const turn = useAnimatedStyle(() => {
    'worklet';
    return {
      transform: [
        {
          rotate: `${interpolate(progress.value, [0, 1], [0, TURN_DEGREES])}deg`,
        },
      ],
      transformOrigin: origin.value,
    };
  });

  const pick = (next: IOrigin) => {
    origin.value = next;
    progress.value = 0;
    progress.value = withTiming(1, {
      duration: TURN_MS,
      easing: Easing.out(Easing.exp),
    });
  };

  return { pick, props: { style: turn } };
}

// The same turn around a different point each time: the origin is part of the animated style
@Component({
  selector: 'RaTransformOrigin',
  standalone: true,
  imports: [ActionButton, SYMBIOTE_ELEMENTS, SymbioteHostPropsDirective],
  template: `
    <view class="ra-section">
      <text class="ra-section-title">Transform origin</text>
      <text class="ra-note"
        >the box turns 45 degrees around the point you pick</text
      >
      <view class="ra-stage">
        <view
          testID="ra-origin-box"
          class="ra-box"
          [symbioteHostProps]="turn.props"
        ></view>
      </view>
      <text class="ra-note">{{ pickedNote() }}</text>
      <view class="ra-wrap">
        @for (next of origins; track next) {
          <ActionButton
            [testID]="'ra-origin-' + idOf(next)"
            [title]="next"
            [color]="accent"
            (press)="pick(next)"
          />
        }
      </view>
    </view>
  `,
})
export class RaTransformOrigin {
  readonly turn = createTurn();
  readonly picked = signal<IOrigin>('center');
  readonly pickedNote = computed(() => `origin: ${this.picked()}`);

  readonly origins = ORIGINS;
  readonly accent = ACCENT;
  readonly idOf = idOf;

  pick(next: IOrigin): void {
    this.turn.pick(next);
    this.picked.set(next);
  }
}
