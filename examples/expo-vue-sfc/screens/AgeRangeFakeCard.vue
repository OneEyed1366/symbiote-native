<script setup lang="ts">
import Card from '../components/Card.vue';
import ChoiceRow from '../components/ChoiceRow.vue';
import Field from '../components/Field.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { CHANGES, SIGNAL_STATUSES, SOURCES, choices } from './age-range-fake';
import type { IFakeForm, ISetFake } from './age-range-fake';

defineProps<{ form: IFakeForm; setForm: ISetFake }>();

const color = lineColorOf(ROUTE_NAME.AgeRange);
</script>

<template>
  <Card testID="age-range-fake-card" title="setFakeAgeSignals form (Android testing)">
    <Field
      testID="age-range-fake-lower-input"
      label="lowerBound"
      :value="form.lower"
      :onChange="lower => setForm({ lower })"
    />
    <Field
      testID="age-range-fake-upper-input"
      label="upperBound"
      :value="form.upper"
      :onChange="upper => setForm({ upper })"
    />
    <Field
      testID="age-range-fake-install-input"
      label="installId"
      :value="form.installId"
      :onChange="installId => setForm({ installId })"
    />
    <ChoiceRow
      testID="age-range-fake-source"
      label="ageRangeSource"
      :options="choices(SOURCES)"
      :value="form.source"
      :onChange="source => setForm({ source })"
      :color="color"
    />
    <ChoiceRow
      testID="age-range-fake-change"
      label="significantChangeStatus"
      :options="choices(CHANGES)"
      :value="form.change"
      :onChange="change => setForm({ change })"
      :color="color"
    />
    <Field
      testID="age-range-fake-approval-input"
      label="significantChangeApprovalDate (ms)"
      :value="form.approval"
      :onChange="approval => setForm({ approval })"
    />
    <ChoiceRow
      testID="age-range-fake-status"
      label="ageSignalsStatus"
      :options="choices(SIGNAL_STATUSES)"
      :value="form.signalStatus"
      :onChange="signalStatus => setForm({ signalStatus })"
      :color="color"
    />
    <Field
      testID="age-range-fake-error-input"
      label="errorCode (overrides everything else)"
      :value="form.errorCode"
      :onChange="errorCode => setForm({ errorCode })"
    />
  </Card>
</template>
