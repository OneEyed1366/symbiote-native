import { defineComponent, ref } from 'vue';
import { File, Paths } from '@symbiote-native/file-system/vue';
import {
  clearSharedPayloads,
  getResolvedSharedPayloadsAsync,
  getSharedPayloads,
  shareAsync,
  useIncomingShare,
} from '@symbiote-native/sharing/vue';
import type { IResolvedSharePayload } from '@symbiote-native/sharing/vue';
import { ActionButton } from '../components/ActionButton';
import { CallConsole } from '../components/CallConsole';
import { Explorer, Scenario } from '../components/Scenario';
import { Field, ResultRow, lineColorOf } from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';

const color = lineColorOf(ROUTE_NAME.Sharing);

function optionalNumber(text: string): number | undefined {
  const value = Number(text);
  return text.trim() === '' || Number.isNaN(value) ? undefined : value;
}

function optional(text: string): string | undefined {
  return text.trim() === '' ? undefined : text.trim();
}

export const ShareCard = defineComponent(
  () => {
    const fileUri = ref('');
    const mimeType = ref('');
    const uti = ref('');
    const dialogTitle = ref('Share from the Symbiote canary');
    const anchorX = ref('');
    const anchorY = ref('');
    const anchorWidth = ref('');
    const anchorHeight = ref('');
    const lastResult = ref('idle');

    const createSample = () => {
      const sample = new File(Paths.cache, 'symbiote-share-sample.txt');
      try {
        if (!sample.exists) {
          sample.create();
        }
        sample.write('Shared from the Symbiote canary');
        fileUri.value = sample.uri;
        mimeType.value = 'text/plain';
        lastResult.value = 'sample file created';
      } catch (error) {
        lastResult.value = `sample failed at ${sample.uri}: ${error instanceof Error ? error.message : String(error)}`;
      }
    };

    const share = () => {
      lastResult.value = 'sheet open…';
      shareAsync(fileUri.value, {
        mimeType: optional(mimeType.value),
        UTI: optional(uti.value),
        dialogTitle: optional(dialogTitle.value),
        anchor: {
          x: optionalNumber(anchorX.value),
          y: optionalNumber(anchorY.value),
          width: optionalNumber(anchorWidth.value),
          height: optionalNumber(anchorHeight.value),
        },
      })
        .then(() => {
          lastResult.value = 'sheet dismissed';
        })
        .catch((error: Error) => {
          lastResult.value = `share failed: ${error.message}`;
        });
    };

    return () => (
      <Scenario
        testID="sharing-share-card"
        title="Let users send a file to another app"
        why="Export a report, a photo or a backup through the system share sheet, so the user picks Messages, Mail, AirDrop or any installed app. The file must be a local file:// path."
        steps={['Press Create a sample file', 'Press Share', 'Pick a target in the share sheet, or dismiss it']}
        expect="The share sheet opens with the sample file. Last result says sheet dismissed after you pick a target or cancel."
      >
        <ActionButton testID="sharing-sample-button" title="Create a sample file" onPress={createSample} color={color} />
        <Field testID="sharing-uri-input" label="file uri" value={fileUri.value} onChange={text => { fileUri.value = text; }} placeholder="file:///path/to/file.pdf" />
        <ActionButton testID="sharing-share-button" title="Share" onPress={share} color={color} />
        <ResultRow testID="sharing-result" label="Last result" value={lastResult.value} />
        <Explorer testID="sharing-options-explorer" color={color}>
          <Field testID="sharing-mime-input" label="mimeType (Android)" value={mimeType.value} onChange={text => { mimeType.value = text; }} />
          <Field testID="sharing-uti-input" label="UTI (iOS)" value={uti.value} onChange={text => { uti.value = text; }} />
          <Field testID="sharing-title-input" label="dialogTitle" value={dialogTitle.value} onChange={text => { dialogTitle.value = text; }} />
          <Field testID="sharing-anchor-x-input" label="anchor.x (iPad popover)" value={anchorX.value} onChange={text => { anchorX.value = text; }} />
          <Field testID="sharing-anchor-y-input" label="anchor.y" value={anchorY.value} onChange={text => { anchorY.value = text; }} />
          <Field testID="sharing-anchor-width-input" label="anchor.width" value={anchorWidth.value} onChange={text => { anchorWidth.value = text; }} />
          <Field testID="sharing-anchor-height-input" label="anchor.height" value={anchorHeight.value} onChange={text => { anchorHeight.value = text; }} />
        </Explorer>
      </Scenario>
    );
  },
  { name: 'ShareCard' },
);

