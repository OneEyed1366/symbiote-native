import { Component, input, output } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import type { INavLine } from '../navigation-lines';

@Component({
  selector: 'MenuRow',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `
    <pressable
      [testID]="testID()"
      [class]="'menu-row menu-row-' + line()"
      (press)="press.emit()"
    >
      <view [class]="'menu-badge menu-badge-' + line()">
        <text class="menu-badge-text">{{ code() }}</text>
      </view>
      <view class="menu-row-copy">
        <text class="menu-row-label">{{ label() }}</text>
        <text [class]="'menu-row-hint menu-row-hint-' + line()">{{
          hint()
        }}</text>
      </view>
    </pressable>
  `,
})
export class MenuRow {
  readonly testID = input.required<string>();
  readonly line = input.required<INavLine>();
  readonly code = input.required<string>();
  readonly label = input.required<string>();
  readonly hint = input.required<string>();
  readonly press = output<void>();
}
