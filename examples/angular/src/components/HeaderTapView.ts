import { Component, input, output } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';

// A small tappable pill for the custom views of a native header
@Component({
  selector: 'HeaderTapView',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `
    <pressable [testID]="testID()" (press)="press.emit()" class="header-view">
      <text class="header-view-text">{{ label() }}</text>
    </pressable>
  `,
})
export class HeaderTapView {
  readonly testID = input.required<string>();
  readonly label = input.required<string>();
  readonly press = output<void>();
}
