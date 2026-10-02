import { useState } from 'react';
import {
  getRequiredRegulatoryFeaturesAsync,
  isEligibleForAgeFeaturesAsync,
  requestAgeRangeAsync,
  requestAgeSignalsAccessAsync,
  setFakeAgeSignals,
  showSignificantUpdateAcknowledgmentAsync,
} from '@symbiote-native/age-range';
import type {
  IAgeRangeResponse,
  IAgeSignalsStatus,
  IFakeAgeSignals,
} from '@symbiote-native/age-range';
import { ActionButton } from '../components/ActionButton';
import { Explorer, Scenario } from '../components/Scenario';
import { CallConsole } from '../components/CallConsole';
import {
  Card,
  ChoiceRow,
  Field,
  ResultRow,
  ScreenShell,
  lineColorOf,
} from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';

const ROUTE = ROUTE_NAME.AgeRange;
const color = lineColorOf(ROUTE);
const UNSET = 'unset';

type ISource = NonNullable<IAgeRangeResponse['ageRangeSource']>;
type IChange = NonNullable<IAgeRangeResponse['significantChangeStatus']>;

const SOURCES: readonly ISource[] = ['TIER_A', 'TIER_B', 'TIER_C', 'TIER_D'];
const CHANGES: readonly IChange[] = ['APPROVED', 'PENDING', 'DECLINED'];
const SIGNAL_STATUSES: readonly IAgeSignalsStatus[] = [
  'SHARED',
  'NOT_SHARED',
  'VERIFICATION_REQUIRED',
];

function optionalNumber(text: string): number | undefined {
  const value = Number(text);
  return text.trim() === '' || Number.isNaN(value) ? undefined : value;
}

function show(value: unknown): string {
  return String(value ?? 'null');
}

function ResponseRows({ response }: { response: IAgeRangeResponse }) {
  const rows: [string, string][] = [
    ['lowerBound', show(response.lowerBound)],
    ['upperBound', show(response.upperBound)],
    ['ageRangeDeclaration (iOS)', show(response.ageRangeDeclaration)],
    ['activeParentalControls (iOS)', show(response.activeParentalControls?.join(', '))],
    ['installId (Android)', show(response.installId)],
    ['ageRangeSource (Android)', show(response.ageRangeSource)],
    ['significantChangeStatus (Android)', show(response.significantChangeStatus)],
    ['significantChangeApprovalDate (Android)', show(response.significantChangeApprovalDate)],
    ['mostRecentApprovalDate (Android)', show(response.mostRecentApprovalDate)],
  ];
  return (
    <>
      {rows.map(([label, value]) => (
        <ResultRow key={label} testID={`age-range-${label.split(' ')[0]}`} label={label} value={value} />
      ))}
    </>
  );
}

function RequestCard() {
  const [threshold1, setThreshold1] = useState('13');
  const [threshold2, setThreshold2] = useState('16');
  const [threshold3, setThreshold3] = useState('18');
  const [response, setResponse] = useState<IAgeRangeResponse | null>(null);
  const [status, setStatus] = useState('idle');

  const request = () => {
    setStatus('asking…');
    requestAgeRangeAsync({
      threshold1: Number(threshold1),
      threshold2: optionalNumber(threshold2),
      threshold3: optionalNumber(threshold3),
    })
      .then(result => {
        setResponse(result);
        setStatus('done');
      })
      .catch((error: Error) => setStatus(`failed: ${error.message}`));
  };

  return (
    <Scenario
      testID="age-range-request-card"
      title="Check a user's age bracket without asking for a birth date"
      why="Laws on minors require age gates for some content and features. The OS already knows the family-verified age range and shares only the bracket the user approves, never the date of birth."
      steps={['Keep the thresholds 13, 16 and 18', 'Press Ask for age range', 'Approve the system sheet (iOS 26+)']}
      expect="The status says done and the rows show which bracket applies, who declared it and which thresholds it fell between. On Android and older iOS the platform calls in the explorer are the way to test."
    >
      <Field
        testID="age-range-threshold1-input"
        label="threshold1 (required)"
        value={threshold1}
        onChange={setThreshold1}
      />
      <Field
        testID="age-range-threshold2-input"
        label="threshold2"
        value={threshold2}
        onChange={setThreshold2}
      />
      <Field
        testID="age-range-threshold3-input"
        label="threshold3"
        value={threshold3}
        onChange={setThreshold3}
      />
      <ActionButton
        testID="age-range-request-button"
        title="Ask for age range"
        onPress={request}
        color={color}
      />
      <ResultRow testID="age-range-status" label="Status" value={status} />
      {response !== null && <ResponseRows response={response} />}
    </Scenario>
  );
}

