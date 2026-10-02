import { useCallback, useEffect, useState } from 'react';
import { Platform } from '@symbiote-native/react';
import {
  AuthenticationType,
  SecurityLevel,
  authenticateAsync,
  cancelAuthenticate,
  getEnrolledLevelAsync,
  hasHardwareAsync,
  isEnrolledAsync,
  supportedAuthenticationTypesAsync,
} from '@symbiote-native/local-auth';
import type { ILocalAuthenticationResult } from '@symbiote-native/local-auth';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { Scenario } from '../components/Scenario';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

type ICapabilityStatus = 'checking' | 'yes' | 'no';

function toCapabilityStatus(value: boolean): ICapabilityStatus {
  return value ? 'yes' : 'no';
}

function authenticationTypeLabel(type: AuthenticationType): string {
  switch (type) {
    case AuthenticationType.FINGERPRINT:
      return 'Fingerprint';
    case AuthenticationType.FACIAL_RECOGNITION:
      return 'Facial recognition';
    case AuthenticationType.IRIS:
      return 'Iris';
    default:
      return 'Unknown';
  }
}

// SecurityLevel.BIOMETRIC is a computed enum member (a deprecated getter alias defined via
// Object.defineProperty, see packages/local-auth/src/core/types.ts) — TS gives each named member
// declared alongside it its own nominal literal type, so comparing `level` (typed `SecurityLevel`)
// directly against e.g. `SecurityLevel.BIOMETRIC_WEAK` trips "no overlap" (TS2367). Widening to a
// plain `number` first (enum members are always assignable to `number`) sidesteps the nominal
// narrowing entirely — same fix as the widening helper in packages/local-auth's own types.test.ts.
function securityLevelLabel(level: SecurityLevel): string {
  const numericLevel: number = level;
  if (numericLevel === SecurityLevel.NONE) {
    return 'None';
  }
  if (numericLevel === SecurityLevel.SECRET) {
    return 'Secret (PIN / pattern / password)';
  }
  if (numericLevel === SecurityLevel.BIOMETRIC_WEAK) {
    return 'Biometric — weak';
  }
  if (numericLevel === SecurityLevel.BIOMETRIC_STRONG) {
    return 'Biometric — strong';
  }
  // Unreachable via getEnrolledLevelAsync() (never returns the deprecated BIOMETRIC alias
  // itself) — only satisfies the function's string return type.
  return 'Biometric';
}

function CapabilityBadge({ status }: { status: ICapabilityStatus }) {
  const label =
    status === 'checking' ? 'CHECKING…' : status === 'yes' ? 'YES' : 'NO';
  return (
    <view className={`auth-status-badge auth-status-badge-${status}`}>
      <text className="auth-status-text">{label}</text>
    </view>
  );
}

function CapabilityRow({
  testID,
  label,
  status,
}: {
  testID: string;
  label: string;
  status: ICapabilityStatus;
}) {
  return (
    <view testID={testID} className="auth-capability-row">
      <text className="auth-capability-label">{label}</text>
      <CapabilityBadge status={status} />
    </view>
  );
}

function ValueRow({ label, value }: { label: string; value: string }) {
  return (
    <view className="auth-capability-row">
      <text className="auth-capability-label">{label}</text>
      <text className="auth-value-text">{value}</text>
    </view>
  );
}

