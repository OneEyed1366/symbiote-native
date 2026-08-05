import { defineComponent, onMounted, onUnmounted, ref } from 'vue';
import type { Ref } from 'vue';
import { SafeAreaView, ScrollView, Text, TextInput, View } from '@symbiote-native/vue';
import { isAvailableAsync, shareAsync } from '@symbiote-native/sharing/vue';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

type ICapabilityStatus = 'checking' | 'yes' | 'no';

function toCapabilityStatus(value: boolean): ICapabilityStatus {
  return value ? 'yes' : 'no';
}

function CapabilityRow(props: { testID: string; label: string; status: ICapabilityStatus }) {
  const text =
    props.status === 'checking' ? 'CHECKING…' : props.status === 'yes' ? 'YES' : 'NO';
  return (
    <View testID={props.testID} class="sharing-row">
      <Text class="sharing-row-label">{props.label}</Text>
      <View class={`sharing-status-badge sharing-status-badge-${props.status}`}>
        <Text class="sharing-status-text">{text}</Text>
      </View>
    </View>
  );
}

/**
 * Sharing demo: @symbiote-native/sharing — the platform share sheet over a local file. The path
 * is typed in by hand because this canary ships no file-system package to produce one, and the
 * native call needs a file it can actually read.
 */
export const SharingScreen = defineComponent(
  () => {
    const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Sharing];
    const lineColor = LINE_COLOR[lineInfo.line];

    const isAvailable: Ref<ICapabilityStatus> = ref('checking');
    const fileUri = ref('');
    const lastResult = ref('idle');

    let isMounted = true;
    onUnmounted(() => {
      isMounted = false;
    });

    onMounted(() => {
      isAvailableAsync().then(available => {
        if (!isMounted) return;
        isAvailable.value = toCapabilityStatus(available);
      });
    });

    function handleShare() {
      lastResult.value = 'sharing…';
      shareAsync(fileUri.value, { dialogTitle: 'Share from the Symbiote canary' })
        .then(() => {
          lastResult.value = 'share sheet dismissed';
        })
        .catch((error: Error) => {
          lastResult.value = `share failed: ${error.message}`;
        });
    }

    return () => (
      <SafeAreaView class="screen">
        <ScrollView testID="sharing-scroll" class="screen" contentContainerStyle="scroll-content">
          <View class={`line-tag line-tag-${lineInfo.line}`}>
            <Text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text>
          </View>
          <View class="hero-card">
            <View class="hero-badge" style={{ backgroundColor: lineColor }}>
              <Text class="hero-badge-text">{lineInfo.code}</Text>
            </View>
            <View class="hero-copy">
              <Text class="hero-title">Sharing</Text>
              <Text class="hero-body">
                @symbiote-native/sharing — opens the platform share sheet for a local file. Type a
                file URI below, then hand it to the sheet.
              </Text>
            </View>
          </View>

          <View testID="sharing-capability-card" class="sharing-card">
            <Text class="sharing-card-title">Capabilities</Text>
            <CapabilityRow
              testID="sharing-available"
              label="Available"
              status={isAvailable.value}
            />
            <Text class="sharing-note">
              Reports on the native module, not on any device capability — it is true on both
              platforms once the module is linked.
            </Text>
          </View>

          <View testID="sharing-share-card" class="sharing-card">
            <Text class="sharing-card-title">Share a file</Text>
            <Text class="sharing-note">
              A real local file URI is required — the share sheet reads the file itself, so a path
              that does not exist raises an error rather than opening. This app ships no
              file-system package to produce one, so supply a path from the device.
            </Text>
            <TextInput
              testID="sharing-uri-input"
              value={fileUri.value}
              onValueChange={(text: string) => {
                fileUri.value = text;
              }}
              placeholder="file:///path/to/a/readable/file"
              placeholderTextColor="#41506a"
              class="text-input"
            />
            <ActionButton
              testID="sharing-share-button"
              title="Share"
              onPress={handleShare}
              color={lineColor}
            />
          </View>

          <View testID="sharing-result-card" class="sharing-card">
            <Text class="sharing-card-title">Last result</Text>
            <View class="sharing-row">
              <Text class="sharing-row-label">Outcome</Text>
              <Text testID="sharing-result" class="sharing-value-text">
                {lastResult.value}
              </Text>
            </View>
            <Text class="sharing-note">
              The sheet does not report which app the user picked, or whether they cancelled — it
              resolves once dismissed either way.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  },
  { name: 'SharingScreen' },
);
