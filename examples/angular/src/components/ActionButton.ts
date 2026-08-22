import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Pressable, Text } from '@symbiote-native/angular';

// Drop-in replacement for RN's stock <Button> (same title/color/testID surface, `press` as a real
// Angular @Output() instead of React's onPress prop — Angular's own idiom, see
// angular-adapter-events). A bare Button renders as unstyled tinted text on iOS, indistinguishable
// from a body Text line, so this gives every screen one consistent bordered pill instead, tinted
// per caller — preserving each screen's own color-coding (e.g. AnimatedDemo's JS-vs-native
// pairing) while making the chrome consistent. Twin of ../../react/components/ActionButton.tsx.
@Component({
  selector: 'ActionButton',
  standalone: true,
  imports: [Pressable, Text],
  template: `
    <Pressable
      [testID]="testID"
      (press)="press.emit()"
      class="action-button"
      [style]="buttonStyle"
    >
      <Text class="action-button-text" [style]="textStyle">{{ title }}</Text>
    </Pressable>
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
