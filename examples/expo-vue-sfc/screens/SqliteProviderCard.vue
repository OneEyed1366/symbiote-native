<script setup lang="ts">
import Card from '../components/Card.vue';
import Field from '../components/Field.vue';
import ToggleRow from '../components/ToggleRow.vue';
import type { IProviderForm, ISetProvider } from './sqlite-provider-form';

defineProps<{ form: IProviderForm; setForm: ISetProvider; color: string }>();
</script>

<template>
  <Card testID="sqlite-provider-card" title="SQLiteProvider props and open options">
    <Field
      testID="sqlite-name-input"
      label="databaseName"
      :value="form.databaseName"
      :onChange="databaseName => setForm({ databaseName })"
    />
    <Field
      testID="sqlite-directory-input"
      label="directory (empty = defaultDatabaseDirectory)"
      :value="form.directory"
      :onChange="directory => setForm({ directory })"
    />
    <ToggleRow
      testID="sqlite-suspense-switch"
      label="useSuspense"
      :value="form.isSuspense"
      :onChange="isSuspense => setForm({ isSuspense })"
      :color="color"
    />
    <ToggleRow
      testID="sqlite-listener-switch"
      label="enableChangeListener"
      :value="form.enableChangeListener"
      :onChange="enableChangeListener => setForm({ enableChangeListener })"
      :color="color"
    />
    <ToggleRow
      testID="sqlite-new-connection-switch"
      label="useNewConnection"
      :value="form.useNewConnection"
      :onChange="useNewConnection => setForm({ useNewConnection })"
      :color="color"
    />
    <ToggleRow
      testID="sqlite-finalize-switch"
      label="finalizeUnusedStatementsBeforeClosing"
      :value="form.finalizeUnused"
      :onChange="finalizeUnused => setForm({ finalizeUnused })"
      :color="color"
    />
    <Field
      testID="sqlite-libsql-url-input"
      label="libSQLOptions.url"
      :value="form.libSqlUrl"
      :onChange="libSqlUrl => setForm({ libSqlUrl })"
    />
    <Field
      testID="sqlite-libsql-token-input"
      label="libSQLOptions.authToken"
      :value="form.libSqlToken"
      :onChange="libSqlToken => setForm({ libSqlToken })"
    />
    <ToggleRow
      testID="sqlite-libsql-remote-switch"
      label="libSQLOptions.remoteOnly"
      :value="form.isLibSqlRemoteOnly"
      :onChange="isLibSqlRemoteOnly => setForm({ isLibSqlRemoteOnly })"
      :color="color"
    />
  </Card>
</template>
