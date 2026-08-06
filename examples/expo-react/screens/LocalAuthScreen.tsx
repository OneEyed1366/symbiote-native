import { useCallback, useEffect, useState } from 'react';
import { Platform, SafeAreaView, ScrollView, Text, View } from '@symbiote-native/react';
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
  const label = status === 'checking' ? 'CHECKING…' : status === 'yes' ? 'YES' : 'NO';
  return (
    <View className={`auth-status-badge auth-status-badge-${status}`}>
      <Text className="auth-status-text">{label}</Text>
    </View>
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
    <View testID={testID} className="auth-capability-row">
      <Text className="auth-capability-label">{label}</Text>
      <CapabilityBadge status={status} />
    </View>
  );
}

function ValueRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="auth-capability-row">
      <Text className="auth-capability-label">{label}</Text>
      <Text className="auth-value-text">{value}</Text>
    </View>
  );
}

/**
 * @symbiote-native/local-auth canary demo: a capabilities card (hardware present, enrolled,
 * enrolled security level, supported biometric types) followed by a live authenticateAsync()
 * button. cancelAuthenticate() is Android-only upstream — the Cancel button only renders there.
 */
export function LocalAuthScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.LocalAuth];
  const lineColor = LINE_COLOR[lineInfo.line];

  const [hasHardware, setHasHardware] = useState<ICapabilityStatus>('checking');
  const [isEnrolled, setIsEnrolled] = useState<ICapabilityStatus>('checking');
  const [enrolledLevel, setEnrolledLevel] = useState<SecurityLevel | null>(null);
  const [supportedTypes, setSupportedTypes] = useState<AuthenticationType[] | null>(null);
  const [authResult, setAuthResult] = useState<ILocalAuthenticationResult | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

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
    <SafeAreaView className="screen">
      <ScrollView testID="local-auth-scroll" className="screen" contentContainerStyle="scroll-content">
        <View className={`line-tag line-tag-${lineInfo.line}`}>
          <Text className="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text>
        </View>
        <View className="hero-card">
          <View className="hero-badge" style={{ backgroundColor: lineColor }}>
            <Text className="hero-badge-text">{lineInfo.code}</Text>
          </View>
          <View className="hero-copy">
            <Text className="hero-title">Local auth</Text>
            <Text className="hero-body">
              @symbiote-native/local-auth — FaceID/TouchID on iOS, the Fingerprint/Biometric API on
              Android. A simulator with no enrolled biometrics reports "not enrolled"; a real
              device with FaceID/TouchID/fingerprint set up is needed to see a live prompt.
            </Text>
          </View>
        </View>

        <View testID="local-auth-capabilities-card" className="auth-card">
          <View className="auth-card-header">
            <Text className="auth-card-title">Capabilities</Text>
          </View>
          <CapabilityRow testID="local-auth-hardware" label="Hardware present" status={hasHardware} />
          <CapabilityRow testID="local-auth-enrolled" label="Enrolled" status={isEnrolled} />
          <ValueRow
            label="Enrolled level"
            value={enrolledLevel === null ? 'checking…' : securityLevelLabel(enrolledLevel)}
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
        </View>

        <View testID="local-auth-authenticate-card" className="auth-card">
          <View className="auth-card-header">
            <Text className="auth-card-title">Authenticate</Text>
          </View>
          <Text className="info-text">
            Prompts FaceID/TouchID on iOS, or the Biometric/Fingerprint dialog on Android.
          </Text>
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
            <View
              testID="local-auth-result"
              className={`auth-result auth-result-${authResult.success ? 'success' : 'error'}`}
            >
              <Text className="auth-result-text">
                {authResult.success
                  ? 'Success'
                  : `Failed: ${authResult.error}${authResult.warning ? ` (${authResult.warning})` : ''}`}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