function PlatformCalls() {
  return (
    <CallConsole
      prefix="age-range-platform"
      title="Eligibility and platform calls"
      color={color}
      hint="Apple's API needs iOS 26+, Google's Age Signals is Android only. Calls outside their platform are no-ops."
      calls={[
        { label: 'isEligibleForAgeFeaturesAsync', run: () => isEligibleForAgeFeaturesAsync() },
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
      ]}
    />
  );
}

function choices(values: readonly string[]) {
  return [UNSET, ...values].map(value => ({ label: value, value }));
}

type IFakeForm = {
  lower: string;
  upper: string;
  installId: string;
  source: string;
  change: string;
  approval: string;
  signalStatus: string;
  errorCode: string;
};
type ISetFake = (patch: Partial<IFakeForm>) => void;

const INITIAL_FAKE: IFakeForm = {
  lower: '13',
  upper: '15',
  installId: 'demo-install',
  source: 'TIER_A',
  change: UNSET,
  approval: '',
  signalStatus: 'SHARED',
  errorCode: '',
};

function buildSignals(form: IFakeForm): IFakeAgeSignals {
  const code = optionalNumber(form.errorCode);
  if (code !== undefined) {
    return { errorCode: code };
  }
  return {
    lowerBound: optionalNumber(form.lower),
    upperBound: optionalNumber(form.upper),
    installId: form.installId === '' ? undefined : form.installId,
    ageRangeSource: SOURCES.find(item => item === form.source),
    significantChangeStatus: CHANGES.find(item => item === form.change),
    significantChangeApprovalDate: optionalNumber(form.approval),
    ageSignalsStatus: SIGNAL_STATUSES.find(item => item === form.signalStatus),
  };
}

function FakeSignalsCard({ form, setForm }: { form: IFakeForm; setForm: ISetFake }) {
  return (
    <Card testID="age-range-fake-card" title="setFakeAgeSignals form (Android testing)">
      <Field testID="age-range-fake-lower-input" label="lowerBound" value={form.lower} onChange={lower => setForm({ lower })} />
      <Field testID="age-range-fake-upper-input" label="upperBound" value={form.upper} onChange={upper => setForm({ upper })} />
      <Field testID="age-range-fake-install-input" label="installId" value={form.installId} onChange={installId => setForm({ installId })} />
      <ChoiceRow
        testID="age-range-fake-source"
        label="ageRangeSource"
        options={choices(SOURCES)}
        value={form.source}
        onChange={source => setForm({ source })}
        color={color}
      />
      <ChoiceRow
        testID="age-range-fake-change"
        label="significantChangeStatus"
        options={choices(CHANGES)}
        value={form.change}
        onChange={change => setForm({ change })}
        color={color}
      />
      <Field
        testID="age-range-fake-approval-input"
        label="significantChangeApprovalDate (ms)"
        value={form.approval}
        onChange={approval => setForm({ approval })}
      />
      <ChoiceRow
        testID="age-range-fake-status"
        label="ageSignalsStatus"
        options={choices(SIGNAL_STATUSES)}
        value={form.signalStatus}
        onChange={signalStatus => setForm({ signalStatus })}
        color={color}
      />
      <Field
        testID="age-range-fake-error-input"
        label="errorCode (overrides everything else)"
        value={form.errorCode}
        onChange={errorCode => setForm({ errorCode })}
      />
    </Card>
  );
}

export function AgeRangeScreen() {
  const [fake, setFakeState] = useState<IFakeForm>(INITIAL_FAKE);
  const setFake: ISetFake = patch =>
    setFakeState(previous => ({ ...previous, ...patch }));
  return (
    <ScreenShell
      route={ROUTE}
      testID="age-range-scroll"
      title="Age Range"
      body="Comply with age-assurance rules without collecting birth dates: ask Apple's Declared Age Range (iOS 26+) or Google's Play Age Signals (Android) which age bracket the user belongs to."
    >
      <RequestCard />
      <Explorer testID="age-range-explorer" color={color}>
        <PlatformCalls />
        <FakeSignalsCard form={fake} setForm={setFake} />
        <CallConsole
          prefix="age-range-fake"
          title="Fake signals"
          color={color}
          calls={[
            { label: 'setFakeAgeSignals(form)', run: async () => setFakeAgeSignals(buildSignals(fake)) },
            { label: 'setFakeAgeSignals(null)', run: async () => setFakeAgeSignals(null) },
          ]}
        />
      </Explorer>
    </ScreenShell>
  );
}
