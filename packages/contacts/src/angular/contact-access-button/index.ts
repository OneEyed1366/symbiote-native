import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { DescriptorOutlet, NativeViewBase } from '@symbiote-native/angular';
import type { IDescriptor } from '@symbiote-native/components';
import {
  isContactAccessButtonAvailable,
  renderContactAccessButton,
} from '../../core/contact-access-button';
import type { IContactAccessButtonProps } from '../../core/contact-access-button';

/** Angular twin of `expo-contacts`' `ContactAccessButton`, iOS 18+ only, nothing elsewhere */
@Component({
  selector: 'ContactAccessButton',
  standalone: true,
  imports: [DescriptorOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (descriptor; as node) {
    <symbiote-descriptor-outlet [node]="node" />
  }`,
})
export class ContactAccessButton extends NativeViewBase {
  /** True only on iOS 18.0 and newer */
  static readonly isAvailable = isContactAccessButtonAvailable;

  @Input() query?: string;
  @Input() caption?: IContactAccessButtonProps['caption'];
  @Input() ignoredEmails?: string[];
  @Input() ignoredPhoneNumbers?: string[];
  @Input() tintColor?: IContactAccessButtonProps['tintColor'];
  @Input() backgroundColor?: IContactAccessButtonProps['backgroundColor'];
  @Input() textColor?: IContactAccessButtonProps['textColor'];

  protected override readonly propNames = [
    'query',
    'caption',
    'ignoredEmails',
    'ignoredPhoneNumbers',
    'tintColor',
    'backgroundColor',
    'textColor',
  ] as const satisfies readonly (keyof ContactAccessButton)[];

  protected override renderView(props: object): IDescriptor | null {
    return renderContactAccessButton(props);
  }
}