function useLocalAuthCapabilities() {
  const [hasHardware, setHasHardware] = useState<ICapabilityStatus>('checking');
  const [isEnrolled, setIsEnrolled] = useState<ICapabilityStatus>('checking');
  const [enrolledLevel, setEnrolledLevel] = useState<SecurityLevel | null>(
    null,
  );
  const [supportedTypes, setSupportedTypes] = useState<
    AuthenticationType[] | null
  >(null);

  useEffect(() => {
    let isMounted = true;
    hasHardwareAsync().then(value => {
      if (isMounted) {
        setHasHardware(toCapabilityStatus(value));
      }
    });
    isEnrolledAsync().then(value => {
      if (isMounted) {
        setIsEnrolled(toCapabilityStatus(value));
      }
    });
    getEnrolledLevelAsync().then(value => {
      if (isMounted) {
        setEnrolledLevel(value);
      }
    });
    supportedAuthenticationTypesAsync().then(value => {
      if (isMounted) {
        setSupportedTypes(value);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  return { hasHardware, isEnrolled, enrolledLevel, supportedTypes };
}

export function LocalAuthScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.LocalAuth];
  const lineColor = LINE_COLOR[lineInfo.line];

  const { hasHardware, isEnrolled, enrolledLevel, supportedTypes } =
    useLocalAuthCapabilities();
  const [authResult, setAuthResult] =
    useState<ILocalAuthenticationResult | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const handleAuthenticate = useCallback(() => {
    setIsAuthenticating(true);
    authenticateAsync({ promptMessage: 'Confirm it is you' }).then(result => {
      setAuthResult(result);
      setIsAuthenticating(false);
    });
  }, []);

  const handleCancel = useCallback(() => {
    cancelAuthenticate();
  }, []);

  return (
    <safe-area-view className="screen">
      <scroll-view
        testID="local-auth-scroll"
        className="screen"
        contentContainerStyle="scroll-content"
      >
        <view className={`line-tag line-tag-${lineInfo.line}`}>
          <text className="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</text>
        </view>
        <view className="hero-card">
          <view className="hero-badge" style={{ backgroundColor: lineColor }}>
            <text className="hero-badge-text">{lineInfo.code}</text>
          </view>
          <view className="hero-copy">
            <text className="hero-title">Local auth</text>
            <text className="hero-body">
              Confirm it is really the user with Face ID, Touch ID or a
              fingerprint before a sensitive action. A simulator without
              enrolled biometrics reports not enrolled, use a real device with
              biometrics set up to see the prompt.
            </text>
          </view>
        </view>

        <Scenario
          testID="local-auth-scenario"
          title="Re-confirm the user before showing a balance or sending money"
          why="Even on an unlocked phone, ask for a biometric check before opening a private section or approving a payment. The app only learns whether it succeeded, never the fingerprint or face."
          steps={['Check that hardware is present and biometrics are enrolled', 'Press authenticate and approve with your face or finger', 'Press it again and cancel']}
          expect="Success shows a positive result. Cancelling shows the reason, such as user cancel, and the hardware and enrolled rows tell you why a prompt cannot appear."
        />
        <view testID="local-auth-capabilities-card" className="auth-card">
          <view className="auth-card-header">
            <text className="auth-card-title">Capabilities</text>
          </view>
          <CapabilityRow
            testID="local-auth-hardware"
            label="Hardware present"
            status={hasHardware}
          />
          <CapabilityRow
            testID="local-auth-enrolled"
            label="Enrolled"
            status={isEnrolled}
          />
          <ValueRow
            label="Enrolled level"
            value={
              enrolledLevel === null
                ? 'checking…'
                : securityLevelLabel(enrolledLevel)
            }
          />
          <ValueRow
            label="Supported types"
            value={
              supportedTypes === null
                ? 'checking…'
                : supportedTypes.length === 0
                  ? 'none'
                  : supportedTypes.map(authenticationTypeLabel).join(', ')
            }
          />
        </view>

        <view testID="local-auth-authenticate-card" className="auth-card">
          <view className="auth-card-header">
            <text className="auth-card-title">Authenticate</text>
          </view>
          <text className="info-text">
            Prompts FaceID/TouchID on iOS, or the Biometric/Fingerprint dialog
            on Android.
          </text>
          <ActionButton
            testID="local-auth-authenticate-button"
            title={isAuthenticating ? 'Authenticating…' : 'Authenticate'}
            onPress={handleAuthenticate}
            color={lineColor}
          />
          {Platform.OS === 'android' && (
            <ActionButton
              testID="local-auth-cancel-button"
              title="Cancel"
              onPress={handleCancel}
              color={lineColor}
            />
          )}
          {authResult && (
            <view
              testID="local-auth-result"
              className={`auth-result auth-result-${authResult.success ? 'success' : 'error'}`}
            >
              <text className="auth-result-text">
                {authResult.success
                  ? 'Success'
                  : `Failed: ${authResult.error}${authResult.warning ? ` (${authResult.warning})` : ''}`}
              </text>
            </view>
          )}
        </view>
      </scroll-view>
    </safe-area-view>
  );
}
