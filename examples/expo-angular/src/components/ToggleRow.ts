import { Component, computed, input, model } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';

@Component({
  selector: 'ToggleRow',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `
    <view class="capability-row">
      <text class="capability-label">{{ label() }}</text>
      <switch
        [testID]="testID()"
        [value]="value()"
        [trackColor]="trackColor()"
        (valueChange)="value.set($event)"
      />
    </view>
  `,
})
export class ToggleRow {
  readonly testID = input.required<string>();
  readonly label = input.required<string>();
  readonly color = input.required<string>();
  readonly value = model.required<boolean>();

  readonly trackColor = computed(() => ({ true: this.color() }));
}