function PayloadRows(props: { payload: IResolvedSharePayload; index: number }) {
  const rows: [string, string][] = [
    ['shareType', props.payload.shareType],
    ['value', props.payload.value],
    ['contentUri', String(props.payload.contentUri)],
    ['contentType', String(props.payload.contentType)],
    ['contentMimeType', String(props.payload.contentMimeType)],
    ['originalName', String(props.payload.originalName)],
    ['contentSize', String(props.payload.contentSize)],
  ];
  return (
    <>
      {rows.map(([label, value]) => (
        <ResultRow key={label} testID={`sharing-payload-${props.index}-${label}`} label={label} value={value} />
      ))}
    </>
  );
}

function probeIncomingShare(): string | null {
  try {
    getSharedPayloads();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

const IncomingShareCards = defineComponent(
  () => {
    const incoming = useIncomingShare();
    return () => (
      <>
        <Scenario
          testID="sharing-incoming-card"
          title="Receive what other apps share into yours"
          why="Appear in the share sheet so users can send a link, text or image straight into the app. The host app needs a share target (iOS Share Extension, Android intent filter), which this package does not generate."
          steps={['In another app, share some text or an image to this app', 'Come back to this screen']}
          expect="The shared payload count goes up and each item is listed with its type and value. Clear empties the list."
        >
          <ResultRow testID="sharing-incoming-count" label="sharedPayloads" value={String(incoming.value.sharedPayloads.length)} />
          <ResultRow testID="sharing-incoming-resolving" label="isResolving" value={String(incoming.value.isResolving)} />
          <ResultRow testID="sharing-incoming-error" label="error" value={incoming.value.error?.message ?? 'none'} />
          <ResultRow testID="sharing-incoming-resolved" label="resolvedSharedPayloads" value={String(incoming.value.resolvedSharedPayloads.length)} />
          {incoming.value.resolvedSharedPayloads.map((payload, index) => (
            <PayloadRows key={index} payload={payload} index={index} />
          ))}
          <ActionButton testID="sharing-incoming-refresh" title="refreshSharePayloads" onPress={() => incoming.value.refreshSharePayloads()} color={color} />
          <ActionButton testID="sharing-incoming-clear" title="clearSharedPayloads (hook)" onPress={() => incoming.value.clearSharedPayloads()} color={color} />
        </Scenario>
        <CallConsole
          prefix="sharing-incoming-calls"
          title="Imperative incoming share calls"
          color={color}
          calls={[
            { label: 'getSharedPayloads', run: async () => getSharedPayloads() },
            { label: 'getResolvedSharedPayloadsAsync', run: () => getResolvedSharedPayloadsAsync() },
            { label: 'clearSharedPayloads', run: async () => clearSharedPayloads() },
          ]}
        />
      </>
    );
  },
  { name: 'IncomingShareCards' },
);

// iOS throws without an App Group and a Share Extension, so probe before mounting the hook
export const IncomingShareSection = defineComponent(
  () => {
    const problem = probeIncomingShare();
    return () =>
      problem === null ? (
        <IncomingShareCards />
      ) : (
        <Scenario
          testID="sharing-incoming-card"
          title="Receive what other apps share into yours (needs native setup)"
          why="Appear in the share sheet so users can send a link, text or image straight into the app. This needs an iOS App Group with a Share Extension, or an Android intent filter, which the example app does not ship."
          steps={['Add a Share Extension and an App Group to the iOS project, or an intent filter on Android', 'Rebuild the app and share something into it']}
          expect={`Right now the native side reports: ${problem}`}
        />
      );
  },
  { name: 'IncomingShareSection' },
);
