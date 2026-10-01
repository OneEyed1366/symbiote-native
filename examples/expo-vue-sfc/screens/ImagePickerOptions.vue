<script setup lang="ts">
import Card from '../components/Card.vue';
import ChoiceRow from '../components/ChoiceRow.vue';
import Field from '../components/Field.vue';
import ToggleRow from '../components/ToggleRow.vue';
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
import type { IForm, ISetForm } from './image-picker-form';

defineProps<{ form: IForm; setForm: ISetForm; color: string }>();
</script>

<template>
  <Card testID="image-picker-common-card" title="Common options">
    <ChoiceRow
      testID="image-picker-media-types"
      label="mediaTypes"
      :options="MEDIA_TYPE_CHOICES"
      :value="form.mediaTypes"
      :onChange="mediaTypes => setForm({ mediaTypes })"
      :color="color"
    />
    <ToggleRow
      testID="image-picker-editing-switch"
      label="allowsEditing"
      :value="form.allowsEditing"
      :onChange="allowsEditing => setForm({ allowsEditing })"
      :color="color"
    />
    <Field
      testID="image-picker-aspect-input"
      label="aspect (x:y, with allowsEditing)"
      :value="form.aspect"
      :onChange="aspect => setForm({ aspect })"
      placeholder="4:3"
    />
    <ChoiceRow
      testID="image-picker-shape"
      label="shape (Android crop)"
      :options="SHAPE_CHOICES"
      :value="form.shape"
      :onChange="shape => setForm({ shape })"
      :color="color"
    />
    <Field
      testID="image-picker-quality-input"
      label="quality (0 - 1)"
      :value="form.quality"
      :onChange="quality => setForm({ quality })"
    />
    <ToggleRow
      testID="image-picker-exif-switch"
      label="exif"
      :value="form.exif"
      :onChange="exif => setForm({ exif })"
      :color="color"
    />
    <ToggleRow
      testID="image-picker-base64-switch"
      label="base64"
      :value="form.base64"
      :onChange="base64 => setForm({ base64 })"
      :color="color"
    />
  </Card>
  <Card testID="image-picker-selection-card" title="Library selection">
    <ToggleRow
      testID="image-picker-multiple-switch"
      label="allowsMultipleSelection"
      :value="form.allowsMultipleSelection"
      :onChange="allowsMultipleSelection => setForm({ allowsMultipleSelection })"
      :color="color"
    />
    <Field
      testID="image-picker-limit-input"
      label="selectionLimit (0 = unlimited)"
      :value="form.selectionLimit"
      :onChange="selectionLimit => setForm({ selectionLimit })"
    />
    <ToggleRow
      testID="image-picker-ordered-switch"
      label="orderedSelection (iOS 15+)"
      :value="form.orderedSelection"
      :onChange="orderedSelection => setForm({ orderedSelection })"
      :color="color"
    />
    <ChoiceRow
      testID="image-picker-default-tab"
      label="defaultTab (Android)"
      :options="TAB_CHOICES"
      :value="form.defaultTab"
      :onChange="defaultTab => setForm({ defaultTab })"
      :color="color"
    />
    <ToggleRow
      testID="image-picker-network-switch"
      label="shouldDownloadFromNetwork (iOS)"
      :value="form.shouldDownloadFromNetwork"
      :onChange="shouldDownloadFromNetwork => setForm({ shouldDownloadFromNetwork })"
      :color="color"
    />
  </Card>
  <Card testID="image-picker-video-card" title="Video and presentation">
    <ChoiceRow
      testID="image-picker-video-preset"
      label="videoExportPreset (iOS)"
      :options="VIDEO_PRESETS"
      :value="form.videoExportPreset"
      :onChange="videoExportPreset => setForm({ videoExportPreset })"
      :color="color"
    />
    <ChoiceRow
      testID="image-picker-video-quality"
      label="videoQuality (camera)"
      :options="VIDEO_QUALITIES"
      :value="form.videoQuality"
      :onChange="videoQuality => setForm({ videoQuality })"
      :color="color"
    />
    <Field
      testID="image-picker-duration-input"
      label="videoMaxDuration (seconds)"
      :value="form.videoMaxDuration"
      :onChange="videoMaxDuration => setForm({ videoMaxDuration })"
    />
    <ChoiceRow
      testID="image-picker-presentation"
      label="presentationStyle (iOS)"
      :options="PRESENTATION_STYLES"
      :value="form.presentationStyle"
      :onChange="presentationStyle => setForm({ presentationStyle })"
      :color="color"
    />
    <ChoiceRow
      testID="image-picker-representation"
      label="preferredAssetRepresentationMode (iOS)"
      :options="REPRESENTATION_MODES"
      :value="form.preferredAssetRepresentationMode"
      :onChange="
        preferredAssetRepresentationMode => setForm({ preferredAssetRepresentationMode })
      "
      :color="color"
    />
    <ChoiceRow
      testID="image-picker-camera-type"
      label="cameraType"
      :options="CAMERA_CHOICES"
      :value="form.cameraType"
      :onChange="cameraType => setForm({ cameraType })"
      :color="color"
    />
  </Card>
</template>
