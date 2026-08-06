import { computed, defineComponent, onMounted, onUnmounted, ref } from 'vue';
import type { Ref } from 'vue';
import { Platform, SafeAreaView, ScrollView, Text, View } from '@symbiote-native/vue';
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
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

type ICapabilityStatus = 'checking' | 'yes' | 'no';

function toCapabilityStatus(value: boolean): ICapabilityStatus {
  return value ? 'yes' : 'no';
}

function authenticationTypeLabel(type: AuthenticationType): string {
  switch (type) {
    case AuthenticationType.FINGERPRINT: return 'Fingerprint';
    case AuthenticationType.FACIAL_RECOGNITION: return 'Facial recognition';
    case AuthenticationType.IRIS: return 'Iris';
    default: return 'Unknown';
  }
}

// SecurityLevel.BIOMETRIC is a computed enum member (a deprecated getter alias via
// Object.defineProperty, see packages/local-auth/src/core/types.ts) — TS gives each named
// member declared alongside it its own nominal literal type, so comparing `level` directly
// against e.g. SecurityLevel.BIOMETRIC_WEAK trips "no overlap" (TS2367/TS2678). Widen to a
// plain `number` first (enum members are always assignable to number) to sidestep it.
function securityLevelLabel(level: SecurityLevel): string {
  const numericLevel: number = level;
  if (numericLevel === SecurityLevel.NONE) return 'None';
  if (numericLevel === SecurityLevel.SECRET) return 'Secret (PIN / pattern / password)';
  if (numericLevel === SecurityLevel.BIOMETRIC_WEAK) return 'Biometric — weak';
  if (numericLevel === SecurityLevel.BIOMETRIC_STRONG) return 'Biometric — strong';
  return 'Biometric'; // unreachable via getEnrolledLevelAsync(), satisfies return type only
}

function CapabilityRow(props: { testID: string; label: string; status: ICapabilityStatus }) {
  return (
    <View testID={props.testID} class="auth-capability-row">
      <Text class="auth-capability-label">{props.label}</Text>
      <View class={`auth-status-badge auth-status-badge-${props.status}`}>
        <Text class="auth-status-text">
          {props.status === 'checking' ? 'CHECKING…' : props.status === 'yes' ? 'YES' : 'NO'}
        </Text>
      </View>
    </View>
  );
}

function ValueRow(props: { label: string; value: string }) {
  return (
    <View class="auth-capability-row">
      <Text class="auth-capability-label">{props.label}</Text>
      <Text class="auth-value-text">{props.value}</Text>
    </View>
  );
}

/**
 * Local auth demo: @symbiote-native/local-auth — FaceID/TouchID on iOS, the Fingerprint/Biometric
 * API on Android. On mount, resolves hardware/enrollment/security-level/supported-types in
 * parallel, each into its own ref; a fast unmount is guarded with an isMounted flag so none of
 * those resolutions writes into a torn-down component. Vue TSX twin of
 * ../../expo-react/screens/LocalAuthScreen.tsx.
 */
export const LocalAuthScreen = defineComponent(
  () => {
    const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.LocalAuth];
    const lineColor = LINE_COLOR[ROUTE_LINE_INFO[ROUTE_NAME.LocalAuth].line];

    const hasHardware = ref<ICapabilityStatus>('checking');
    const isEnrolled = ref<ICapabilityStatus>('checking');
    const enrolledLevel: Ref<SecurityLevel | null> = ref(null);
    const supportedTypes: Ref<AuthenticationType[] | null> = ref(null);
    const authResult: Ref<ILocalAuthenticationResult | null> = ref(null);
    const isAuthenticating = ref(false);

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

    const enrolledLevelLabel = computed(() =>
      enrolledLevel.value === null ? 'checking…' : securityLevelLabel(enrolledLevel.value),
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
      <SafeAreaView class="screen">
        <ScrollView testID="local-auth-scroll" class="screen" contentContainerStyle="scroll-content">
          <View class={`line-tag line-tag-${lineInfo.line}`}>
            <Text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text>
          </View>
          <View class="hero-card">
            <View class="hero-badge" style={{ backgroundColor: lineColor }}>
              <Text class="hero-badge-text">{lineInfo.code}</Text>
            </View>
            <View class="hero-copy">
              <Text class="hero-title">Local auth</Text>
              <Text class="hero-body">
                @symbiote-native/local-auth — FaceID/TouchID on iOS, the Fingerprint/Biometric API
                on Android. A simulator with no enrolled biometrics reports "not enrolled"; a real
                device with FaceID/TouchID/fingerprint set up is needed to see a live prompt.
              </Text>
            </View>
          </View>

          <View testID="local-auth-capabilities-card" class="auth-card">
            <View class="auth-card-header">
              <Text class="auth-card-title">Capabilities</Text>
            </View>
            <CapabilityRow testID="local-auth-hardware" label="Hardware present" status={hasHardware.value} />
            <CapabilityRow testID="local-auth-enrolled" label="Enrolled" status={isEnrolled.value} />
            <ValueRow label="Enrolled level" value={enrolledLevelLabel.value} />
            <ValueRow label="Supported types" value={supportedTypesLabel.value} />
          </View>

          <View testID="local-auth-authenticate-card" class="auth-card">
            <View class="auth-card-header">
              <Text class="auth-card-title">Authenticate</Text>
            </View>
            <Text class="info-text">
              Prompts FaceID/TouchID on iOS, or the Biometric/Fingerprint dialog on Android.
            </Text>
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
            {authResult.value && (
              <View
                testID="local-auth-result"
                class={`auth-result auth-result-${authResult.value.success ? 'success' : 'error'}`}
              >
                <Text class="auth-result-text">
                  {authResult.value.success
                    ? 'Success'
                    : `Failed: ${authResult.value.error}${
                        authResult.value.warning ? ` (${authResult.value.warning})` : ''
                      }`}
                </Text>
              </View>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  },
  { name: 'LocalAuthScreen' },
);
