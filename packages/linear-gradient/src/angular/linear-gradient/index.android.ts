import { ChangeDetectionStrategy, Component } from '@angular/core';
import { DescriptorHost } from '@symbiote-native/angular';
import { LinearGradientBase } from './shared';

/** Angular twin of `expo-linear-gradient`'s `LinearGradient`, a View wraps the gradient leaf */
@Component({
  selector: 'LinearGradient',
  standalone: true,
  imports: [DescriptorHost],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (descriptor; as node) {
    <symbiote-descriptor-host [node]="node"
      ><ng-content
    /></symbiote-descriptor-host>
  }`,
})
export class LinearGradient extends LinearGradientBase {}
