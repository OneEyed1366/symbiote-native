import { Component, OnInit, input } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { injectImageManipulator } from '@symbiote-native/image-manipulator/angular';
import type { IImageManipulatorContext } from '@symbiote-native/image-manipulator/angular';
import { ActionButton } from '../components/ActionButton';
import { bindAfterInputs } from './bind-after-inputs';

@Component({
  selector: 'ImageManipulatorHookRunner',
  standalone: true,
  imports: [ActionButton, SYMBIOTE_ELEMENTS],
  template: `
    <view class="button-row">
      <ActionButton
        testID="image-manipulator-hook-button"
        title="useImageManipulator context"
        [color]="color()"
        (press)="runWithContext()"
      />
      <ActionButton
        testID="image-manipulator-reset-button"
        title="context.reset()"
        [color]="color()"
        (press)="context.value()?.reset()"
      />
    </view>
  `,
})
export class ImageManipulatorHookRunner implements OnInit {
  readonly source = input.required<string>();
  readonly color = input.required<string>();
  readonly run = input.required<(context: IImageManipulatorContext) => void>();

  readonly context = bindAfterInputs<IImageManipulatorContext>();

  ngOnInit(): void {
    this.context.connect(() => injectImageManipulator(() => this.source()));
  }

  runWithContext(): void {
    const context = this.context.value();
    if (context !== null) {
      this.run()(context);
    }
  }
}
