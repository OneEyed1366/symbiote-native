import { Component, output } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { ACCENT } from './canary-shared';

// The style is a function of the press state, which a [class] binding cannot take
@Component({
  selector: 'CanaryPressable',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `
    <pressable
      testID="angular-pressable"
      (press)="tap.emit()"
      [styleProp]="pressableStyle"
      accessibilityLabel="Angular pressable counter"
    >
      <text class="pressable-label">press me (also +1)</text>
    </pressable>
  `,
})
export class CanaryPressable {
  readonly tap = output();

  readonly pressableStyle = ({ pressed }: { pressed: boolean }) => ({
    alignSelf: 'flex-start' as const,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: pressed ? '#3b0b18' : '#181f33',
    borderColor: pressed ? '#ff6b8a' : ACCENT,
  });
}
