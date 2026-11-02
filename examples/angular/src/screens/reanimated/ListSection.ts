import { Component, signal } from '@angular/core';
import {
  SYMBIOTE_ELEMENTS,
  SymbioteHostPropsDirective,
  VListItemDirective,
} from '@symbiote-native/angular';
import {
  AnimatedFlatList,
  FadeIn,
  LinearTransition,
} from '@symbiote-native/reanimated/angular';
import { ActionButton } from '../../components/ActionButton';
import { GO_COLOR } from './colors';
import { Section } from './Section';

const FIRST_ROWS = 3;
const DIMMED = 0.6;

type IRow = { id: string };

const isRow = (value: unknown): value is IRow =>
  typeof value === 'object' && value !== null && 'id' in value;

// Every other row is dimmed by the cell style, which gets the item and its index
const tintOfRow = ({ index }: { item: unknown; index: number }) => ({
  opacity: index % 2 === 0 ? 1 : DIMMED,
});

// The rows that are there when the list mounts skip their entering animation, a row added later
// plays it
@Component({
  selector: 'ListSection',
  standalone: true,
  imports: [
    ActionButton,
    AnimatedFlatList,
    Section,
    SYMBIOTE_ELEMENTS,
    SymbioteHostPropsDirective,
    VListItemDirective,
  ],
  template: `
    <Section
      title="Animated.FlatList"
      note="first rows appear at once, an added one fades in, the rest slide; odd rows are dimmed"
    >
      <AnimatedFlatList
        testID="ra-flat-list"
        class="ra-list"
        [data]="rows()"
        [keyExtractor]="keyOf"
        [itemLayoutAnimation]="linear"
        [cellRendererComponentStyle]="tint"
        [skipEnteringExitingAnimations]="skipsAtMount"
      >
        <ng-template vListItem let-item>
          <view class="ra-item" [symbioteHostProps]="enteringProps">
            <text class="ra-item-text">{{ 'item ' + idOf(item) }}</text>
          </view>
        </ng-template>
      </AnimatedFlatList>
      <ActionButton
        testID="ra-list-add"
        title="add row"
        [color]="goColor"
        (press)="addRow()"
      />
    </Section>
  `,
})
export class ListSection {
  readonly rows = signal<IRow[]>(
    Array.from({ length: FIRST_ROWS }, (_, index) => ({ id: String(index) })),
  );

  readonly keyOf = (row: IRow): string => row.id;
  readonly idOf = (item: unknown): string => (isRow(item) ? item.id : '?');
  readonly tint = tintOfRow;
  readonly linear = LinearTransition;
  readonly enteringProps = { entering: FadeIn };
  readonly goColor = GO_COLOR;
  readonly skipsAtMount = true;

  addRow(): void {
    this.rows.update(rows => [...rows, { id: String(rows.length) }]);
  }
}
