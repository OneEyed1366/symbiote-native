<script lang="ts">
  // Descendant of <SQLiteProvider> — useSQLiteContext() only resolves for a component that
  // mounts inside the Provider's own children tree (packages/sqlite/src/svelte/
  // SQLiteProvider.smoke.test.ts's own consumer fixture is separate for the same reason), so
  // this can't be inlined into SqliteScreen.svelte's markup.
  import { useSQLiteContext } from '@symbiote-native/sqlite/svelte';

  const db = useSQLiteContext();
</script>

<text testID="sqlite-open-ready" class="auth-value-text">
  {`database ready · ${db.databasePath}`}
</text>
