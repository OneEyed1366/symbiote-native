import { Component, input, output } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { ActionButton } from '../components/ActionButton';
import { ACCENT } from './canary-shared';

// List chrome between measured cells, the offset table has to count it
@Component({
  selector: 'MvcpDivider',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `<view class="mvcp-divider"></view>`,
})
export class MvcpDivider {}

@Component({
  selector: 'FlexButton',
  standalone: true,
  imports: [ActionButton, SYMBIOTE_ELEMENTS],
  template: `
    <view class="flex1">
      <ActionButton
        [testID]="testID()"
        [title]="title()"
        [color]="accent"
        (press)="press.emit()"
      />
    </view>
  `,
})
export class FlexButton {
  readonly title = input.required<string>();
  readonly testID = input<string>();
  readonly press = output<void>();
  readonly accent = ACCENT;
}
