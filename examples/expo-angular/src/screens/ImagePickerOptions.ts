import { Component, input, model } from '@angular/core';
import { Card } from '../components/Card';
import { ChoiceRow } from '../components/ChoiceRow';
import { Field } from '../components/Field';
import { ToggleRow } from '../components/ToggleRow';
import {
  CAMERA_CHOICES,
  MEDIA_TYPE_CHOICES,
  PRESENTATION_STYLES,
  REPRESENTATION_MODES,
  SHAPE_CHOICES,
  TAB_CHOICES,
  VIDEO_PRESETS,
  VIDEO_QUALITIES,
} from './image-picker-form';
import type { IForm } from './image-picker-form';

@Component({
  selector: 'ImagePickerOptions',
  standalone: true,
  imports: [Card, ChoiceRow, Field, ToggleRow],
  template: `
    <Card testID="image-picker-common-card" title="Common options">
      <ChoiceRow
        testID="image-picker-media-types"
        label="mediaTypes"
        [options]="mediaTypeChoices"
        [value]="form().mediaTypes"
        (valueChange)="patch({ mediaTypes: $event })"
        [color]="color()"
      />
      <ToggleRow
        testID="image-picker-editing-switch"
        label="allowsEditing"
        [value]="form().allowsEditing"
        (valueChange)="patch({ allowsEditing: $event })"
        [color]="color()"
      />
      <Field
        testID="image-picker-aspect-input"
        label="aspect (x:y, with allowsEditing)"
        [value]="form().aspect"
        (valueChange)="patch({ aspect: $event })"
        placeholder="4:3"
      />
      <ChoiceRow
        testID="image-picker-shape"
        label="shape (Android crop)"
        [options]="shapeChoices"
        [value]="form().shape"
        (valueChange)="patch({ shape: $event })"
        [color]="color()"
      />
      <Field
        testID="image-picker-quality-input"
        label="quality (0 - 1)"
        [value]="form().quality"
        (valueChange)="patch({ quality: $event })"
      />
      <ToggleRow
        testID="image-picker-exif-switch"
        label="exif"
        [value]="form().exif"
        (valueChange)="patch({ exif: $event })"
        [color]="color()"
      />
      <ToggleRow
        testID="image-picker-base64-switch"
        label="base64"
        [value]="form().base64"
        (valueChange)="patch({ base64: $event })"
        [color]="color()"
      />
    </Card>
    <Card testID="image-picker-selection-card" title="Library selection">
      <ToggleRow
        testID="image-picker-multiple-switch"
        label="allowsMultipleSelection"
        [value]="form().allowsMultipleSelection"
        (valueChange)="patch({ allowsMultipleSelection: $event })"
        [color]="color()"
      />
      <Field
        testID="image-picker-limit-input"
        label="selectionLimit (0 = unlimited)"
        [value]="form().selectionLimit"
        (valueChange)="patch({ selectionLimit: $event })"
      />
      <ToggleRow
        testID="image-picker-ordered-switch"
        label="orderedSelection (iOS 15+)"
        [value]="form().orderedSelection"
        (valueChange)="patch({ orderedSelection: $event })"
        [color]="color()"
      />
      <ChoiceRow
        testID="image-picker-default-tab"
        label="defaultTab (Android)"
        [options]="tabChoices"
        [value]="form().defaultTab"
        (valueChange)="patch({ defaultTab: $event })"
        [color]="color()"
      />
      <ToggleRow
        testID="image-picker-network-switch"
        label="shouldDownloadFromNetwork (iOS)"
        [value]="form().shouldDownloadFromNetwork"
        (valueChange)="patch({ shouldDownloadFromNetwork: $event })"
        [color]="color()"
      />
    </Card>
    <Card testID="image-picker-video-card" title="Video and presentation">
      <ChoiceRow
        testID="image-picker-video-preset"
        label="videoExportPreset (iOS)"
        [options]="videoPresets"
        [value]="form().videoExportPreset"
        (valueChange)="patch({ videoExportPreset: $event })"
        [color]="color()"
      />
      <ChoiceRow
        testID="image-picker-video-quality"
        label="videoQuality (camera)"
        [options]="videoQualities"
        [value]="form().videoQuality"
        (valueChange)="patch({ videoQuality: $event })"
        [color]="color()"
      />
      <Field
        testID="image-picker-duration-input"
        label="videoMaxDuration (seconds)"
        [value]="form().videoMaxDuration"
        (valueChange)="patch({ videoMaxDuration: $event })"
      />
      <ChoiceRow
        testID="image-picker-presentation"
        label="presentationStyle (iOS)"
        [options]="presentationStyles"
        [value]="form().presentationStyle"
        (valueChange)="patch({ presentationStyle: $event })"
        [color]="color()"
      />
      <ChoiceRow
        testID="image-picker-representation"
        label="preferredAssetRepresentationMode (iOS)"
        [options]="representationModes"
        [value]="form().preferredAssetRepresentationMode"
        (valueChange)="patch({ preferredAssetRepresentationMode: $event })"
        [color]="color()"
      />
      <ChoiceRow
        testID="image-picker-camera-type"
        label="cameraType"
        [options]="cameraChoices"
        [value]="form().cameraType"
        (valueChange)="patch({ cameraType: $event })"
        [color]="color()"
      />
    </Card>
  `,
})
export class ImagePickerOptions {
  readonly form = model.required<IForm>();
  readonly color = input.required<string>();

  readonly mediaTypeChoices = MEDIA_TYPE_CHOICES;
  readonly shapeChoices = SHAPE_CHOICES;
  readonly tabChoices = TAB_CHOICES;
  readonly videoPresets = VIDEO_PRESETS;
  readonly videoQualities = VIDEO_QUALITIES;
  readonly presentationStyles = PRESENTATION_STYLES;
  readonly representationModes = REPRESENTATION_MODES;
  readonly cameraChoices = CAMERA_CHOICES;

  patch(change: Partial<IForm>): void {
    this.form.update(current => ({ ...current, ...change }));
  }
}
