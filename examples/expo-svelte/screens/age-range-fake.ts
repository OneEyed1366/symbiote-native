import type {
  IAgeRangeResponse,
  IAgeSignalsStatus,
  IFakeAgeSignals,
} from '@symbiote-native/age-range';

export const UNSET = 'unset';

type ISource = NonNullable<IAgeRangeResponse['ageRangeSource']>;
type IChange = NonNullable<IAgeRangeResponse['significantChangeStatus']>;

export const SOURCES: readonly ISource[] = [
  'TIER_A',
  'TIER_B',
  'TIER_C',
  'TIER_D',
];
export const CHANGES: readonly IChange[] = ['APPROVED', 'PENDING', 'DECLINED'];
export const SIGNAL_STATUSES: readonly IAgeSignalsStatus[] = [
  'SHARED',
  'NOT_SHARED',
  'VERIFICATION_REQUIRED',
];

export type IFakeForm = {
  lower: string;
  upper: string;
  installId: string;
  source: string;
  change: string;
  approval: string;
  signalStatus: string;
  errorCode: string;
};
export type ISetFake = (patch: Partial<IFakeForm>) => void;

export const INITIAL_FAKE: IFakeForm = {
  lower: '13',
  upper: '15',
  installId: 'demo-install',
  source: 'TIER_A',
  change: UNSET,
  approval: '',
  signalStatus: 'SHARED',
  errorCode: '',
};

export function optionalNumber(text: string): number | undefined {
  const value = Number(text);
  return text.trim() === '' || Number.isNaN(value) ? undefined : value;
}

export function choices(values: readonly string[]) {
  return [UNSET, ...values].map(value => ({ label: value, value }));
}

export function buildSignals(form: IFakeForm): IFakeAgeSignals {
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
