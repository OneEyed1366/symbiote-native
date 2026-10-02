import { useState } from 'react';
import { useSQLiteContext } from '@symbiote-native/sqlite/react';
import { ActionButton } from '../components/ActionButton';
import { Scenario } from '../components/Scenario';
import { Field, ResultRow, lineColorOf } from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';

const color = lineColorOf(ROUTE_NAME.Sqlite);

type INote = { id: number; text: string };

export function NotesScenario() {
  const db = useSQLiteContext();
  const [text, setText] = useState('Buy milk');
  const [notes, setNotes] = useState<INote[]>([]);
  const [status, setStatus] = useState('idle');

  const refresh = async () => {
    const rows = await db.getAllAsync<INote>('SELECT id, text FROM notes ORDER BY id DESC');
    setNotes(rows);
    setStatus(`${rows.length} note(s)`);
  };
  const run = (action: () => Promise<void>) =>
    action().catch((error: Error) => setStatus(`failed: ${error.message}`));

  return (
    <Scenario
      testID="sqlite-notes-scenario"
      title="Keep a notes list that survives restarts"
      why="Store structured data on the device with real SQL: queries, transactions and indexes. The table is created once by the provider, and the rows stay after the app is closed."
      steps={['Type a note and press Add note', 'Force-quit the app and open it again', 'Press Show notes']}
      expect="The notes you added are still listed after the relaunch, newest first. Clear all empties the table."
    >
      <Field testID="sqlite-note-input" label="note" value={text} onChange={setText} />
      <ActionButton
        testID="sqlite-add-note"
        title="Add note"
        onPress={() => run(async () => { await db.runAsync('INSERT INTO notes (text) VALUES (?)', text); await refresh(); })}
        color={color}
      />
      <ActionButton testID="sqlite-show-notes" title="Show notes" onPress={() => run(refresh)} color={color} />
      <ActionButton
        testID="sqlite-clear-notes"
        title="Clear all"
        onPress={() => run(async () => { await db.runAsync('DELETE FROM notes'); await refresh(); })}
        color={color}
      />
      <ResultRow testID="sqlite-notes-status" label="Status" value={status} />
      {notes.map(note => (
        <text key={note.id} className="info-text">{`#${note.id}  ${note.text}`}</text>
      ))}
    </Scenario>
  );
}
