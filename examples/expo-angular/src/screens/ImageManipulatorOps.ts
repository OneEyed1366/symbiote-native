import { Component, input, model } from '@angular/core';
import { Card } from '../components/Card';
import { ChoiceRow } from '../components/ChoiceRow';
import { Field } from '../components/Field';
import { ToggleRow } from '../components/ToggleRow';
import { FLIP_CHOICES, FORMAT_CHOICES } from './image-manipulator-ops';
import type { IOps } from './image-manipulator-ops';

@Component({
  selector: 'ImageManipulatorOps',
  standalone: true,
  imports: [Card, ChoiceRow, Field, ToggleRow],
  template: `
    <Card testID="image-manipulator-ops-card" title="Actions">
      <Field
        testID="image-manipulator-resize-width-input"
        label="resize.width"
        [value]="ops().resizeWidth"
        (valueChange)="patch({ resizeWidth: $event })"
      />
      <Field
        testID="image-manipulator-resize-height-input"
        label="resize.height"
        [value]="ops().resizeHeight"
        (valueChange)="patch({ resizeHeight: $event })"
      />
      <Field
        testID="image-manipulator-rotate-input"
        label="rotate (degrees)"
        [value]="ops().rotate"
        (valueChange)="patch({ rotate: $event })"
      />
      <ChoiceRow
        testID="image-manipulator-flip"
        label="flip"
        [options]="flipChoices"
        [value]="ops().flip"
        (valueChange)="patch({ flip: $event })"
        [color]="color()"
      />
      <Field
        testID="image-manipulator-crop-x-input"
        label="crop.originX"
        [value]="ops().cropX"
        (valueChange)="patch({ cropX: $event })"
      />
      <Field
        testID="image-manipulator-crop-y-input"
        label="crop.originY"
        [value]="ops().cropY"
        (valueChange)="patch({ cropY: $event })"
      />
      <Field
        testID="image-manipulator-crop-width-input"
        label="crop.width"
        [value]="ops().cropWidth"
        (valueChange)="patch({ cropWidth: $event })"
      />
      <Field
        testID="image-manipulator-crop-height-input"
        label="crop.height"
        [value]="ops().cropHeight"
        (valueChange)="patch({ cropHeight: $event })"
      />
    </Card>
    <Card testID="image-manipulator-save-card" title="Save options">
      <ChoiceRow
        testID="image-manipulator-format"
        label="format"
        [options]="formatChoices"
        [value]="ops().format"
        (valueChange)="patch({ format: $event })"
        [color]="color()"
      />
      <Field
        testID="image-manipulator-compress-input"
        label="compress (0 - 1)"
        [value]="ops().compress"
        (valueChange)="patch({ compress: $event })"
      />
      <ToggleRow
        testID="image-manipulator-base64-switch"
        label="base64"
        [value]="ops().base64"
        (valueChange)="patch({ base64: $event })"
        [color]="color()"
      />
    </Card>
  `,
})
export class ImageManipulatorOps {
  readonly ops = model.required<IOps>();
  readonly color = input.required<string>();

  readonly flipChoices = FLIP_CHOICES;
  readonly formatChoices = FORMAT_CHOICES;

  patch(change: Partial<IOps>): void {
    this.ops.update(current => ({ ...current, ...change }));
  }
}
