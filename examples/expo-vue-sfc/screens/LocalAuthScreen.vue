<!--
  @symbiote-native/local-auth tour stop — a capabilities card (hardware present, enrolled,
  enrolled security level, supported biometric types) followed by a live authenticateAsync()
  button. cancelAuthenticate() is Android-only upstream, so the Cancel button only renders there.
  Vue SFC twin of ../../react/screens/LocalAuthScreen.tsx.
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
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
import ActionButton from '../components/ActionButton.vue';
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
// narrowing entirely — same fix as the React port's securityLevelLabel.
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

const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.LocalAuth];
const lineColor = LINE_COLOR[lineInfo.line];

const hasHardware = ref<ICapabilityStatus>('checking');
const isEnrolled = ref<ICapabilityStatus>('checking');
const enrolledLevel = ref<SecurityLevel | null>(null);
const supportedTypes = ref<AuthenticationType[] | null>(null);
const authResult = ref<ILocalAuthenticationResult | null>(null);
const isAuthenticating = ref(false);

onMounted(() => {
  void hasHardwareAsync().then(value => {
    hasHardware.value = toCapabilityStatus(value);
  });
  void isEnrolledAsync().then(value => {
    isEnrolled.value = toCapabilityStatus(value);
  });
  void getEnrolledLevelAsync().then(value => {
    enrolledLevel.value = value;
  });
  void supportedAuthenticationTypesAsync().then(value => {
    supportedTypes.value = value;
  });
});

const enrolledLevelText = computed(() =>
  enrolledLevel.value === null
    ? 'checking…'
    : securityLevelLabel(enrolledLevel.value),
);

const supportedTypesText = computed(() => {
  if (supportedTypes.value === null) return 'checking…';
  if (supportedTypes.value.length === 0) return 'none';
  return supportedTypes.value.map(authenticationTypeLabel).join(', ');
});

const authenticateButtonTitle = computed(() =>
  isAuthenticating.value ? 'Authenticating…' : 'Authenticate',
);

const authResultClass = computed(() =>
  authResult.value
    ? `auth-result auth-result-${authResult.value.success ? 'success' : 'error'}`
    : '',
);

const authResultText = computed(() => {
  if (!authResult.value) return '';
  if (authResult.value.success) return 'Success';
  const warningSuffix = authResult.value.warning
    ? ` (${authResult.value.warning})`
    : '';
  return `Failed: ${authResult.value.error}${warningSuffix}`;
});

function handleAuthenticate(): void {
  isAuthenticating.value = true;
  void authenticateAsync({ promptMessage: 'Confirm it is you' }).then(
    result => {
      authResult.value = result;
      isAuthenticating.value = false;
    },
  );
}

function handleCancel(): void {
  cancelAuthenticate();
}
</script>

<template>
  <safe-area-view class="screen">
    <scroll-view
      testID="local-auth-scroll"
      class="screen"
      content-container-style="scroll-content"
    >
      <view :class="`line-tag line-tag-${lineInfo.line}`">
        <text class="line-tag-text">{{
          `${lineInfo.code} · ${lineInfo.label}`
        }}</text>
      </view>
      <view class="hero-card">
        <view class="hero-badge" :style="{ backgroundColor: lineColor }">
          <text class="hero-badge-text">{{ lineInfo.code }}</text>
        </view>
        <view class="hero-copy">
          <text class="hero-title">Local auth</text>
          <text class="hero-body"
            >@symbiote-native/local-auth — FaceID/TouchID on iOS, the
            Fingerprint/Biometric API on Android. A simulator with no enrolled
            biometrics reports "not enrolled"; a real device with
            FaceID/TouchID/fingerprint set up is needed to see a live
            prompt.</text
          >
        </view>
      </view>

      <view testID="local-auth-capabilities-card" class="auth-card">
        <view class="auth-card-header">
          <text class="auth-card-title">Capabilities</text>
        </view>
        <view testID="local-auth-hardware" class="auth-capability-row">
          <text class="auth-capability-label">Hardware present</text>
          <view :class="`auth-status-badge auth-status-badge-${hasHardware}`">
            <text class="auth-status-text">{{
              hasHardware === 'checking'
                ? 'CHECKING…'
                : hasHardware === 'yes'
                  ? 'YES'
                  : 'NO'
            }}</text>
          </view>
        </view>
        <view testID="local-auth-enrolled" class="auth-capability-row">
          <text class="auth-capability-label">Enrolled</text>
          <view :class="`auth-status-badge auth-status-badge-${isEnrolled}`">
            <text class="auth-status-text">{{
              isEnrolled === 'checking'
                ? 'CHECKING…'
                : isEnrolled === 'yes'
                  ? 'YES'
                  : 'NO'
            }}</text>
          </view>
        </view>
        <view class="auth-capability-row">
          <text class="auth-capability-label">Enrolled level</text>
          <text class="auth-value-text">{{ enrolledLevelText }}</text>
        </view>
        <view class="auth-capability-row">
          <text class="auth-capability-label">Supported types</text>
          <text class="auth-value-text">{{ supportedTypesText }}</text>
        </view>
      </view>

      <view testID="local-auth-authenticate-card" class="auth-card">
        <view class="auth-card-header">
          <text class="auth-card-title">Authenticate</text>
        </view>
        <text class="info-text"
          >Prompts FaceID/TouchID on iOS, or the Biometric/Fingerprint dialog on
          Android.</text
        >
        <ActionButton
          testID="local-auth-authenticate-button"
          :title="authenticateButtonTitle"
          :onPress="handleAuthenticate"
          :color="lineColor"
        />
        <ActionButton
          v-if="Platform.OS === 'android'"
          testID="local-auth-cancel-button"
          title="Cancel"
          :onPress="handleCancel"
          :color="lineColor"
        />
        <view
          v-if="authResult"
          testID="local-auth-result"
          :class="authResultClass"
        >
          <text class="auth-result-text">{{ authResultText }}</text>
        </view>
      </view>
    </scroll-view>
  </safe-area-view>
</template>
