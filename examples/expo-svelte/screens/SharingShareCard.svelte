<script lang="ts">
  import { File, Paths } from '@symbiote-native/file-system/svelte';
  import { shareAsync } from '@symbiote-native/sharing/svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import Explorer from '../components/Explorer.svelte';
  import Field from '../components/Field.svelte';
  import ResultRow from '../components/ResultRow.svelte';
  import Scenario from '../components/Scenario.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';

  const color = lineColorOf(ROUTE_NAME.Sharing);

  let fileUri = $state('');
  let mimeType = $state('');
  let uti = $state('');
  let dialogTitle = $state('Share from the Symbiote canary');
  let anchorX = $state('');
  let anchorY = $state('');
  let anchorWidth = $state('');
  let anchorHeight = $state('');
  let lastResult = $state('idle');

  function optionalNumber(text: string): number | undefined {
    const value = Number(text);
    return text.trim() === '' || Number.isNaN(value) ? undefined : value;
  }

  function optional(text: string): string | undefined {
    return text.trim() === '' ? undefined : text.trim();
  }

  function createSample(): void {
    const sample = new File(Paths.cache, 'symbiote-share-sample.txt');
    try {
      if (!sample.exists) {
        sample.create();
      }
      sample.write('Shared from the Symbiote canary');
      fileUri = sample.uri;
      mimeType = 'text/plain';
      lastResult = 'sample file created';
    } catch (error) {
      lastResult = `sample failed at ${sample.uri}: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  function share(): void {
    lastResult = 'sheet open…';
    shareAsync(fileUri, {
      mimeType: optional(mimeType),
      UTI: optional(uti),
      dialogTitle: optional(dialogTitle),
      anchor: {
        x: optionalNumber(anchorX),
        y: optionalNumber(anchorY),
        width: optionalNumber(anchorWidth),
        height: optionalNumber(anchorHeight),
      },
    })
      .then(() => {
        lastResult = 'sheet dismissed';
      })
      .catch((error: Error) => {
        lastResult = `share failed: ${error.message}`;
      });
  }
</script>

<Scenario
  testID="sharing-share-card"
  title="Let users send a file to another app"
  why="Export a report, a photo or a backup through the system share sheet, so the user picks Messages, Mail, AirDrop or any installed app. The file must be a local file:// path."
  steps={[
    'Press Create a sample file',
    'Press Share',
    'Pick a target in the share sheet, or dismiss it',
  ]}
  expect="The share sheet opens with the sample file. Last result says sheet dismissed after you pick a target or cancel."
>
  <ActionButton testID="sharing-sample-button" title="Create a sample file" onPress={createSample} {color} />
  <Field testID="sharing-uri-input" label="file uri" value={fileUri} onChange={next => { fileUri = next; }} placeholder="file:///path/to/file.pdf" />
  <ActionButton testID="sharing-share-button" title="Share" onPress={share} {color} />
  <ResultRow testID="sharing-result" label="Last result" value={lastResult} />
  <Explorer testID="sharing-options-explorer" {color}>
    <Field testID="sharing-mime-input" label="mimeType (Android)" value={mimeType} onChange={next => { mimeType = next; }} />
    <Field testID="sharing-uti-input" label="UTI (iOS)" value={uti} onChange={next => { uti = next; }} />
    <Field testID="sharing-title-input" label="dialogTitle" value={dialogTitle} onChange={next => { dialogTitle = next; }} />
    <Field testID="sharing-anchor-x-input" label="anchor.x (iPad popover)" value={anchorX} onChange={next => { anchorX = next; }} />
    <Field testID="sharing-anchor-y-input" label="anchor.y" value={anchorY} onChange={next => { anchorY = next; }} />
    <Field testID="sharing-anchor-width-input" label="anchor.width" value={anchorWidth} onChange={next => { anchorWidth = next; }} />
    <Field testID="sharing-anchor-height-input" label="anchor.height" value={anchorHeight} onChange={next => { anchorHeight = next; }} />
  </Explorer>
</Scenario>
