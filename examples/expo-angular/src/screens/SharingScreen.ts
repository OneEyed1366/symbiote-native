import { Component, signal } from '@angular/core';
import { isAvailableAsync } from '@symbiote-native/sharing/angular';
import { Card } from '../components/Card';
import { ScreenShell } from '../components/ScreenShell';
import { toCapabilityStatus } from '../components/capability-status';
import type { ICapabilityStatus } from '../components/capability-status';
import { ROUTE_NAME } from '../routes';
import { CapabilityRow } from './CapabilityRow';
import { SharingIncomingSection } from './SharingIncomingSection';
import { SharingShareCard } from './SharingShareCard';

@Component({
  selector: 'SharingScreen',
  standalone: true,
  imports: [
    CapabilityRow,
    Card,
    ScreenShell,
    SharingIncomingSection,
    SharingShareCard,
  ],
  template: `
    <ScreenShell
      [route]="route"
      testID="sharing-scroll"
      title="Sharing"
      body="Send files out through the system share sheet, and receive links, text and images that other apps share into yours."
    >
      <Card testID="sharing-capability-card" title="Capabilities">
        <CapabilityRow
          testID="sharing-available"
          label="Available"
          [status]="status()"
        />
      </Card>
      <SharingShareCard />
      <SharingIncomingSection />
    </ScreenShell>
  `,
})
export class SharingScreen {
  readonly route = ROUTE_NAME.Sharing;
  readonly status = signal<ICapabilityStatus>('checking');

  constructor() {
    void isAvailableAsync().then(available => {
      this.status.set(toCapabilityStatus(available));
    });
  }
}
