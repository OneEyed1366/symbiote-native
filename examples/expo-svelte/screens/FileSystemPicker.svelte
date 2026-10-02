<script lang="ts">
  import { Directory, File } from '@symbiote-native/file-system';
  import CallConsole from '../components/CallConsole.svelte';
  import Card from '../components/Card.svelte';
  import Field from '../components/Field.svelte';
  import ToggleRow from '../components/ToggleRow.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';

  const color = lineColorOf(ROUTE_NAME.FileSystem);

  let mimeTypes = $state('');
  let initialUri = $state('');
  let isMultiple = $state(false);

  function picked(files: File | File[] | null): string[] {
    if (files === null) {
      return [];
    }
    return (Array.isArray(files) ? files : [files]).map(item => item.uri);
  }
</script>

<Card testID="file-system-picker-card" title="System pickers">
  <Field testID="file-system-mime-input" label="mimeTypes (comma separated)" value={mimeTypes} onChange={next => (mimeTypes = next)} />
  <Field testID="file-system-initial-input" label="initialUri" value={initialUri} onChange={next => (initialUri = next)} />
  <ToggleRow testID="file-system-multiple-switch" label="multipleFiles" value={isMultiple} onChange={next => (isMultiple = next)} {color} />
</Card>
<CallConsole
  prefix="file-system-pickers"
  title="Picker calls"
  {color}
  calls={[
    {
      label: 'File.pickFileAsync',
      run: async () => {
        const types = mimeTypes
          .split(',')
          .map(item => item.trim())
          .filter(item => item !== '');
        const common = {
          initialUri: initialUri === '' ? undefined : initialUri,
          mimeTypes: types.length === 0 ? undefined : types,
        };
        const outcome = isMultiple
          ? await File.pickFileAsync({ ...common, multipleFiles: true })
          : await File.pickFileAsync({ ...common, multipleFiles: false });
        return outcome.canceled ? 'canceled' : picked(outcome.result);
      },
    },
    {
      label: 'Directory.pickDirectoryAsync',
      run: async () =>
        (await Directory.pickDirectoryAsync(initialUri === '' ? undefined : initialUri)).uri,
    },
  ]}
/>
