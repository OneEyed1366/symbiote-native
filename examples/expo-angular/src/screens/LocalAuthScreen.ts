import { Component, computed, signal } from '@angular/core';
import { Platform, SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import {
  AuthenticationType,
  SecurityLevel,
  authenticateAsync,
  cancelAuthenticate,
  getEnrolledLevelAsync,
  hasHardwareAsync,
  isEnrolledAsync,
  supportedAuthenticationTypesAsync,
} from '@symbiote-native/local-auth/angular';
import type { ILocalAuthenticationResult } from '@symbiote-native/local-auth/angular';
import { ActionButton } from '../components/ActionButton';
import { Scenario } from '../components/Scenario';
import { toCapabilityStatus } from '../components/capability-status';
import type { ICapabilityStatus } from '../components/capability-status';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import { AuthCapabilityRow } from './AuthCapabilityRow';
import { AuthValueRow } from './AuthValueRow';

const ANDROID_OS = 'android';
const PENDING_LABEL = 'checking…';

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

// `SecurityLevel.BIOMETRIC` is a getter alias, so each sibling member has its own nominal type
// Widening to `number` first avoids TS2367 "no overlap" on the comparisons below
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
  return 'Biometric';
}

@Component({
  selector: 'LocalAuthScreen',
  standalone: true,
  imports: [
    ActionButton,
    AuthCapabilityRow,
    AuthValueRow,
    Scenario,
    SYMBIOTE_ELEMENTS,
  ],
  template: `
    <safe-area-view class="screen">
      <scroll-view
        testID="local-auth-scroll"
        class="screen"
        contentContainerStyle="scroll-content"
      >
        <view [class]="'line-tag line-tag-' + lineInfo.line">
          <text class="line-tag-text"
            >{{ lineInfo.code }} · {{ lineInfo.label }}</text
          >
        </view>
        <view class="hero-card">
          <view class="hero-badge" [style]="badgeStyle">
            <text class="hero-badge-text">{{ lineInfo.code }}</text>
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
          [steps]="scenarioSteps"
          expect="Success shows a positive result. Cancelling shows the reason, such as user cancel, and the hardware and enrolled rows tell you why a prompt cannot appear."
        />

        <view testID="local-auth-capabilities-card" class="auth-card">
          <view class="auth-card-header">
            <text class="auth-card-title">Capabilities</text>
          </view>
          <AuthCapabilityRow
            testID="local-auth-hardware"
            label="Hardware present"
            [status]="hasHardware()"
          />
          <AuthCapabilityRow
            testID="local-auth-enrolled"
            label="Enrolled"
            [status]="isEnrolled()"
          />
          <AuthValueRow label="Enrolled level" [value]="enrolledLevelText()" />
          <AuthValueRow
            label="Supported types"
            [value]="supportedTypesText()"
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
            [title]="isAuthenticating() ? 'Authenticating…' : 'Authenticate'"
            [color]="lineColor"
            (press)="authenticate()"
          />
          @if (isAndroid) {
            <ActionButton
              testID="local-auth-cancel-button"
              title="Cancel"
              [color]="lineColor"
              (press)="cancel()"
            />
          }
          @if (authResult(); as result) {
            <view
              testID="local-auth-result"
              [class]="
                'auth-result auth-result-' +
                (result.success ? 'success' : 'error')
              "
            >
              <text class="auth-result-text">{{ authResultText() }}</text>
            </view>
          }
        </view>
      </scroll-view>
    </safe-area-view>
  `,
})
export class LocalAuthScreen {
  readonly lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.LocalAuth];
  readonly lineColor = LINE_COLOR['local-auth'];
  readonly badgeStyle = { backgroundColor: LINE_COLOR['local-auth'] };
  readonly isAndroid = Platform.OS === ANDROID_OS;
  readonly cancel = cancelAuthenticate;
  readonly scenarioSteps = [
    'Check that hardware is present and biometrics are enrolled',
    'Press authenticate and approve with your face or finger',
    'Press it again and cancel',
  ];

  readonly hasHardware = signal<ICapabilityStatus>('checking');
  readonly isEnrolled = signal<ICapabilityStatus>('checking');
  private readonly enrolledLevel = signal<SecurityLevel | null>(null);
  private readonly supportedTypes = signal<AuthenticationType[] | null>(null);
  readonly authResult = signal<ILocalAuthenticationResult | null>(null);
  readonly isAuthenticating = signal(false);

  readonly enrolledLevelText = computed(() => {
    const level = this.enrolledLevel();
    return level === null ? PENDING_LABEL : securityLevelLabel(level);
  });

  readonly supportedTypesText = computed((): string => {
    const types = this.supportedTypes();
    if (types === null) return PENDING_LABEL;
    if (types.length === 0) return 'none';
    return types.map(authenticationTypeLabel).join(', ');
  });

  readonly authResultText = computed((): string => {
    const result = this.authResult();
    if (!result) return '';
    if (result.success) return 'Success';
    const warningSuffix = result.warning ? ` (${result.warning})` : '';
    return `Failed: ${result.error}${warningSuffix}`;
  });

  constructor() {
    void hasHardwareAsync().then(value =>
      this.hasHardware.set(toCapabilityStatus(value)),
    );
    void isEnrolledAsync().then(value =>
      this.isEnrolled.set(toCapabilityStatus(value)),
    );
    void getEnrolledLevelAsync().then(value => this.enrolledLevel.set(value));
    void supportedAuthenticationTypesAsync().then(value =>
      this.supportedTypes.set(value),
    );
  }

  authenticate(): void {
    this.isAuthenticating.set(true);
    void authenticateAsync({ promptMessage: 'Confirm it is you' }).then(
      result => {
        this.authResult.set(result);
        this.isAuthenticating.set(false);
      },
    );
  }
}
