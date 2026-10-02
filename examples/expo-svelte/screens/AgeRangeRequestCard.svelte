<script lang="ts">
  import { requestAgeRangeAsync } from '@symbiote-native/age-range';
  import type { IAgeRangeResponse } from '@symbiote-native/age-range';
  import ActionButton from '../components/ActionButton.svelte';
  import Field from '../components/Field.svelte';
  import ResultRow from '../components/ResultRow.svelte';
  import Scenario from '../components/Scenario.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';
  import { optionalNumber } from './age-range-fake';

  const color = lineColorOf(ROUTE_NAME.AgeRange);

  let threshold1 = $state('13');
  let threshold2 = $state('16');
  let threshold3 = $state('18');
  let response = $state<IAgeRangeResponse | null>(null);
  let status = $state('idle');

  function show(value: unknown): string {
    return String(value ?? 'null');
  }

  const rows = $derived.by((): [string, string][] => {
    if (response === null) {
      return [];
    }
    return [
      ['lowerBound', show(response.lowerBound)],
      ['upperBound', show(response.upperBound)],
      ['ageRangeDeclaration (iOS)', show(response.ageRangeDeclaration)],
      [
        'activeParentalControls (iOS)',
        show(response.activeParentalControls?.join(', ')),
      ],
      ['installId (Android)', show(response.installId)],
      ['ageRangeSource (Android)', show(response.ageRangeSource)],
      [
        'significantChangeStatus (Android)',
        show(response.significantChangeStatus),
      ],
      [
        'significantChangeApprovalDate (Android)',
        show(response.significantChangeApprovalDate),
      ],
      ['mostRecentApprovalDate (Android)', show(response.mostRecentApprovalDate)],
    ];
  });

  function request(): void {
    status = 'asking…';
    requestAgeRangeAsync({
      threshold1: Number(threshold1),
      threshold2: optionalNumber(threshold2),
      threshold3: optionalNumber(threshold3),
    })
      .then(result => {
        response = result;
        status = 'done';
      })
      .catch((error: Error) => {
        status = `failed: ${error.message}`;
      });
  }
</script>

<Scenario
  testID="age-range-request-card"
  title="Check a user's age bracket without asking for a birth date"
  why="Laws on minors require age gates for some content and features. The OS already knows the family-verified age range and shares only the bracket the user approves, never the date of birth."
  steps={[
    'Keep the thresholds 13, 16 and 18',
    'Press Ask for age range',
    'Approve the system sheet (iOS 26+)',
  ]}
  expect="The status says done and the rows show which bracket applies, who declared it and which thresholds it fell between. On Android and older iOS the platform calls in the explorer are the way to test."
>
  <Field
    testID="age-range-threshold1-input"
    label="threshold1 (required)"
    value={threshold1}
    onChange={next => {
      threshold1 = next;
    }}
  />
  <Field
    testID="age-range-threshold2-input"
    label="threshold2"
    value={threshold2}
    onChange={next => {
      threshold2 = next;
    }}
  />
  <Field
    testID="age-range-threshold3-input"
    label="threshold3"
    value={threshold3}
    onChange={next => {
      threshold3 = next;
    }}
  />
  <ActionButton
    testID="age-range-request-button"
    title="Ask for age range"
    onPress={request}
    {color}
  />
  <ResultRow testID="age-range-status" label="Status" value={status} />
  {#each rows as [label, value] (label)}
    <ResultRow
      testID={`age-range-${label.split(' ')[0]}`}
      {label}
      {value}
    />
  {/each}
</Scenario>
