import { createSignal, onCleanup } from 'solid-js';
import { isAvailableAsync, sendSMSAsync } from '@symbiote-native/sms';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

type ICapabilityStatus = 'checking' | 'yes' | 'no';

function toCapabilityStatus(value: boolean): ICapabilityStatus {
  return value ? 'yes' : 'no';
}

function CapabilityRow(props: {
  testID: string;
  label: string;
  status: ICapabilityStatus;
}) {
  const text = () =>
    props.status === 'checking'
      ? 'CHECKING…'
      : props.status === 'yes'
        ? 'YES'
        : 'NO';
  return (
    <view testID={props.testID} class="capability-row">
      <text class="capability-label">{props.label}</text>
      <view class={`status-badge status-badge-${props.status}`}>
        <text class="status-badge-text">{text()}</text>
      </view>
    </view>
  );
}

/**
 * @symbiote-native/sms canary demo: an isAvailableAsync capability row, recipient + message
 * inputs, and one sendSMSAsync round-trip whose 'sent' | 'cancelled' | 'unknown' result is
 * rendered back.
 *
 * Recipients are split on commas so the string | string[] overload of sendSMSAsync is exercised
 * from a single input.
 */
export function SmsScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Sms];
  const lineColor = LINE_COLOR[lineInfo.line];

  const [isAvailable, setIsAvailable] =
    createSignal<ICapabilityStatus>('checking');
  const [recipients, setRecipients] = createSignal('');
  const [message, setMessage] = createSignal('Sent from the Symbiote canary');
  const [lastResult, setLastResult] = createSignal('idle');

  let disposed = false;
  onCleanup(() => {
    disposed = true;
  });
  isAvailableAsync().then(available => {
    if (!disposed) {
      setIsAvailable(toCapabilityStatus(available));
    }
  });

  const handleSend = () => {
    const addresses = recipients()
      .split(',')
      .map(address => address.trim())
      .filter(address => address.length > 0);
    if (addresses.length === 0) {
      setLastResult('no recipients');
      return;
    }
    setLastResult('composer open…');
    sendSMSAsync(addresses, message())
      .then(response => setLastResult(`result: ${response.result}`))
      .catch((error: Error) => setLastResult(`send failed: ${error.message}`));
  };

  return (
    <safe-area-view class="screen">
      <scroll-view
        testID="sms-scroll"
        class="screen"
        contentContainerStyle="scroll-content"
      >
        <view class={`line-tag line-tag-${lineInfo.line}`}>
          <text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</text>
        </view>
        <view class="hero-card">
          <view class="hero-badge" style={{ backgroundColor: lineColor }}>
            <text class="hero-badge-text">{lineInfo.code}</text>
          </view>
          <view class="hero-copy">
            <text class="hero-title">SMS</text>
            <text class="hero-body">
              @symbiote-native/sms — opens the system SMS composer prefilled
              with recipients and a message. It never sends anything by itself;
              the user does.
            </text>
          </view>
        </view>

        <view testID="sms-capability-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Capabilities</text>
          </view>
          <CapabilityRow
            testID="sms-available"
            label="Available"
            status={isAvailable()}
          />
          <text class="info-text">
            NO is expected on the iOS simulator, which has no Messages app, and
            on Android devices without telephony hardware. Only a real phone
            reports YES.
          </text>
        </view>

        <view testID="sms-compose-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Compose</text>
          </view>
          <text-input
            testID="sms-recipients-input"
            value={recipients()}
            onValueChange={event => setRecipients(event.text)}
            placeholder="0123456789, 9876543210"
            placeholderTextColor="#41506a"
            autoCapitalize="none"
            class="text-input"
          />
          <text-input
            testID="sms-message-input"
            value={message()}
            onValueChange={event => setMessage(event.text)}
            placeholder="Message"
            placeholderTextColor="#41506a"
            class="text-input"
          />
          <ActionButton
            testID="sms-send-button"
            title="Open composer"
            onPress={handleSend}
            color={lineColor}
          />
          <view class="capability-row">
            <text class="capability-label">Last result</text>
            <text testID="sms-result" class="value-text">
              {lastResult()}
            </text>
          </view>
          <text class="info-text">
            Android always reports unknown — reading the real outcome needs
            READ_SMS, which Google restricts to default-SMS-app publishers.
            Treat it as the composer closed, not as a failure. iOS reports sent
            or cancelled.
          </text>
        </view>
      </scroll-view>
    </safe-area-view>
  );
}
