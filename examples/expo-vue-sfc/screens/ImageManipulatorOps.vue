<script setup lang="ts">
import Card from '../components/Card.vue';
import ChoiceRow from '../components/ChoiceRow.vue';
import Field from '../components/Field.vue';
import ToggleRow from '../components/ToggleRow.vue';
import { FLIP_CHOICES, FORMAT_CHOICES } from './image-manipulator-ops';
import type { IOps, ISetOps } from './image-manipulator-ops';

defineProps<{ ops: IOps; setOps: ISetOps; color: string }>();
</script>

<template>
  <Card testID="image-manipulator-ops-card" title="Actions">
    <Field
      testID="image-manipulator-resize-width-input"
      label="resize.width"
      :value="ops.resizeWidth"
      :onChange="resizeWidth => setOps({ resizeWidth })"
    />
    <Field
      testID="image-manipulator-resize-height-input"
      label="resize.height"
      :value="ops.resizeHeight"
      :onChange="resizeHeight => setOps({ resizeHeight })"
    />
    <Field
      testID="image-manipulator-rotate-input"
      label="rotate (degrees)"
      :value="ops.rotate"
      :onChange="rotate => setOps({ rotate })"
    />
    <ChoiceRow
      testID="image-manipulator-flip"
      label="flip"
      :options="FLIP_CHOICES"
      :value="ops.flip"
      :onChange="flip => setOps({ flip })"
      :color="color"
    />
    <Field
      testID="image-manipulator-crop-x-input"
      label="crop.originX"
      :value="ops.cropX"
      :onChange="cropX => setOps({ cropX })"
    />
    <Field
      testID="image-manipulator-crop-y-input"
      label="crop.originY"
      :value="ops.cropY"
      :onChange="cropY => setOps({ cropY })"
    />
    <Field
      testID="image-manipulator-crop-width-input"
      label="crop.width"
      :value="ops.cropWidth"
      :onChange="cropWidth => setOps({ cropWidth })"
    />
    <Field
      testID="image-manipulator-crop-height-input"
      label="crop.height"
      :value="ops.cropHeight"
      :onChange="cropHeight => setOps({ cropHeight })"
    />
  </Card>
  <Card testID="image-manipulator-save-card" title="Save options">
    <ChoiceRow
      testID="image-manipulator-format"
      label="format"
      :options="FORMAT_CHOICES"
      :value="ops.format"
      :onChange="format => setOps({ format })"
      :color="color"
    />
    <Field
      testID="image-manipulator-compress-input"
      label="compress (0 - 1)"
      :value="ops.compress"
      :onChange="compress => setOps({ compress })"
    />
    <ToggleRow
      testID="image-manipulator-base64-switch"
      label="base64"
      :value="ops.base64"
      :onChange="base64 => setOps({ base64 })"
      :color="color"
    />
  </Card>
</template>
