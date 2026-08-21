import { ChangeDetectionStrategy, Component } from '@angular/core';
import { DescriptorOutlet } from '../../descriptor-to-angular';
import { ActivityIndicatorBase } from './shared';
import { SymbioteStyleInputDirective } from '../../primitives';
export type { IActivityIndicatorProps } from './shared';

const IOS_DEFAULT_COLOR = '#999999';

@Component({
  selector: 'ActivityIndicator',
  standalone: true,
  hostDirectives: [
    { directive: SymbioteStyleInputDirective, inputs: ['style'] },
  ],
  imports: [DescriptorOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<symbiote-descriptor-outlet [node]="descriptor" />`,
})
export class ActivityIndicator extends ActivityIndicatorBase {
  protected readonly defaultColor = IOS_DEFAULT_COLOR;
}
