import { createSignal } from 'solid-js';
import { isAvailableAsync } from '@symbiote-native/sharing';
import { Card, ScreenShell } from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';
import { IncomingShareSection, ShareCard } from './sharing-extras';

type ICapabilityStatus = 'checking' | 'yes' | 'no';

const STATUS_TEXT: Record<ICapabilityStatus, string> = {
  checking: 'CHECKING…',
  yes: 'YES',
  no: 'NO',
};

function CapabilityCard() {
  const [status, setStatus] = createSignal<ICapabilityStatus>('checking');
  isAvailableAsync().then(available => setStatus(available ? 'yes' : 'no'));

  return (
    <Card testID="sharing-capability-card" title="Capabilities">
      <view testID="sharing-available" class="capability-row">
        <text class="capability-label">Available</text>
        <view class={`status-badge status-badge-${status()}`}>
          <text class="status-badge-text">{STATUS_TEXT[status()]}</text>
        </view>
      </view>
    </Card>
  );
}

export function SharingScreen() {
  return (
    <ScreenShell
      route={ROUTE_NAME.Sharing}
      testID="sharing-scroll"
      title="Sharing"
      body="Send files out through the system share sheet, and receive links, text and images that other apps share into yours."
    >
      <CapabilityCard />
      <ShareCard />
      <IncomingShareSection />
    </ScreenShell>
  );
}
