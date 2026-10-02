import { defineComponent, ref } from 'vue';
import { File, Paths } from '@symbiote-native/file-system';
import { CallConsole } from '../components/CallConsole';
import { Explorer, Scenario } from '../components/Scenario';
import { Field, ScreenShell, lineColorOf } from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';
import { LegacyCards } from './file-system-legacy';
import { ModernCards } from './file-system-modern';
import { NetworkCards } from './file-system-network';

const color = lineColorOf(ROUTE_NAME.FileSystem);
const NOTE_NAME = 'canary-note.txt';
const BYTES_PER_MB = 1_048_576;

const NoteScenario = defineComponent(
  () => {
    const text = ref('Remember the milk');
    const note = () => new File(Paths.document, NOTE_NAME);
    return () => (
      <Scenario
        testID="file-system-note-scenario"
        title="Keep a note on the device and read it after a restart"
        why="Store drafts, exports or cached data as real files in the app's own documents folder. They survive restarts and other apps cannot read them."
        steps={['Type a note and press Save note', 'Force-quit the app and open it again', 'Press Read note']}
        expect="The note text comes back unchanged after the relaunch. Delete note removes the file, and Read note then fails with a clear error."
      >
        <Field testID="file-system-note-input" label="note" value={text.value} onChange={next => { text.value = next; }} />
        <CallConsole
          isBare
          prefix="file-system-note"
          title="Note file"
          color={color}
          calls={[
            {
              label: 'Save note',
              run: async () => {
                const file = note();
                if (!file.exists) {
                  file.create();
                }
                file.write(text.value);
                return { uri: file.uri, size: file.size };
              },
            },
            { label: 'Read note', run: () => note().text() },
            { label: 'Delete note', run: async () => note().delete() },
            { label: 'Free disk space (MB)', run: async () => Math.round(Paths.availableDiskSpace / BYTES_PER_MB) },
          ]}
        />
      </Scenario>
    );
  },
  { name: 'NoteScenario' },
);

export function FileSystemScreen() {
  return (
    <ScreenShell
      route={ROUTE_NAME.FileSystem}
      testID="file-system-scroll"
      title="File System"
      body="Read, write, copy, move and download files and folders in the app's own storage, with progress and cancellable transfers. Everything here stays inside this app's cache and documents folders."
    >
      <NoteScenario />
      <Explorer testID="file-system-explorer" color={color}>
        <ModernCards />
        <NetworkCards />
        <LegacyCards />
      </Explorer>
    </ScreenShell>
  );
}
