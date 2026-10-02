import { Component, computed, input, output } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import type { IPressState } from '@symbiote-native/components';

// Drop-in for RN's stock <Button>: a bare Button renders as unstyled tinted text on iOS, so a
// bordered pill tinted by `color` replaces it
@Component({
  selector: 'ActionButton',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `
    <pressable
      [testID]="testID()"
      (press)="press.emit()"
      class="action-button"
      [styleProp]="buttonStyle()"
    >
      <text class="action-button-text" [style]="textStyle()">{{
        title()
      }}</text>
    </pressable>
  `,
})
export class ActionButton {
  readonly title = input.required<string>();
  readonly color = input.required<string>();
  readonly testID = input<string>();
  readonly press = output<void>();

  // The pressed look is a style FUNCTION of press state; the engine resolves it on the bare tag
  readonly buttonStyle = computed(() => {
    const color = this.color();
    return ({ pressed }: IPressState) => ({
      borderColor: color,
      opacity: pressed ? 0.6 : 1,
    });
  });

  readonly textStyle = computed(() => ({ color: this.color() }));
}
