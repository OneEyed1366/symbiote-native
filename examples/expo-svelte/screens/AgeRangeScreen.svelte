<script lang="ts">
  import {
    getRequiredRegulatoryFeaturesAsync,
    isEligibleForAgeFeaturesAsync,
    requestAgeSignalsAccessAsync,
    setFakeAgeSignals,
    showSignificantUpdateAcknowledgmentAsync,
  } from '@symbiote-native/age-range';
  import CallConsole from '../components/CallConsole.svelte';
  import Explorer from '../components/Explorer.svelte';
  import ScreenShell from '../components/ScreenShell.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';
  import AgeRangeFakeCard from './AgeRangeFakeCard.svelte';
  import AgeRangeRequestCard from './AgeRangeRequestCard.svelte';
  import { INITIAL_FAKE, buildSignals } from './age-range-fake';
  import type { IFakeForm, ISetFake } from './age-range-fake';

  const ROUTE = ROUTE_NAME.AgeRange;
  const color = lineColorOf(ROUTE);

  let fake = $state<IFakeForm>(INITIAL_FAKE);
  const setFake: ISetFake = patch => {
    fake = { ...fake, ...patch };
  };
</script>

<ScreenShell
  route={ROUTE}
  testID="age-range-scroll"
  title="Age Range"
  body="Comply with age-assurance rules without collecting birth dates: ask Apple's Declared Age Range (iOS 26+) or Google's Play Age Signals (Android) which age bracket the user belongs to."
>
  <AgeRangeRequestCard />
  <Explorer testID="age-range-explorer" {color}>
    <CallConsole
      prefix="age-range-platform"
      title="Eligibility and platform calls"
      {color}
      hint="Apple's API needs iOS 26+, Google's Age Signals is Android only. Calls outside their platform are no-ops."
      calls={[
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
          run: () =>
            showSignificantUpdateAcknowledgmentAsync(
              'Symbiote canary test update',
            ),
        },
        {
          label: 'requestAgeSignalsAccessAsync (Android)',
          run: () => requestAgeSignalsAccessAsync(),
        },
      ]}
    />
    <AgeRangeFakeCard form={fake} setForm={setFake} />
    <CallConsole
      prefix="age-range-fake"
      title="Fake signals"
      {color}
      calls={[
        {
          label: 'setFakeAgeSignals(form)',
          run: async () => setFakeAgeSignals(buildSignals(fake)),
        },
        {
          label: 'setFakeAgeSignals(null)',
          run: async () => setFakeAgeSignals(null),
        },
      ]}
    />
  </Explorer>
</ScreenShell>
