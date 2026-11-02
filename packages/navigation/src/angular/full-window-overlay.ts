// Angular `FullWindowOverlay`: core picks the props, the template picks the native view by platform
// Content is projected once through a template, as two `ng-content` branches would drop one of them

import {
  ChangeDetectionStrategy,
  Component,
  Input,
  NO_ERRORS_SCHEMA,
  inject,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import {
  Platform,
  SymbioteHostPropsDirective,
  WindowDimensionsService,
} from '@symbiote-native/angular';
import { resolveFullWindowOverlay } from '../core';
import type { IFullWindowOverlayProps } from '../core';

@Component({
  selector: 'FullWindowOverlay',
  standalone: true,
  schemas: [NO_ERRORS_SCHEMA],
  imports: [NgTemplateOutlet, SymbioteHostPropsDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-template #content><ng-content /></ng-template>
    @if (isIOS) {
      <RNSFullWindowOverlay [symbioteHostProps]="overlay().props">
        <ng-container [ngTemplateOutlet]="content" />
      </RNSFullWindowOverlay>
    } @else {
      <view>
        <ng-container [ngTemplateOutlet]="content" />
      </view>
    }
  `,
})
export class FullWindowOverlay implements IFullWindowOverlayProps {
  @Input() unstable_accessibilityContainerViewIsModal?: boolean;

  readonly isIOS = Platform.select({ ios: true, default: false }) === true;
  private readonly dimensions = inject(WindowDimensionsService).dimensions;

  overlay() {
    const { width, height } = this.dimensions();
    return resolveFullWindowOverlay({
      unstable_accessibilityContainerViewIsModal:
        this.unstable_accessibilityContainerViewIsModal,
      isIOS: this.isIOS,
      width,
      height,
    });
  }
}
