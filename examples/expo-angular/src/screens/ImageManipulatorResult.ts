import { Component, input } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import type { IImageResult } from '@symbiote-native/image-manipulator/angular';
import { ResultRow } from '../components/ResultRow';

const RESULT_STYLE = { width: '100%', height: 220 };

@Component({
  selector: 'ImageManipulatorResult',
  standalone: true,
  imports: [ResultRow, SYMBIOTE_ELEMENTS],
  template: `
    <ResultRow
      testID="image-manipulator-size"
      label="width × height"
      [value]="result().width + ' × ' + result().height"
    />
    <ResultRow
      testID="image-manipulator-uri"
      label="uri"
      [value]="result().uri"
    />
    <ResultRow
      testID="image-manipulator-base64"
      label="base64"
      [value]="
        result().base64 ? result().base64?.length + ' chars' : 'not requested'
      "
    />
    <image
      testID="image-manipulator-image"
      [source]="{ uri: result().uri }"
      [style]="imageStyle"
      resizeMode="contain"
    ></image>
  `,
})
export class ImageManipulatorResult {
  readonly result = input.required<IImageResult>();
  readonly imageStyle = RESULT_STYLE;
}
