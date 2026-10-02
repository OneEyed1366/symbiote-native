import { Component, signal } from '@angular/core';
import {
  getRequiredRegulatoryFeaturesAsync,
  isEligibleForAgeFeaturesAsync,
  requestAgeSignalsAccessAsync,
  setFakeAgeSignals,
  showSignificantUpdateAcknowledgmentAsync,
} from '@symbiote-native/age-range';
import { CallConsole } from '../components/CallConsole';
import { Explorer } from '../components/Explorer';
import { ScreenShell } from '../components/ScreenShell';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { AgeRangeFakeCard } from './AgeRangeFakeCard';
import { AgeRangeRequestCard } from './AgeRangeRequestCard';
import { INITIAL_FAKE, buildSignals } from './age-range-fake';
import type { IFakeForm } from './age-range-fake';

@Component({
  selector: 'AgeRangeScreen',
  standalone: true,
  imports: [
    AgeRangeFakeCard,
    AgeRangeRequestCard,
    CallConsole,
    Explorer,
    ScreenShell,
  ],
  template: `
    <ScreenShell
      [route]="route"
      testID="age-range-scroll"
      title="Age Range"
      body="Comply with age-assurance rules without collecting birth dates: ask Apple's Declared Age Range (iOS 26+) or Google's Play Age Signals (Android) which age bracket the user belongs to."
    >
      <AgeRangeRequestCard />
      <Explorer testID="age-range-explorer" [color]="color">
        <ng-template>
          <CallConsole
            prefix="age-range-platform"
            title="Eligibility and platform calls"
            [color]="color"
            hint="Apple's API needs iOS 26+, Google's Age Signals is Android only. Calls outside their platform are no-ops."
            [calls]="platformCalls"
          />
          <AgeRangeFakeCard [(form)]="fake" />
          <CallConsole
            prefix="age-range-fake"
            title="Fake signals"
            [color]="color"
            [calls]="fakeCalls"
          />
        </ng-template>
      </Explorer>
    </ScreenShell>
  `,
})
export class AgeRangeScreen {
  readonly route = ROUTE_NAME.AgeRange;
  readonly color = lineColorOf(ROUTE_NAME.AgeRange);

  readonly fake = signal<IFakeForm>(INITIAL_FAKE);

  readonly platformCalls = [
    {
      label: 'isEligibleForAgeFeaturesAsync',
      run: () => isEligibleForAgeFeaturesAsync(),
    },
    {
      label: 'getRequiredRegulatoryFeaturesAsync (iOS)',
      run: () => getRequiredRegulatoryFeaturesAsync(),
    },
    {
      label: 'showSignificantUpdateAcknowledgmentAsync (iOS)',
      run: () =>
        showSignificantUpdateAcknowledgmentAsync('Symbiote canary test update'),
    },
    {
      label: 'requestAgeSignalsAccessAsync (Android)',
      run: () => requestAgeSignalsAccessAsync(),
    },
  ];

  readonly fakeCalls = [
    {
      label: 'setFakeAgeSignals(form)',
      run: async () => setFakeAgeSignals(buildSignals(this.fake())),
    },
    {
      label: 'setFakeAgeSignals(null)',
      run: async () => setFakeAgeSignals(null),
    },
  ];
}
