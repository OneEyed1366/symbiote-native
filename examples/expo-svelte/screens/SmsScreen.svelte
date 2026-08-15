<script lang="ts">
  // @symbiote-native/sms tour stop — an isAvailableAsync capability row plus a composer card that
  // opens the system SMS composer prefilled with the recipients and message typed below. Svelte
  // twin of ../../expo-vue-sfc/screens/SmsScreen.vue.
  //
  // Markup formatting is load-bearing: siblings are packed edge-to-edge and every text node stays
  // on ONE source line — see MenuScreen.svelte's header and svelte-adapter-dom-shim §16.
  import { SafeAreaView, ScrollView, Text, TextInput, View } from '@symbiote-native/svelte';
  import { isAvailableAsync, sendSMSAsync } from '@symbiote-native/sms/svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import { ROUTE_NAME } from '../routes';
  import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

  type ICapabilityStatus = 'checking' | 'yes' | 'no';

  const PLACEHOLDER_COLOR = '#41506a';
  const RECIPIENT_SEPARATOR = ',';

  function toCapabilityStatus(value: boolean): ICapabilityStatus {
    return value ? 'yes' : 'no';
  }

  function toBadgeText(status: ICapabilityStatus): string {
    return status === 'checking' ? 'CHECKING…' : status === 'yes' ? 'YES' : 'NO';
  }

  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Sms];
  const lineColor = LINE_COLOR[lineInfo.line];

  let isAvailable = $state<ICapabilityStatus>('checking');
  let recipients = $state('0123456789');
  let message = $state('Running late, sorry!');
  let lastResult = $state('idle');

  $effect(() => {
    // Nothing reactive is read synchronously here, so the dependency set is empty and this runs
    // exactly once on mount — the twin of Vue's onMounted.
    void isAvailableAsync().then(available => {
      isAvailable = toCapabilityStatus(available);
    });
  });

  function handleSend(): void {
    lastResult = 'opening composer…';
    const addresses = recipients
      .split(RECIPIENT_SEPARATOR)
      .map(address => address.trim())
      .filter(address => address.length > 0);

    void sendSMSAsync(addresses, message)
      .then(response => {
        lastResult = `result: ${response.result}`;
      })
      .catch((error: Error) => {
        lastResult = `send failed: ${error.message}`;
      });
  }
</script>

<SafeAreaView class="screen"
  ><ScrollView testID="sms-scroll" class="screen" contentContainerStyle="scroll-content"
    ><View class={`line-tag line-tag-${lineInfo.line}`}
      ><Text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text></View
    ><View class="hero-card"
      ><View class="hero-badge" style={{ backgroundColor: lineColor }}
        ><Text class="hero-badge-text">{lineInfo.code}</Text></View
      ><View class="hero-copy"
        ><Text class="hero-title">SMS</Text><Text class="hero-body">@symbiote-native/sms — opens the system SMS composer prefilled with recipients and a message. The user still has to press send themselves.</Text></View
      ></View
    ><View testID="sms-capability-card" class="sms-card"
      ><Text class="sms-card-title">Capabilities</Text><View testID="sms-available" class="sms-row"
        ><Text class="sms-row-label">Available</Text><View class={`sms-status-badge sms-status-badge-${isAvailable}`}
          ><Text class="sms-status-text">{toBadgeText(isAvailable)}</Text></View
        ></View
      ><Text class="sms-note">NO on the iOS simulator, which ships no Messages app, and on Android devices without telephony hardware. A real iPhone or an Android device with a SIM reports YES.</Text></View
    ><View testID="sms-compose-card" class="sms-card"
      ><Text class="sms-card-title">Compose</Text><TextInput
        testID="sms-recipients-input"
        value={recipients}
        onValueChange={next => (recipients = next)}
        placeholder="Recipients, comma-separated"
        placeholderTextColor={PLACEHOLDER_COLOR}
        class="text-input"
        autoCapitalize="none"
        autoCorrect={false}
      /><TextInput
        testID="sms-message-input"
        value={message}
        onValueChange={next => (message = next)}
        placeholder="Message"
        placeholderTextColor={PLACEHOLDER_COLOR}
        class="text-input"
      /><ActionButton
        testID="sms-send-button"
        title="Open composer"
        onPress={handleSend}
        color={lineColor}
      /><View class="sms-row"
        ><Text class="sms-row-label">Last result</Text><Text testID="sms-result" class="sms-value-text">{lastResult}</Text></View
      ><Text class="sms-note">iOS reports sent or cancelled; Android always reports unknown, because reading the real outcome needs the READ_SMS permission Google restricts to default-SMS-app publishers. Treat unknown as "the composer closed".</Text></View
    ></ScrollView
  ></SafeAreaView
>
