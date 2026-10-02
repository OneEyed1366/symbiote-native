import { Component, computed, inject, signal } from '@angular/core';
import { Platform, SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import {
  CellularGeneration,
  PermissionsService,
  allowsVoipAsync,
  getCarrierNameAsync,
  getCellularGenerationAsync,
  getIsoCountryCodeAsync,
  getMobileCountryCodeAsync,
  getMobileNetworkCodeAsync,
} from '@symbiote-native/cellular/angular';
import { ActionButton } from '../components/ActionButton';
import { Scenario } from '../components/Scenario';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import { ValueRow } from './ValueRow';

const PENDING_LABEL = 'checking…';
const EMPTY_LABEL = '(none)';
const ANDROID_OS = 'android';

function generationLabel(generation: CellularGeneration): string {
  switch (generation) {
    case CellularGeneration.CELLULAR_2G:
      return '2G';
    case CellularGeneration.CELLULAR_3G:
      return '3G';
    case CellularGeneration.CELLULAR_4G:
      return '4G';
    case CellularGeneration.CELLULAR_5G:
      return '5G';
    default:
      return 'Unknown';
  }
}

function valueLabel(value: string | boolean | null): string {
  if (value === null) return PENDING_LABEL;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return value || EMPTY_LABEL;
}

@Component({
  selector: 'CellularScreen',
  standalone: true,
  imports: [ActionButton, Scenario, SYMBIOTE_ELEMENTS, ValueRow],
  template: `
    <safe-area-view class="screen">
      <scroll-view
        testID="cellular-scroll"
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
            <text class="hero-title">Cellular</text>
            <text class="hero-body">
              Find out about the mobile connection: network generation (2G to
              5G), carrier name, country code and whether VoIP is allowed. Only
              the generation works on iOS, a physical device with a SIM is
              needed.
            </text>
          </view>
        </view>

        <Scenario
          testID="cellular-scenario"
          title="Choose video quality from the mobile network generation"
          why="On 3G, lower the stream quality or skip auto-downloads, on 5G allow them. The carrier and country help pick the right payment or support options."
          [steps]="scenarioSteps"
          expect="The generation shows 3G, 4G or 5G and the carrier name appears on Android. Fields the platform does not provide show as unavailable."
        />

        <view testID="cellular-info-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Cellular info</text>
          </view>
          <ValueRow label="Generation" [value]="generationText()" />
          @if (isAndroid) {
            <ValueRow label="Allows VoIP" [value]="label(allowsVoip())" />
            <ValueRow
              label="ISO country code"
              [value]="label(isoCountryCode())"
            />
            <ValueRow label="Carrier name" [value]="label(carrierName())" />
            <ValueRow
              label="Mobile country code"
              [value]="label(mobileCountryCode())"
            />
            <ValueRow
              label="Mobile network code"
              [value]="label(mobileNetworkCode())"
            />
          }
        </view>

        <view testID="cellular-permission-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Permission</text>
          </view>
          <ValueRow
            label="Phone-state permission status"
            [value]="permissionLabel()"
          />
          <ActionButton
            testID="cellular-request-permission"
            title="Request permission"
            [color]="lineColor"
            (press)="requestPermission()"
          />
        </view>
      </scroll-view>
    </safe-area-view>
  `,
})
export class CellularScreen {
  readonly lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Cellular];
  readonly lineColor = LINE_COLOR.cellular;
  readonly badgeStyle = { backgroundColor: LINE_COLOR.cellular };
  readonly isAndroid = Platform.OS === ANDROID_OS;
  readonly label = valueLabel;
  readonly scenarioSteps = [
    'Turn Wi-Fi off so the phone uses mobile data',
    'Read the generation and carrier in the card',
  ];

  private readonly permissions = inject(PermissionsService);
  private readonly permissionStatus = this.permissions.connect();

  private readonly generation = signal<CellularGeneration | null>(null);
  readonly allowsVoip = signal<boolean | null>(null);
  readonly isoCountryCode = signal<string | null>(null);
  readonly carrierName = signal<string | null>(null);
  readonly mobileCountryCode = signal<string | null>(null);
  readonly mobileNetworkCode = signal<string | null>(null);

  readonly generationText = computed(() => {
    const generation = this.generation();
    return generation === null ? PENDING_LABEL : generationLabel(generation);
  });
  readonly permissionLabel = computed(() => {
    const status = this.permissionStatus();
    return status === null ? PENDING_LABEL : status.status;
  });

  constructor() {
    void Promise.all([
      getCellularGenerationAsync(),
      allowsVoipAsync(),
      getIsoCountryCodeAsync(),
      getCarrierNameAsync(),
      getMobileCountryCodeAsync(),
      getMobileNetworkCodeAsync(),
    ]).then(
      ([currentGeneration, voip, iso, carrier, countryCode, networkCode]) => {
        this.generation.set(currentGeneration);
        this.allowsVoip.set(voip);
        this.isoCountryCode.set(iso);
        this.carrierName.set(carrier);
        this.mobileCountryCode.set(countryCode);
        this.mobileNetworkCode.set(networkCode);
      },
    );
  }

  requestPermission(): void {
    void this.permissions.request();
  }
}
