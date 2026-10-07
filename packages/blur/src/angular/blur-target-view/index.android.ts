import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  NO_ERRORS_SCHEMA,
  ViewChild,
} from '@angular/core';
import { warnIfViewNameIsDynamic } from '@symbiote-native/engine';
import { SymbioteHostPropsDirective } from '@symbiote-native/angular';
import { BLUR_MODULE_NAME } from '../../core';
import { BlurTargetViewBase } from './shared';

const TEMPLATE_TAG = 'ViewManagerAdapter_ExpoBlur_ExpoBlurTargetView';

/** Angular twin of `expo-blur`'s `BlurTargetView`, the native target view on Android */
@Component({
  selector: 'BlurTargetView',
  standalone: true,
  imports: [SymbioteHostPropsDirective],
  schemas: [NO_ERRORS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Имя тега это нативное имя view, его нельзя собрать динамически
  template: `<ViewManagerAdapter_ExpoBlur_ExpoBlurTargetView
    #host
    [symbioteHostProps]="hostProps"
  >
    <ng-content />
  </ViewManagerAdapter_ExpoBlur_ExpoBlurTargetView>`,
})
export class BlurTargetView extends BlurTargetViewBase {
  @ViewChild('host', { read: ElementRef, static: true })
  private readonly hostRef!: ElementRef<unknown>;

  constructor() {
    super();
    warnIfViewNameIsDynamic(
      TEMPLATE_TAG,
      BLUR_MODULE_NAME,
      'ExpoBlurTargetView',
    );
  }

  get nativeElement(): unknown {
    return this.hostRef.nativeElement;
  }
}
