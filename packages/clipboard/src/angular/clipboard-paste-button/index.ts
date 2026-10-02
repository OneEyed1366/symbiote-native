import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { DescriptorOutlet, NativeViewBase } from '@symbiote-native/angular';
import type { IDescriptor } from '@symbiote-native/components';
import { renderClipboardPasteButton } from '../../core/clipboard-paste-button';
import type { IClipboardPasteButtonProps } from '../../core/clipboard-paste-button';

/** Angular twin of `expo-clipboard`'s `ClipboardPasteButton` (`UIPasteControl`), iOS only */
@Component({
  selector: 'ClipboardPasteButton',
  standalone: true,
  imports: [DescriptorOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (descriptor; as node) {
    <symbiote-descriptor-outlet [node]="node" />
  }`,
})
export class ClipboardPasteButton extends NativeViewBase {
  @Input({ required: true }) onPress!: IClipboardPasteButtonProps['onPress'];
  @Input() backgroundColor?: IClipboardPasteButtonProps['backgroundColor'];
  @Input() foregroundColor?: IClipboardPasteButtonProps['foregroundColor'];
  @Input() cornerStyle?: IClipboardPasteButtonProps['cornerStyle'];
  @Input() displayMode?: IClipboardPasteButtonProps['displayMode'];
  @Input() imageOptions?: IClipboardPasteButtonProps['imageOptions'];
  @Input()
  acceptedContentTypes?: IClipboardPasteButtonProps['acceptedContentTypes'];

  protected override readonly propNames = [
    'onPress',
    'backgroundColor',
    'foregroundColor',
    'cornerStyle',
    'displayMode',
    'imageOptions',
    'acceptedContentTypes',
  ] as const satisfies readonly (keyof ClipboardPasteButton)[];

  protected override renderView(props: object): IDescriptor | null {
    return renderClipboardPasteButton(props);
  }
}
