import { Component, signal } from '@angular/core';
import { File, Paths } from '@symbiote-native/file-system';
import { CallConsole } from '../components/CallConsole';
import { Field } from '../components/Field';
import { Scenario } from '../components/Scenario';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';

const NOTE_NAME = 'canary-note.txt';
const BYTES_PER_MB = 1_048_576;

@Component({
  selector: 'FileSystemNote',
  standalone: true,
  imports: [CallConsole, Field, Scenario],
  template: `
    <Scenario
      testID="file-system-note-scenario"
      title="Keep a note on the device and read it after a restart"
      why="Store drafts, exports or cached data as real files in the app's own documents folder. They survive restarts and other apps cannot read them."
      [steps]="steps"
      expect="The note text comes back unchanged after the relaunch. Delete note removes the file, and Read note then fails with a clear error."
    >
      <Field testID="file-system-note-input" label="note" [(value)]="text" />
      <CallConsole
        isBare
        prefix="file-system-note"
        title="Note file"
        [color]="color"
        [calls]="calls"
      />
    </Scenario>
  `,
})
export class FileSystemNote {
  readonly color = lineColorOf(ROUTE_NAME.FileSystem);
  readonly steps = [
    'Type a note and press Save note',
    'Force-quit the app and open it again',
    'Press Read note',
  ];

  readonly text = signal('Remember the milk');

  private note(): File {
    return new File(Paths.document, NOTE_NAME);
  }

  readonly calls = [
    {
      label: 'Save note',
      run: async () => {
        const file = this.note();
        if (!file.exists) {
          file.create();
        }
        file.write(this.text());
        return { uri: file.uri, size: file.size };
      },
    },
    { label: 'Read note', run: () => this.note().text() },
    { label: 'Delete note', run: async () => this.note().delete() },
    {
      label: 'Free disk space (MB)',
      run: async () => Math.round(Paths.availableDiskSpace / BYTES_PER_MB),
    },
  ];
}
