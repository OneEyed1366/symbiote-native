import { ChangeDetectionStrategy, Component } from '@angular/core';
import { DescriptorOutlet, NativeViewBase } from '@symbiote-native/angular';
import type { IDescriptor } from '@symbiote-native/components';
import { renderVideoAirPlayButton } from '../../core';
import type { IVideoAirPlayButtonProps } from '../../core';

// One list is the inputs of the component and the props it hands to the native view
const AIRPLAY_INPUTS = [
  'tint',
  'activeTint',
  'prioritizeVideoDevices',
  'onBeginPresentingRoutes',
  'onEndPresentingRoutes',
] as const;

// Types the inputs for the template, the decorators that would do it are replaced by `inputs`
export interface VideoAirPlayButton extends Partial<
  Pick<IVideoAirPlayButtonProps, (typeof AIRPLAY_INPUTS)[number]>
> {}

/** Angular twin of `expo-video`'s `VideoAirPlayButton`, a plain view off iOS */
@Component({
  selector: 'VideoAirPlayButton',
  standalone: true,
  imports: [DescriptorOutlet],
  inputs: [...AIRPLAY_INPUTS],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (descriptor; as node) {
    <symbiote-descriptor-outlet [node]="node" />
  }`,
})
export class VideoAirPlayButton extends NativeViewBase {
  protected override readonly propNames = AIRPLAY_INPUTS;

  protected override renderView(props: object): IDescriptor | null {
    return renderVideoAirPlayButton(props);
  }
}
