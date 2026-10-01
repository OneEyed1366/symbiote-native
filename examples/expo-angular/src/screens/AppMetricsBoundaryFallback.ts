import { Component, computed, input, output } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { ActionButton } from '../components/ActionButton';

@Component({
  selector: 'AppMetricsBoundaryFallback',
  standalone: true,
  imports: [ActionButton, SYMBIOTE_ELEMENTS],
  template: `
    <view>
      <text testID="app-metrics-boundary-message" class="info-text">{{
        message()
      }}</text>
      <ActionButton
        testID="app-metrics-reset-button"
        title="resetError"
        [color]="color()"
        (press)="resetError.emit()"
      />
    </view>
  `,
})
export class AppMetricsBoundaryFallback {
  readonly error = input.required<unknown>();
  readonly color = input.required<string>();
  readonly resetError = output<void>();

  readonly message = computed(() => {
    const error = this.error();
    return `caught: ${error instanceof Error ? error.message : String(error)}`;
  });
}
