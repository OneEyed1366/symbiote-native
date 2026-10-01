<script setup lang="ts">
import { computed, ref } from 'vue';
import { requestAgeRangeAsync } from '@symbiote-native/age-range';
import type { IAgeRangeResponse } from '@symbiote-native/age-range';
import ActionButton from '../components/ActionButton.vue';
import Field from '../components/Field.vue';
import ResultRow from '../components/ResultRow.vue';
import Scenario from '../components/Scenario.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { optionalNumber } from './age-range-fake';

const color = lineColorOf(ROUTE_NAME.AgeRange);

const threshold1 = ref('13');
const threshold2 = ref('16');
const threshold3 = ref('18');
const response = ref<IAgeRangeResponse | null>(null);
const status = ref('idle');

function show(value: unknown): string {
  return String(value ?? 'null');
}

const rows = computed((): [string, string][] => {
  const current = response.value;
  if (current === null) {
    return [];
  }
  return [
    ['lowerBound', show(current.lowerBound)],
    ['upperBound', show(current.upperBound)],
    ['ageRangeDeclaration (iOS)', show(current.ageRangeDeclaration)],
    ['activeParentalControls (iOS)', show(current.activeParentalControls?.join(', '))],
    ['installId (Android)', show(current.installId)],
    ['ageRangeSource (Android)', show(current.ageRangeSource)],
    ['significantChangeStatus (Android)', show(current.significantChangeStatus)],
    ['significantChangeApprovalDate (Android)', show(current.significantChangeApprovalDate)],
    ['mostRecentApprovalDate (Android)', show(current.mostRecentApprovalDate)],
  ];
});

function request(): void {
  status.value = 'asking…';
  requestAgeRangeAsync({
    threshold1: Number(threshold1.value),
    threshold2: optionalNumber(threshold2.value),
    threshold3: optionalNumber(threshold3.value),
  })
    .then(result => {
      response.value = result;
      status.value = 'done';
    })
    .catch((error: Error) => {
      status.value = `failed: ${error.message}`;
    });
}
</script>

<template>
  <Scenario
    testID="age-range-request-card"
    title="Check a user's age bracket without asking for a birth date"
    why="Laws on minors require age gates for some content and features. The OS already knows the family-verified age range and shares only the bracket the user approves, never the date of birth."
    :steps="[
      'Keep the thresholds 13, 16 and 18',
      'Press Ask for age range',
      'Approve the system sheet (iOS 26+)',
    ]"
    expect="The status says done and the rows show which bracket applies, who declared it and which thresholds it fell between. On Android and older iOS the platform calls in the explorer are the way to test."
  >
    <Field
      testID="age-range-threshold1-input"
      label="threshold1 (required)"
      :value="threshold1"
      :onChange="next => (threshold1 = next)"
    />
    <Field
      testID="age-range-threshold2-input"
      label="threshold2"
      :value="threshold2"
      :onChange="next => (threshold2 = next)"
    />
    <Field
      testID="age-range-threshold3-input"
      label="threshold3"
      :value="threshold3"
      :onChange="next => (threshold3 = next)"
    />
    <ActionButton
      testID="age-range-request-button"
      title="Ask for age range"
      :onPress="request"
      :color="color"
    />
    <ResultRow testID="age-range-status" label="Status" :value="status" />
    <ResultRow
      v-for="[label, value] in rows"
      :key="label"
      :testID="`age-range-${label.split(' ')[0]}`"
      :label="label"
      :value="value"
    />
  </Scenario>
</template>
