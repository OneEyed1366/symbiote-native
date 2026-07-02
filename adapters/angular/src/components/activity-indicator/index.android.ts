import { ChangeDetectionStrategy, Component } from '@angular/core';
import { DescriptorOutlet } from '../../descriptor-to-angular';
import { ActivityIndicatorBase } from './shared';
export type { IActivityIndicatorProps } from './shared';

@Component({
  selector: 'ActivityIndicator',
  standalone: true,
  imports: [DescriptorOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<symbiote-descriptor-outlet [node]="descriptor" />`,
})
export class ActivityIndicator extends ActivityIndicatorBase {
  protected readonly defaultColor = null;
  protected override readonly nativeExtras = { styleAttr: 'Normal', indeterminate: true };
}
