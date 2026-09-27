import { Component, EventEmitter, Input, Output } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';

// Drop-in for RN's stock <Button>, `press` as a real Angular @Output() (Angular's own idiom, see
// angular-adapter-events) instead of React's onPress prop — a bordered pill tinted by `color`,
// twin of ../../react/components/ActionButton.tsx.
@Component({
  selector: 'ActionButton',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `
    <pressable
      [testID]="testID"
      (press)="press.emit()"
      class="action-button"
      [style]="buttonStyle"
    >
      <text class="action-button-text" [style]="textStyle">{{ title }}</text>
    </pressable>
  `,
})
export class ActionButton {
  @Input({ required: true }) title!: string;
  @Input({ required: true }) color!: string;
  @Input() testID?: string;
  @Output() readonly press = new EventEmitter<void>();

  get buttonStyle(): (state: { pressed: boolean }) => Record<string, unknown> {
    const color = this.color;
    return ({ pressed }) => ({
      borderColor: color,
      opacity: pressed ? 0.6 : 1,
    });
  }

  get textStyle(): Record<string, unknown> {
    return { color: this.color };
  }
}
