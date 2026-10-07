import {
  ChangeDetectionStrategy,
  Component,
  NO_ERRORS_SCHEMA,
} from '@angular/core';
import { SymbioteHostPropsDirective } from '@symbiote-native/angular';
import { warnIfViewNameIsDynamic } from '@symbiote-native/engine';
import { GLASS_EFFECT_MODULE_NAME } from '../../core';
import { GlassContainerBase, GlassViewBase } from './shared';

const VIEW_TAG = 'ViewManagerAdapter_ExpoGlassEffect_GlassView';
const CONTAINER_TAG = 'ViewManagerAdapter_ExpoGlassEffect_GlassContainer';

/** Angular twin of `expo-glass-effect`'s `GlassView`, content goes inside the native view */
@Component({
  selector: 'GlassView',
  standalone: true,
  imports: [SymbioteHostPropsDirective],
  schemas: [NO_ERRORS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Имя тега это нативное имя view, его нельзя собрать динамически
  template: `@if (descriptor; as node) {
    <ViewManagerAdapter_ExpoGlassEffect_GlassView
      [symbioteHostProps]="node.props"
    >
      <ng-content />
    </ViewManagerAdapter_ExpoGlassEffect_GlassView>
  }`,
})
export class GlassView extends GlassViewBase {
  constructor() {
    super();
    warnIfViewNameIsDynamic(VIEW_TAG, GLASS_EFFECT_MODULE_NAME, 'GlassView');
  }
}

/** Angular twin of `expo-glass-effect`'s `GlassContainer`, merges the glass views it holds */
@Component({
  selector: 'GlassContainer',
  standalone: true,
  imports: [SymbioteHostPropsDirective],
  schemas: [NO_ERRORS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (descriptor; as node) {
    <ViewManagerAdapter_ExpoGlassEffect_GlassContainer
      [symbioteHostProps]="node.props"
    >
      <ng-content />
    </ViewManagerAdapter_ExpoGlassEffect_GlassContainer>
  }`,
})
export class GlassContainer extends GlassContainerBase {
  constructor() {
    super();
    warnIfViewNameIsDynamic(
      CONTAINER_TAG,
      GLASS_EFFECT_MODULE_NAME,
      'GlassContainer',
    );
  }
}
