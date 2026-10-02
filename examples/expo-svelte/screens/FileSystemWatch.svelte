<script lang="ts">
  import { Directory, Paths } from '@symbiote-native/file-system';
  import type { IFileSystemWatchEventType } from '@symbiote-native/file-system';
  import Card from '../components/Card.svelte';
  import ChoiceRow from '../components/ChoiceRow.svelte';
  import Field from '../components/Field.svelte';
  import ToggleRow from '../components/ToggleRow.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';

  let { dirName }: { dirName: string } = $props();

  const color = lineColorOf(ROUTE_NAME.FileSystem);
  const MAX_LOGGED_EVENTS = 6;
  const WATCH_EVENTS: readonly IFileSystemWatchEventType[] = [
    'created',
    'modified',
    'deleted',
    'renamed',
  ];
  const EVENT_CHOICES = WATCH_EVENTS.map(item => ({ label: item, value: item }));

  let isOn = $state(false);
  let debounce = $state('100');
  let events = $state<IFileSystemWatchEventType>('modified');
  let lines = $state<string[]>([]);
  let subscription: { remove: () => void } | null = null;

  function optionalNumber(text: string): number | undefined {
    const value = Number(text);
    return text.trim() === '' || Number.isNaN(value) ? undefined : value;
  }

  function toggle(next: boolean): void {
    isOn = next;
    if (!next) {
      subscription?.remove();
      subscription = null;
      return;
    }
    subscription = new Directory(Paths.cache, dirName).watch(
      event => {
        lines = [`${event.type} ${event.target.uri}`, ...lines].slice(0, MAX_LOGGED_EVENTS);
      },
      { debounce: optionalNumber(debounce), events: [events] },
    );
  }
</script>

<Card testID="file-system-watch-card" title="watch (directory)">
  <Field testID="file-system-debounce-input" label="debounce (ms)" value={debounce} onChange={next => (debounce = next)} />
  <ChoiceRow testID="file-system-events" label="events" options={EVENT_CHOICES} value={events} onChange={next => (events = next)} {color} />
  <ToggleRow testID="file-system-watch-switch" label="watch the directory above" value={isOn} onChange={toggle} {color} />
  <text testID="file-system-watch-log" class="info-text">
    {lines.length === 0 ? 'no events yet, create the directory then change files inside it' : lines.join('\n')}
  </text>
</Card>
