<script setup lang="ts">
import { ref } from 'vue';
import {
  getRequiredRegulatoryFeaturesAsync,
  isEligibleForAgeFeaturesAsync,
  requestAgeSignalsAccessAsync,
  setFakeAgeSignals,
  showSignificantUpdateAcknowledgmentAsync,
} from '@symbiote-native/age-range';
import CallConsole from '../components/CallConsole.vue';
import Explorer from '../components/Explorer.vue';
import ScreenShell from '../components/ScreenShell.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import AgeRangeFakeCard from './AgeRangeFakeCard.vue';
import AgeRangeRequestCard from './AgeRangeRequestCard.vue';
import { INITIAL_FAKE, buildSignals } from './age-range-fake';
import type { IFakeForm, ISetFake } from './age-range-fake';

const ROUTE = ROUTE_NAME.AgeRange;
const color = lineColorOf(ROUTE);

const fake = ref<IFakeForm>(INITIAL_FAKE);
const setFake: ISetFake = patch => {
  fake.value = { ...fake.value, ...patch };
};

const platformCalls = [
  {
    label: 'isEligibleForAgeFeaturesAsync',
    run: () => isEligibleForAgeFeaturesAsync(),
  },
  {
    label: 'getRequiredRegulatoryFeaturesAsync (iOS)',
    run: () => getRequiredRegulatoryFeaturesAsync(),
  },
  {
    label: 'showSignificantUpdateAcknowledgmentAsync (iOS)',
    run: () => showSignificantUpdateAcknowledgmentAsync('Symbiote canary test update'),
  },
  {
    label: 'requestAgeSignalsAccessAsync (Android)',
    run: () => requestAgeSignalsAccessAsync(),
  },
];

const fakeCalls = [
  {
    label: 'setFakeAgeSignals(form)',
    run: async () => setFakeAgeSignals(buildSignals(fake.value)),
  },
  {
    label: 'setFakeAgeSignals(null)',
    run: async () => setFakeAgeSignals(null),
  },
];
</script>

<template>
  <ScreenShell
    :route="ROUTE"
    testID="age-range-scroll"
    title="Age Range"
    body="Comply with age-assurance rules without collecting birth dates: ask Apple's Declared Age Range (iOS 26+) or Google's Play Age Signals (Android) which age bracket the user belongs to."
  >
    <AgeRangeRequestCard />
    <Explorer testID="age-range-explorer" :color="color">
      <CallConsole
        prefix="age-range-platform"
        title="Eligibility and platform calls"
        :color="color"
        hint="Apple's API needs iOS 26+, Google's Age Signals is Android only. Calls outside their platform are no-ops."
        :calls="platformCalls"
      />
      <AgeRangeFakeCard :form="fake" :setForm="setFake" />
      <CallConsole prefix="age-range-fake" title="Fake signals" :color="color" :calls="fakeCalls" />
    </Explorer>
  </ScreenShell>
</template>
