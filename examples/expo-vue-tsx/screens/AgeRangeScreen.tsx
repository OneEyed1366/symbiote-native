import { defineComponent, ref } from 'vue';
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

function ResponseRows(props: { response: IAgeRangeResponse }) {
  const rows: [string, string][] = [
    ['lowerBound', show(props.response.lowerBound)],
    ['upperBound', show(props.response.upperBound)],
    ['ageRangeDeclaration (iOS)', show(props.response.ageRangeDeclaration)],
    ['activeParentalControls (iOS)', show(props.response.activeParentalControls?.join(', '))],
    ['installId (Android)', show(props.response.installId)],
    ['ageRangeSource (Android)', show(props.response.ageRangeSource)],
    ['significantChangeStatus (Android)', show(props.response.significantChangeStatus)],
    ['significantChangeApprovalDate (Android)', show(props.response.significantChangeApprovalDate)],
    ['mostRecentApprovalDate (Android)', show(props.response.mostRecentApprovalDate)],
  ];
  return (
    <>
      {rows.map(([label, value]) => (
        <ResultRow
          key={label}
          testID={`age-range-${label.split(' ')[0]}`}
          label={label}
          value={value}
        />
      ))}
    </>
  );
}

const RequestCard = defineComponent(
  () => {
    const threshold1 = ref('13');
    const threshold2 = ref('16');
    const threshold3 = ref('18');
    const response = ref<IAgeRangeResponse | null>(null);
    const status = ref('idle');

    const request = () => {
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
    };

    return () => (
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
          value={threshold1.value}
          onChange={text => {
            threshold1.value = text;
          }}
        />
        <Field
          testID="age-range-threshold2-input"
          label="threshold2"
          value={threshold2.value}
          onChange={text => {
            threshold2.value = text;
          }}
        />
        <Field
          testID="age-range-threshold3-input"
          label="threshold3"
          value={threshold3.value}
          onChange={text => {
            threshold3.value = text;
          }}
        />
        <ActionButton
          testID="age-range-request-button"
          title="Ask for age range"
          onPress={request}
          color={color}
        />
        <ResultRow testID="age-range-status" label="Status" value={status.value} />
        {response.value !== null && <ResponseRows response={response.value} />}
      </Scenario>
    );
  },
  { name: 'RequestCard' },
);

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

function FakeSignalsCard(props: { form: IFakeForm; setForm: ISetFake }) {
  return (
    <Card testID="age-range-fake-card" title="setFakeAgeSignals form (Android testing)">
      <Field testID="age-range-fake-lower-input" label="lowerBound" value={props.form.lower} onChange={lower => props.setForm({ lower })} />
      <Field testID="age-range-fake-upper-input" label="upperBound" value={props.form.upper} onChange={upper => props.setForm({ upper })} />
      <Field testID="age-range-fake-install-input" label="installId" value={props.form.installId} onChange={installId => props.setForm({ installId })} />
      <ChoiceRow
        testID="age-range-fake-source"
        label="ageRangeSource"
        options={choices(SOURCES)}
        value={props.form.source}
        onChange={source => props.setForm({ source })}
        color={color}
      />
      <ChoiceRow
        testID="age-range-fake-change"
        label="significantChangeStatus"
        options={choices(CHANGES)}
        value={props.form.change}
        onChange={change => props.setForm({ change })}
        color={color}
      />
      <Field
        testID="age-range-fake-approval-input"
        label="significantChangeApprovalDate (ms)"
        value={props.form.approval}
        onChange={approval => props.setForm({ approval })}
      />
      <ChoiceRow
        testID="age-range-fake-status"
        label="ageSignalsStatus"
        options={choices(SIGNAL_STATUSES)}
        value={props.form.signalStatus}
        onChange={signalStatus => props.setForm({ signalStatus })}
        color={color}
      />
      <Field
        testID="age-range-fake-error-input"
        label="errorCode (overrides everything else)"
        value={props.form.errorCode}
        onChange={errorCode => props.setForm({ errorCode })}
      />
    </Card>
  );
}

export const AgeRangeScreen = defineComponent(
  () => {
    const fake = ref<IFakeForm>(INITIAL_FAKE);
    const setFake: ISetFake = patch => {
      fake.value = { ...fake.value, ...patch };
    };
    return () => (
      <ScreenShell
        route={ROUTE}
        testID="age-range-scroll"
        title="Age Range"
        body="Comply with age-assurance rules without collecting birth dates: ask Apple's Declared Age Range (iOS 26+) or Google's Play Age Signals (Android) which age bracket the user belongs to."
      >
        <RequestCard />
        <Explorer testID="age-range-explorer" color={color}>
          <PlatformCalls />
          <FakeSignalsCard form={fake.value} setForm={setFake} />
          <CallConsole
            prefix="age-range-fake"
            title="Fake signals"
            color={color}
            calls={[
              { label: 'setFakeAgeSignals(form)', run: async () => setFakeAgeSignals(buildSignals(fake.value)) },
              { label: 'setFakeAgeSignals(null)', run: async () => setFakeAgeSignals(null) },
            ]}
          />
        </Explorer>
      </ScreenShell>
    );
  },
  { name: 'AgeRangeScreen' },
);
