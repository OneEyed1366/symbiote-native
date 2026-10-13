import { Component, computed, signal } from '@angular/core';
import {
  SYMBIOTE_ELEMENTS,
  SymbioteHostPropsDirective,
} from '@symbiote-native/angular';
import {
  CurvedTransition,
  EntryExitTransition,
  FadeIn,
  FadeOut,
  FadingTransition,
  JumpingTransition,
  LinearTransition,
  SequencedTransition,
  type ILayoutAnimationBuilder,
} from '@symbiote-native/reanimated/angular';
import { ActionButton } from '../../components/ActionButton';
import { ACCENT, GO_COLOR, NEXT_COLOR, STOP_COLOR } from './colors';

const FIRST_ROWS = 4;

type ITransition = { name: string; layout: ILayoutAnimationBuilder };

const LINEAR: ITransition = { name: 'Linear', layout: LinearTransition };

const TRANSITIONS: readonly ITransition[] = [
  LINEAR,
  { name: 'Fading', layout: FadingTransition },
  { name: 'Sequenced', layout: SequencedTransition },
  { name: 'Jumping', layout: JumpingTransition },
  { name: 'Curved', layout: CurvedTransition },
  {
    name: 'EntryExit',
    layout: EntryExitTransition.entering(FadeIn).exiting(FadeOut),
  },
];

function nextTransition(current: ITransition): ITransition {
  const at = TRANSITIONS.indexOf(current);
  return TRANSITIONS[(at + 1) % TRANSITIONS.length] ?? LINEAR;
}

// Rows that move when the list changes: the layout prop animates the move, entering and exiting
// animate the rows that come and go
@Component({
  selector: 'RaLayoutTransitions',
  standalone: true,
  imports: [ActionButton, SYMBIOTE_ELEMENTS, SymbioteHostPropsDirective],
  template: `
    <view class="ra-section">
      <text class="ra-section-title">Layout transitions</text>
      <text class="ra-note"
        >Linear, Fading, Sequenced, Jumping and Curved, on rows that shuffle,
        join and leave</text
      >
      <text class="ra-note">{{ transitionNote() }}</text>
      <view class="ra-list">
        @for (row of rows(); track row) {
          <view
            [testID]="'ra-row-' + row"
            class="ra-item"
            [symbioteHostProps]="rowProps()"
          >
            <text class="ra-item-text">{{ 'row ' + row }}</text>
          </view>
        }
      </view>
      <view class="ra-wrap">
        <ActionButton
          testID="ra-layout-shuffle"
          title="shuffle"
          [color]="accent"
          (press)="shuffle()"
        />
        <ActionButton
          testID="ra-layout-add"
          title="add"
          [color]="goColor"
          (press)="add()"
        />
        <ActionButton
          testID="ra-layout-remove"
          title="remove"
          [color]="stopColor"
          (press)="remove()"
        />
        <ActionButton
          testID="ra-layout-next"
          title="next transition"
          [color]="nextColor"
          (press)="transition.set(next(transition()))"
        />
      </view>
    </view>
  `,
})
export class RaLayoutTransitions {
  readonly rows = signal(
    Array.from({ length: FIRST_ROWS }, (_, index) => index),
  );
  readonly transition = signal(LINEAR);
  readonly transitionNote = computed(
    () => `transition: ${this.transition().name}`,
  );

  readonly rowProps = computed(() => ({
    layout: this.transition().layout,
    entering: FadeIn,
    exiting: FadeOut,
  }));
  readonly accent = ACCENT;
  readonly goColor = GO_COLOR;
  readonly stopColor = STOP_COLOR;
  readonly nextColor = NEXT_COLOR;
  readonly next = nextTransition;

  private nextRow = FIRST_ROWS;

  add(): void {
    this.rows.set([this.nextRow, ...this.rows()]);
    this.nextRow += 1;
  }

  shuffle(): void {
    this.rows.update(rows => [...rows.slice(1), ...rows.slice(0, 1)]);
  }

  remove(): void {
    this.rows.update(rows => rows.slice(1));
  }
}
