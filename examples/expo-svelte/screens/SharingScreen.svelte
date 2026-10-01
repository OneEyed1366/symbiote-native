<script lang="ts">
  import { isAvailableAsync } from '@symbiote-native/sharing/svelte';
  import Card from '../components/Card.svelte';
  import ScreenShell from '../components/ScreenShell.svelte';
  import { ROUTE_NAME } from '../routes';
  import SharingIncomingSection from './SharingIncomingSection.svelte';
  import SharingShareCard from './SharingShareCard.svelte';

  type ICapabilityStatus = 'checking' | 'yes' | 'no';

  const STATUS_TEXT: Record<ICapabilityStatus, string> = {
    checking: 'CHECKING…',
    yes: 'YES',
    no: 'NO',
  };

  let status = $state<ICapabilityStatus>('checking');

  $effect(() => {
    void isAvailableAsync().then(available => {
      status = available ? 'yes' : 'no';
    });
  });
</script>

<ScreenShell
  route={ROUTE_NAME.Sharing}
  testID="sharing-scroll"
  title="Sharing"
  body="Send files out through the system share sheet, and receive links, text and images that other apps share into yours."
>
  <Card testID="sharing-capability-card" title="Capabilities">
    <view testID="sharing-available" class="capability-row">
      <text class="capability-label">Available</text>
      <view class={`status-badge status-badge-${status}`}>
        <text class="status-badge-text">{STATUS_TEXT[status]}</text>
      </view>
    </view>
  </Card>
  <SharingShareCard />
  <SharingIncomingSection />
</ScreenShell>
