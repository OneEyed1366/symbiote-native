import { useEffect, useState } from 'react';
import { isAvailableAsync } from '@symbiote-native/sharing';
import { Card, ScreenShell } from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';
import { IncomingShareSection, ShareCard } from './sharing-extras';

type ICapabilityStatus = 'checking' | 'yes' | 'no';

function CapabilityCard() {
  const [status, setStatus] = useState<ICapabilityStatus>('checking');

  useEffect(() => {
    let isMounted = true;
    isAvailableAsync().then(available => {
      if (isMounted) {
        setStatus(available ? 'yes' : 'no');
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const text = status === 'checking' ? 'CHECKING…' : status === 'yes' ? 'YES' : 'NO';
  return (
    <Card testID="sharing-capability-card" title="Capabilities">
      <view testID="sharing-available" className="capability-row">
        <text className="capability-label">Available</text>
        <view className={`status-badge status-badge-${status}`}>
          <text className="status-badge-text">{text}</text>
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
