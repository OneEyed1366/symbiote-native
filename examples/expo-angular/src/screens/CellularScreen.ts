import { Component, inject, signal } from '@angular/core';
import {
  Platform,
  SafeAreaView,
  ScrollView,
  Text,
  View,
} from '@symbiote-native/angular';
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
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

function generationLabel(generation: CellularGeneration | null): string {
  if (generation === null) return 'checking…';
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
  if (value === null) return 'checking…';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return value || '(none)';
}

/**
 * @symbiote-native/cellular canary demo: a one-shot info card (generation + carrier/SIM fields,
 * every field except generation returns null on iOS/web upstream — Android-only in practice)
 * plus a permission card driving PermissionsService. Most fields need a physical device with a
 * SIM card; a simulator/emulator reports null/UNKNOWN for nearly everything. Angular twin of
 * ../../react/screens/CellularScreen.tsx.
 */
@Component({
  selector: 'CellularScreen',
  standalone: true,
  imports: [ActionButton, SafeAreaView, ScrollView, Text, View],
  template: `
    <SafeAreaView class="screen">
      <ScrollView
        testID="cellular-scroll"
        class="screen"
        contentContainerStyle="scroll-content"
      >
        <View [class]="lineTagClass">
          <Text class="line-tag-text">{{ lineTagLabel }}</Text>
        </View>
        <View class="hero-card">
          <View class="hero-badge" [style]="heroBadgeStyle">
            <Text class="hero-badge-text">{{ heroBadgeCode }}</Text>
          </View>
          <View class="hero-copy">
            <Text class="hero-title">Cellular</Text>
            <Text class="hero-body">
              @symbiote-native/cellular — cellular generation and carrier/SIM
              info. Every field except generation is Android-only upstream
              (iOS/web return null); a physical device with an active SIM is
              needed for real values.
            </Text>
          </View>
        </View>

        <View testID="cellular-info-card" class="capability-card">
          <Text class="capability-card-title">Cellular info</Text>
          <View class="capability-row">
            <Text class="capability-label">Generation</Text>
            <Text class="value-text">{{ generationLabel() }}</Text>
          </View>
          @if (Platform.OS === 'android') {
            <View class="capability-row">
              <Text class="capability-label">Allows VoIP</Text>
              <Text class="value-text">{{ valueLabel(allowsVoip()) }}</Text>
            </View>
            <View class="capability-row">
              <Text class="capability-label">ISO country code</Text>
              <Text class="value-text">{{ valueLabel(isoCountryCode()) }}</Text>
            </View>
            <View class="capability-row">
              <Text class="capability-label">Carrier name</Text>
              <Text class="value-text">{{ valueLabel(carrierName()) }}</Text>
            </View>
            <View class="capability-row">
              <Text class="capability-label">Mobile country code</Text>
              <Text class="value-text">{{
                valueLabel(mobileCountryCode())
              }}</Text>
            </View>
            <View class="capability-row">
              <Text class="capability-label">Mobile network code</Text>
              <Text class="value-text">{{
                valueLabel(mobileNetworkCode())
              }}</Text>
            </View>
          }
        </View>

        <View testID="cellular-permission-card" class="capability-card">
          <Text class="capability-card-title">Permission</Text>
          <View class="capability-row">
            <Text class="capability-label">Phone-state permission status</Text>
            <Text class="value-text">{{ permissionLabel() }}</Text>
          </View>
          <ActionButton
            testID="cellular-request-permission"
            title="Request permission"
            [color]="lineColor"
            (press)="requestPermission()"
          ></ActionButton>
        </View>
      </ScrollView>
    </SafeAreaView>
  `,
})
export class CellularScreen {
  private readonly lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Cellular];
  readonly lineTagClass = `line-tag line-tag-${this.lineInfo.line}`;
  readonly lineTagLabel = `${this.lineInfo.code} · ${this.lineInfo.label}`;
  readonly heroBadgeCode = this.lineInfo.code;
  readonly lineColor = LINE_COLOR[this.lineInfo.line];
  readonly heroBadgeStyle = { backgroundColor: this.lineColor };

  readonly Platform = Platform;

  private readonly permissionsService = inject(PermissionsService);
  readonly permissionStatus = this.permissionsService.connect();

  readonly generation = signal<CellularGeneration | null>(null);
  readonly allowsVoip = signal<boolean | null>(null);
  readonly isoCountryCode = signal<string | null>(null);
  readonly carrierName = signal<string | null>(null);
  readonly mobileCountryCode = signal<string | null>(null);
  readonly mobileNetworkCode = signal<string | null>(null);

  constructor() {
    Promise.all([
      getCellularGenerationAsync(),
      allowsVoipAsync(),
      getIsoCountryCodeAsync(),
      getCarrierNameAsync(),
      getMobileCountryCodeAsync(),
      getMobileNetworkCodeAsync(),
    ]).then(([generation, voip, iso, carrier, mcc, mnc]) => {
      this.generation.set(generation);
      this.allowsVoip.set(voip);
      this.isoCountryCode.set(iso);
      this.carrierName.set(carrier);
      this.mobileCountryCode.set(mcc);
      this.mobileNetworkCode.set(mnc);
    });
  }

  generationLabel(): string {
    return generationLabel(this.generation());
  }

  valueLabel(value: string | boolean | null): string {
    return valueLabel(value);
  }

  permissionLabel(): string {
    const status = this.permissionStatus();
    return status === null ? 'checking…' : status.status;
  }

  requestPermission(): void {
    void this.permissionsService.request();
  }
}
