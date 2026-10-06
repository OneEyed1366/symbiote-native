import { ChangeDetectionStrategy, Component } from '@angular/core';
import { DescriptorOutlet, NativeViewBase } from '@symbiote-native/angular';
import type { IDescriptor } from '@symbiote-native/components';
import { createGLView } from '../../core';
import type { IGLViewProps } from '../../core';

// One list is the inputs of the component and the props it hands to the native view
const GL_VIEW_INPUTS = [
  'onContextCreate',
  'msaaSamples',
  'enableExperimentalWorkletSupport',
] as const;

// Types the inputs for the template, the decorators that would do it are replaced by `inputs`
export interface GLView extends Partial<
  Pick<IGLViewProps, (typeof GL_VIEW_INPUTS)[number]>
> {}

/** Angular twin of `expo-gl`'s `GLView` */
@Component({
  selector: 'GLView',
  standalone: true,
  imports: [DescriptorOutlet],
  inputs: [...GL_VIEW_INPUTS],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (descriptor; as node) {
    <symbiote-descriptor-outlet [node]="node" />
  }`,
})
export class GLView extends NativeViewBase {
  private readonly view = createGLView(() => this.hostNode());

  // The functions of the view are members of the component, a `@ViewChild` reaches them
  readonly createCameraTextureAsync = this.view.handle.createCameraTextureAsync;
  readonly destroyObjectAsync = this.view.handle.destroyObjectAsync;
  readonly takeSnapshotAsync = this.view.handle.takeSnapshotAsync;

  get exglCtxId(): number | undefined {
    return this.view.handle.exglCtxId;
  }

  protected override readonly propNames = GL_VIEW_INPUTS;

  protected override renderView(props: object): IDescriptor | null {
    return this.view.render(props);
  }

  protected override disposeView(): void {
    this.view.dispose();
  }
}
