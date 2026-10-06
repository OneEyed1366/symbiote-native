import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { DescriptorOutlet, NativeViewBase } from '@symbiote-native/angular';
import type { IDescriptor } from '@symbiote-native/components';
import { renderAppleAuthenticationButton } from '../../core/apple-authentication-button';
import type { IAppleAuthenticationButtonProps } from '../../core/apple-authentication-button';

/** Angular twin of `expo-apple-authentication`'s `AppleAuthenticationButton`, iOS only */
@Component({
  selector: 'AppleAuthenticationButton',
  standalone: true,
  imports: [DescriptorOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (descriptor; as node) {
    <symbiote-descriptor-outlet [node]="node" />
  }`,
})
export class AppleAuthenticationButton extends NativeViewBase {
  @Input({ required: true })
  onPress!: IAppleAuthenticationButtonProps['onPress'];
  @Input({ required: true })
  buttonType!: IAppleAuthenticationButtonProps['buttonType'];
  @Input({ required: true })
  buttonStyle!: IAppleAuthenticationButtonProps['buttonStyle'];
  @Input() cornerRadius?: IAppleAuthenticationButtonProps['cornerRadius'];

  protected override readonly propNames = [
    'onPress',
    'buttonType',
    'buttonStyle',
    'cornerRadius',
  ] as const satisfies readonly (keyof AppleAuthenticationButton)[];

  protected override renderView(props: object): IDescriptor | null {
    return renderAppleAuthenticationButton(props);
  }
}
