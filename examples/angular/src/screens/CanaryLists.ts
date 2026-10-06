import { Component, signal } from '@angular/core';
import {
  FlatList,
  SYMBIOTE_ELEMENTS,
  VListItemDirective,
  VListSeparatorDirective,
} from '@symbiote-native/angular';
import type { ISymbioteEvent } from '@symbiote-native/angular';
import { ActionButton } from '../components/ActionButton';
import {
  ACCENT,
  CHIP_GAP,
  CHIP_WIDTH,
  chips,
  isChip,
  isMvcpItem,
  makeRows,
  nativeNumber,
} from './canary-shared';
import type { IChip, IMvcpItem } from './canary-shared';

const MVCP_START = 20;
const PREPEND_COUNT = 5;

// Size and gap come from script consts a CSS selector cannot read, the color is per chip
@Component({
  selector: 'CanaryChips',
  standalone: true,
  imports: [FlatList, SYMBIOTE_ELEMENTS, VListItemDirective],
  template: `
    <text class="section-label"> FlatList · 24 chips, windowed </text>
    <FlatList
      testID="angular-chips-list"
      [horizontal]="true"
      [data]="chips"
      [keyExtractor]="keyOf"
      [getItemLayout]="layoutOf"
      class="chip-list"
    >
      <ng-template vListItem let-item>
        <view class="chip-card" [style]="chipStyle(item)">
          <text class="chip-number">{{ chipIndex(item) }}</text>
        </view>
      </ng-template>
    </FlatList>
  `,
})
export class CanaryChips {
  readonly chips = chips;

  readonly keyOf = (item: IChip): string => item.id;
  readonly layoutOf = (_data: unknown, index: number) => ({
    length: CHIP_WIDTH + CHIP_GAP,
    offset: (CHIP_WIDTH + CHIP_GAP) * index,
    index,
  });
  readonly chipIndex = (item: unknown): number | string =>
    isChip(item) ? item.index : '?';
  readonly chipStyle = (item: unknown) => ({
    width: CHIP_WIDTH,
    marginRight: CHIP_GAP,
    backgroundColor: isChip(item) ? item.color : ACCENT,
  });
}

// PASS: press, drag down ~100px and the panel stays highlighted, drag up off the top drops it.
// The style is a function of the press state, which a [class] binding cannot take
@Component({
  selector: 'CanaryRetentionCard',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `
    <pressable
      testID="angular-retention-pressable"
      [hitSlop]="hitSlop"
      [pressRetentionOffset]="retention"
      [onPressMove]="onMove"
      [styleProp]="retentionStyle"
    >
      <text testID="angular-retention-readout" class="info-text">
        drag me · dx {{ move().dx }} · dy {{ move().dy }}
      </text>
    </pressable>
  `,
})
export class CanaryRetentionCard {
  readonly hitSlop = { top: 0, bottom: 40, left: 0, right: 0 };
  readonly retention = { top: 0, bottom: 80, left: 0, right: 0 };
  readonly move = signal({ dx: 0, dy: 0 });

  readonly onMove = (event: ISymbioteEvent): void =>
    this.move.set({
      dx: Math.round(nativeNumber(event, 'locationX')),
      dy: Math.round(nativeNumber(event, 'locationY')),
    });

  readonly retentionStyle = ({ pressed }: { pressed: boolean }) => ({
    height: 64,
    borderRadius: 14,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: pressed ? '#3b0b18' : '#181f33',
  });
}

// PASS: scroll a bit, tap Prepend and the visible rows do not jump
@Component({
  selector: 'CanaryMvcpList',
  standalone: true,
  imports: [
    ActionButton,
    FlatList,
    SYMBIOTE_ELEMENTS,
    VListItemDirective,
    VListSeparatorDirective,
  ],
  template: `
    <text class="section-label">MVCP · prepend without jump</text>
    <FlatList
      testID="angular-mvcp-list"
      [data]="items()"
      [keyExtractor]="keyOf"
      [maintainVisibleContentPosition]="keepVisible"
      [nestedScrollEnabled]="true"
      class="box-list160"
    >
      <ng-template vListItem let-item>
        <view class="mvcp-row">
          <text class="list-row-text">{{ label(item) }}</text>
        </view>
      </ng-template>
      <!-- The divider is list chrome between measured cells: the offset table has to count it -->
      <ng-template vListSeparator>
        <view class="mvcp-divider" />
      </ng-template>
    </FlatList>
    <ActionButton
      testID="angular-mvcp-prepend-btn"
      title="Prepend 5"
      [color]="accent"
      (press)="prepend()"
    />
  `,
})
export class CanaryMvcpList {
  readonly accent = ACCENT;
  readonly keepVisible = { minIndexForVisible: 0 };
  readonly items = signal<IMvcpItem[]>(makeRows(0, MVCP_START));
  private head = 0;

  readonly keyOf = (item: IMvcpItem): string => item.id;
  readonly label = (item: unknown): string =>
    isMvcpItem(item) ? item.label : '';

  prepend(): void {
    this.head -= PREPEND_COUNT;
    this.items.update(previous => [
      ...makeRows(this.head, PREPEND_COUNT),
      ...previous,
    ]);
  }
}
