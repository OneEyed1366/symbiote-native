import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import type { IDescriptor } from '@symbiote-native/components';
import { SymbioteHostPropsDirective, ViewHost } from '../primitives';
import { DescriptorOutlet } from './index';

// Angular cannot project content into a node a Renderer2 loop built, so the root is a template
// `<view>` that takes the descriptor's props, and only the native leaf goes through the outlet
@Component({
  selector: 'symbiote-descriptor-host',
  standalone: true,
  imports: [DescriptorOutlet, SymbioteHostPropsDirective, ViewHost],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<view [symbioteHostProps]="node.props">
    @if (leafOf(node); as leaf) {
      <symbiote-descriptor-outlet [node]="leaf" />
    }
    <ng-content />
  </view>`,
})
export class DescriptorHost {
  @Input({ required: true }) node!: IDescriptor;

  // A native wrapper descriptor carries one own child at most, its absolute-fill native leaf
  leafOf(descriptor: IDescriptor): IDescriptor | undefined {
    return descriptor.children.find(child => typeof child !== 'string');
  }
}
