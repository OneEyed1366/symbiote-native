export {
  getRequiredRegulatoryFeaturesAsync,
  isEligibleForAgeFeaturesAsync,
  requestAgeRangeAsync,
  requestAgeSignalsAccessAsync,
  setFakeAgeSignals,
  showSignificantUpdateAcknowledgmentAsync,
} from './age-range';
export type {
  IAgeRangeRegulatoryFeature,
  IAgeRangeRequest,
  IAgeRangeResponse,
  IAgeSignalsStatus,
  IFakeAgeSignals,
} from './types';
