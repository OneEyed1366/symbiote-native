<script setup lang="ts">
import Card from '../components/Card.vue';
import ChoiceRow from '../components/ChoiceRow.vue';
import Field from '../components/Field.vue';
import ToggleRow from '../components/ToggleRow.vue';
import { ACCURACIES } from './location-options';
import type { IOptionsForm, ISetOptions } from './location-options';

defineProps<{ form: IOptionsForm; setForm: ISetOptions; color: string }>();
</script>

<template>
  <Card testID="location-options-card" title="Position options">
    <ChoiceRow
      testID="location-accuracy"
      label="accuracy"
      :options="ACCURACIES"
      :value="form.accuracy"
      :onChange="accuracy => setForm({ accuracy })"
      :color="color"
    />
    <ToggleRow
      testID="location-dialog-switch"
      label="mayShowUserSettingsDialog (Android)"
      :value="form.mayShowUserSettingsDialog"
      :onChange="mayShowUserSettingsDialog => setForm({ mayShowUserSettingsDialog })"
      :color="color"
    />
    <Field
      testID="location-time-input"
      label="timeInterval (ms, Android)"
      :value="form.timeInterval"
      :onChange="timeInterval => setForm({ timeInterval })"
    />
    <Field
      testID="location-distance-input"
      label="distanceInterval (meters)"
      :value="form.distanceInterval"
      :onChange="distanceInterval => setForm({ distanceInterval })"
    />
    <Field
      testID="location-max-age-input"
      label="maxAge (ms, last known)"
      :value="form.maxAge"
      :onChange="maxAge => setForm({ maxAge })"
    />
    <Field
      testID="location-required-accuracy-input"
      label="requiredAccuracy (meters, last known)"
      :value="form.requiredAccuracy"
      :onChange="requiredAccuracy => setForm({ requiredAccuracy })"
    />
  </Card>
</template>
