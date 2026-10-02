import { Component, computed, input } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import type { IImagePickerAsset } from '@symbiote-native/image-picker/angular';
import { ResultRow } from '../components/ResultRow';
import { ASSET_TYPE_VIDEO } from './image-picker-form';

const PREVIEW_STYLE = { width: '100%', height: 180 };

@Component({
  selector: 'ImagePickerAsset',
  standalone: true,
  imports: [ResultRow, SYMBIOTE_ELEMENTS],
  template: `
    <view [testID]="'image-picker-asset-' + index()">
      @for (row of rows(); track row[0]) {
        <ResultRow
          [testID]="'image-picker-asset-' + index() + '-' + row[0]"
          [label]="row[0]"
          [value]="row[1]"
        />
      }
      @if (asset().type !== videoType) {
        <image
          [testID]="'image-picker-preview-' + index()"
          [source]="{ uri: asset().uri }"
          [style]="previewStyle"
          resizeMode="contain"
        ></image>
      }
    </view>
  `,
})
export class ImagePickerAsset {
  readonly asset = input.required<IImagePickerAsset>();
  readonly index = input.required<number>();

  readonly videoType = ASSET_TYPE_VIDEO;
  readonly previewStyle = PREVIEW_STYLE;

  readonly rows = computed((): [string, string][] => {
    const asset = this.asset();
    return [
      ['type', String(asset.type)],
      ['size', `${asset.width} × ${asset.height}`],
      ['fileName', String(asset.fileName)],
      ['fileSize', String(asset.fileSize)],
      ['duration', String(asset.duration)],
      ['assetId', String(asset.assetId)],
      ['exif', asset.exif ? `${Object.keys(asset.exif).length} keys` : 'none'],
      ['base64', asset.base64 ? `${asset.base64.length} chars` : 'none'],
      ['pairedVideoAsset', asset.pairedVideoAsset?.uri ?? 'none'],
    ];
  });
}
