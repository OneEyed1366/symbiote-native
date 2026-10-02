import { computed, defineComponent, onMounted, onUnmounted, ref } from 'vue';
import type { Ref } from 'vue';
import { Platform } from '@symbiote-native/vue';
import {
  AuthenticationType,
  SecurityLevel,
  authenticateAsync,
  cancelAuthenticate,
  getEnrolledLevelAsync,
  hasHardwareAsync,
  isEnrolledAsync,
  supportedAuthenticationTypesAsync,
} from '@symbiote-native/local-auth/vue';
import type { ILocalAuthenticationResult } from '@symbiote-native/local-auth/vue';
import { ActionButton } from '../components/ActionButton';
import { Scenario } from '../components/Scenario';
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

// `SecurityLevel.BIOMETRIC` is a computed enum member, so comparing `level` to the named
// members trips TS2367, widening to `number` first sidesteps the nominal narrowing
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
  // `getEnrolledLevelAsync` never returns the deprecated alias, this only satisfies the type
  return 'Biometric';
}

function CapabilityBadge(props: { status: ICapabilityStatus }) {
  const label =
    props.status === 'checking'
      ? 'CHECKING…'
      : props.status === 'yes'
        ? 'YES'
        : 'NO';
  return (
    <view class={`auth-status-badge auth-status-badge-${props.status}`}>
      <text class="auth-status-text">{label}</text>
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

// Kept apart so the screen body stays readable: the four one-shot capability lookups
function useLocalAuthCapabilities() {
  const hasHardware = ref<ICapabilityStatus>('checking');
  const isEnrolled = ref<ICapabilityStatus>('checking');
  const enrolledLevel: Ref<SecurityLevel | null> = ref(null);
  const supportedTypes: Ref<AuthenticationType[] | null> = ref(null);
  let isMounted = true;
  onUnmounted(() => {
    isMounted = false;
  });
  onMounted(() => {
    hasHardwareAsync().then(value => {
      if (isMounted) hasHardware.value = toCapabilityStatus(value);
    });
    isEnrolledAsync().then(value => {
      if (isMounted) isEnrolled.value = toCapabilityStatus(value);
    });
    getEnrolledLevelAsync().then(value => {
      if (isMounted) enrolledLevel.value = value;
    });
    supportedAuthenticationTypesAsync().then(value => {
      if (isMounted) supportedTypes.value = value;
    });
  });
  return { hasHardware, isEnrolled, enrolledLevel, supportedTypes };
}

export const LocalAuthScreen = defineComponent(
  () => {
    const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.LocalAuth];
    const lineColor = LINE_COLOR[lineInfo.line];

    const { hasHardware, isEnrolled, enrolledLevel, supportedTypes } =
      useLocalAuthCapabilities();
    const authResult: Ref<ILocalAuthenticationResult | null> = ref(null);
    const isAuthenticating = ref(false);

    const enrolledLevelLabel = computed(() =>
      enrolledLevel.value === null
        ? 'checking…'
        : securityLevelLabel(enrolledLevel.value),
    );
    const supportedTypesLabel = computed(() => {
      if (supportedTypes.value === null) return 'checking…';
      if (supportedTypes.value.length === 0) return 'none';
      return supportedTypes.value.map(authenticationTypeLabel).join(', ');
    });

    function handleAuthenticate() {
      isAuthenticating.value = true;
      authenticateAsync({ promptMessage: 'Confirm it is you' }).then(result => {
        authResult.value = result;
        isAuthenticating.value = false;
      });
    }

    function handleCancel() {
      cancelAuthenticate();
    }

    return () => (
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

          <view testID="local-auth-capabilities-card" class="auth-card">
            <view class="auth-card-header">
              <text class="auth-card-title">Capabilities</text>
            </view>
            <CapabilityRow
              testID="local-auth-hardware"
              label="Hardware present"
              status={hasHardware.value}
            />
            <CapabilityRow
              testID="local-auth-enrolled"
              label="Enrolled"
              status={isEnrolled.value}
            />
            <ValueRow label="Enrolled level" value={enrolledLevelLabel.value} />
            <ValueRow label="Supported types" value={supportedTypesLabel.value} />
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
              title={isAuthenticating.value ? 'Authenticating…' : 'Authenticate'}
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
            {authResult.value !== null && (
              <view
                testID="local-auth-result"
                class={`auth-result auth-result-${authResult.value.success ? 'success' : 'error'}`}
              >
                <text class="auth-result-text">
                  {authResult.value.success
                    ? 'Success'
                    : `Failed: ${authResult.value.error}${
                        authResult.value.warning
                          ? ` (${authResult.value.warning})`
                          : ''
                      }`}
                </text>
              </view>
            )}
          </view>
        </scroll-view>
      </safe-area-view>
    );
  },
  { name: 'LocalAuthScreen' },
);
