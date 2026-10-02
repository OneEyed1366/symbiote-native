// Ported verbatim from expo-age-range's ExpoAgeRange.types.ts (sdk-57), renamed with this
// repo's `I`-prefix convention

/** @platform ios */
export type IAgeRangeRequest = {
  /** The required minimum age for your app */
  threshold1: number;
  threshold2?: number;
  threshold3?: number;
};

export type IAgeRangeResponse = {
  lowerBound: number | null;
  upperBound: number | null;
  /** @platform ios */
  ageRangeDeclaration?:
    'selfDeclared' | 'guardianDeclared' | 'confirmed' | null;
  /** @platform ios */
  activeParentalControls?: string[];
  /** @platform android */
  installId?: string | null;
  /** @platform android */
  ageRangeSource?: 'TIER_A' | 'TIER_B' | 'TIER_C' | 'TIER_D' | null;
  /** @platform android */
  significantChangeStatus?: 'APPROVED' | 'PENDING' | 'DECLINED' | null;
  /** @platform android */
  significantChangeApprovalDate?: number | null;
  /** Deprecated, use `significantChangeApprovalDate`. @platform android */
  mostRecentApprovalDate?: number | null;
};

/** @platform android */
export type IAgeSignalsStatus =
  'SHARED' | 'NOT_SHARED' | 'VERIFICATION_REQUIRED';

/** @platform android, omitted fields report as `null` */
export type IFakeAgeSignals =
  | {
      lowerBound?: number | null;
      upperBound?: number | null;
      installId?: string | null;
      ageRangeSource?: 'TIER_A' | 'TIER_B' | 'TIER_C' | 'TIER_D' | null;
      significantChangeStatus?: 'APPROVED' | 'PENDING' | 'DECLINED' | null;
      significantChangeApprovalDate?: number | null;
      ageSignalsStatus?: IAgeSignalsStatus | null;
      errorCode?: never;
    }
  | {
      /** https://developer.android.com/google/play/age-signals/handle-errors */
      errorCode: number;
      lowerBound?: never;
      upperBound?: never;
      installId?: never;
      ageRangeSource?: never;
      significantChangeStatus?: never;
      significantChangeApprovalDate?: never;
      ageSignalsStatus?: never;
    };

/** @platform ios */
export type IAgeRangeRegulatoryFeature =
  | 'declaredAgeRangeRequired'
  | 'significantAppChangeRequiresAdultNotification'
  | 'significantAppChangeRequiresParentalConsent';
