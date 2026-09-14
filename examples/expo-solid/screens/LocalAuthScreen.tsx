import { Show, createSignal, onCleanup, type Accessor } from 'solid-js';
import { Platform } from '@symbiote-native/solid';
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
// Object.defineProperty, see packages/local-auth/src/core/types.ts) - TS gives each named member
// declared alongside it its own nominal literal type, so comparing `level` (typed `SecurityLevel`)
// directly against e.g. `SecurityLevel.BIOMETRIC_WEAK` trips "no overlap" (TS2367). Widening to a
// plain `number` first (enum members are always assignable to `number`) sidesteps the nominal
// narrowing entirely - same fix as the widening helper in packages/local-auth's own types.test.ts.
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
  // itself) - only satisfies the function's string return type.
  return 'Biometric';
}

function CapabilityBadge(props: { status: ICapabilityStatus }) {
  const label = () =>
    props.status === 'checking'
      ? 'CHECKING…'
      : props.status === 'yes'
        ? 'YES'
        : 'NO';
  return (
    <view class={`auth-status-badge auth-status-badge-${props.status}`}>
      <text class="auth-status-text">{label()}</text>
    </view>
  );
}

function CapabilityRow(props: {
  testID: string;
  label: string;
  status: ICapabilityStatus;
}) {
  return (
    <view testID={props.testID} class="auth-capability-row">
      <text class="auth-capability-label">{props.label}</text>
      <CapabilityBadge status={props.status} />
    </view>
  );
}

function ValueRow(props: { label: string; value: string }) {
  return (
    <view class="auth-capability-row">
      <text class="auth-capability-label">{props.label}</text>
      <text class="auth-value-text">{props.value}</text>
    </view>
  );
}

/**
 * @symbiote-native/local-auth canary demo: a capabilities card (hardware present, enrolled,
 * enrolled security level, supported biometric types) followed by a live authenticateAsync()
 * button. cancelAuthenticate() is Android-only upstream - the Cancel button only renders there.
 */
export function LocalAuthScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.LocalAuth];
  const lineColor = LINE_COLOR[lineInfo.line];

  const [hasHardware, setHasHardware] =
    createSignal<ICapabilityStatus>('checking');
  const [isEnrolled, setIsEnrolled] =
    createSignal<ICapabilityStatus>('checking');
  const [enrolledLevel, setEnrolledLevel] = createSignal<SecurityLevel | null>(
    null,
  );
  const [supportedTypes, setSupportedTypes] = createSignal<
    AuthenticationType[] | null
  >(null);
  const [authResult, setAuthResult] =
    createSignal<ILocalAuthenticationResult | null>(null);
  const [isAuthenticating, setIsAuthenticating] = createSignal(false);

  let disposed = false;
  onCleanup(() => {
    disposed = true;
  });
  hasHardwareAsync().then(value => {
    if (!disposed) {
      setHasHardware(toCapabilityStatus(value));
    }
  });
  isEnrolledAsync().then(value => {
    if (!disposed) {
      setIsEnrolled(toCapabilityStatus(value));
    }
  });
  getEnrolledLevelAsync().then(value => {
    if (!disposed) {
      setEnrolledLevel(value);
    }
  });
  supportedAuthenticationTypesAsync().then(value => {
    if (!disposed) {
      setSupportedTypes(value);
    }
  });

  const handleAuthenticate = () => {
    setIsAuthenticating(true);
    authenticateAsync({ promptMessage: 'Confirm it is you' }).then(result => {
      setAuthResult(result);
      setIsAuthenticating(false);
    });
  };

  const handleCancel = () => {
    cancelAuthenticate();
  };

  return (
    <safe-area-view class="screen">
      <scroll-view
        testID="local-auth-scroll"
        class="screen"
        contentContainerStyle="scroll-content"
      >
        <view class={`line-tag line-tag-${lineInfo.line}`}>
          <text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</text>
        </view>
        <view class="hero-card">
          <view class="hero-badge" style={{ backgroundColor: lineColor }}>
            <text class="hero-badge-text">{lineInfo.code}</text>
          </view>
          <view class="hero-copy">
            <text class="hero-title">Local auth</text>
            <text class="hero-body">
              @symbiote-native/local-auth — FaceID/TouchID on iOS, the
              Fingerprint/Biometric API on Android. A simulator with no enrolled
              biometrics reports "not enrolled"; a real device with
              FaceID/TouchID/fingerprint set up is needed to see a live prompt.
            </text>
          </view>
        </view>

        <view testID="local-auth-capabilities-card" class="auth-card">
          <view class="auth-card-header">
            <text class="auth-card-title">Capabilities</text>
          </view>
          <CapabilityRow
            testID="local-auth-hardware"
            label="Hardware present"
            status={hasHardware()}
          />
          <CapabilityRow
            testID="local-auth-enrolled"
            label="Enrolled"
            status={isEnrolled()}
          />
          <ValueRow
            label="Enrolled level"
            value={
              enrolledLevel() === null
                ? 'checking…'
                : securityLevelLabel(enrolledLevel()!)
            }
          />
          <ValueRow
            label="Supported types"
            value={
              supportedTypes() === null
                ? 'checking…'
                : supportedTypes()!.length === 0
                  ? 'none'
                  : supportedTypes()!.map(authenticationTypeLabel).join(', ')
            }
          />
        </view>

        <view testID="local-auth-authenticate-card" class="auth-card">
          <view class="auth-card-header">
            <text class="auth-card-title">Authenticate</text>
          </view>
          <text class="info-text">
            Prompts FaceID/TouchID on iOS, or the Biometric/Fingerprint dialog
            on Android.
          </text>
          <ActionButton
            testID="local-auth-authenticate-button"
            title={isAuthenticating() ? 'Authenticating…' : 'Authenticate'}
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
          <Show when={authResult()}>
            {(result: Accessor<ILocalAuthenticationResult>) => (
              <view
                testID="local-auth-result"
                class={`auth-result auth-result-${result().success ? 'success' : 'error'}`}
              >
                <text class="auth-result-text">
                  {(value =>
                    value.success
                      ? 'Success'
                      : `Failed: ${value.error}${value.warning ? ` (${value.warning})` : ''}`)(
                    result(),
                  )}
                </text>
              </view>
            )}
          </Show>
        </view>
      </scroll-view>
    </safe-area-view>
  );
}
