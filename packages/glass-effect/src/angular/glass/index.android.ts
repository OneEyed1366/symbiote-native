import { ChangeDetectionStrategy, Component } from '@angular/core';
import { DescriptorHost } from '@symbiote-native/angular';
import { GlassContainerBase, GlassViewBase } from './shared';

/** Angular twin of `expo-glass-effect`'s `GlassView`, a plain View off iOS */
@Component({
  selector: 'GlassView',
  standalone: true,
  imports: [DescriptorHost],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (descriptor; as node) {
    <symbiote-descriptor-host [node]="node"
      ><ng-content
    /></symbiote-descriptor-host>
  }`,
})
export class GlassView extends GlassViewBase {}

/** Angular twin of `expo-glass-effect`'s `GlassContainer`, a plain View off iOS */
@Component({
  selector: 'GlassContainer',
  standalone: true,
  imports: [DescriptorHost],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (descriptor; as node) {
    <symbiote-descriptor-host [node]="node"
      ><ng-content
    /></symbiote-descriptor-host>
  }`,
})
export class GlassContainer extends GlassContainerBase {}
