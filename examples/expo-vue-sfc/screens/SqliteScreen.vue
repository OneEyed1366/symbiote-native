<script setup lang="ts">
import { computed, ref } from 'vue';
import { SQLiteProvider } from '@symbiote-native/sqlite/vue';
import type { IOnInitCallback } from '@symbiote-native/sqlite/vue';
import Explorer from '../components/Explorer.vue';
import ScreenShell from '../components/ScreenShell.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import SqliteDatabaseCards from './SqliteDatabaseCards.vue';
import SqliteKv from './SqliteKv.vue';
import SqliteNotes from './SqliteNotes.vue';
import SqliteProviderCard from './SqliteProviderCard.vue';
import SqliteStandaloneCards from './SqliteStandaloneCards.vue';
import {
  CREATE_NOTES_TABLE,
  INITIAL_PROVIDER,
  toDirectory,
  toOpenOptions,
} from './sqlite-provider-form';
import type { IProviderForm } from './sqlite-provider-form';

const ROUTE = ROUTE_NAME.Sqlite;
const color = lineColorOf(ROUTE);

const createNotesTable: IOnInitCallback = async db => {
  await db.execAsync(CREATE_NOTES_TABLE);
};

const form = ref<IProviderForm>({ ...INITIAL_PROVIDER });
const providerError = ref('none');

const options = computed(() => toOpenOptions(form.value));
const directory = computed(() => toDirectory(form.value));

function setForm(patch: Partial<IProviderForm>): void {
  form.value = { ...form.value, ...patch };
}

function onError(error: Error): void {
  providerError.value = error.message;
}
</script>

<template>
  <ScreenShell
    :route="ROUTE"
    testID="sqlite-scroll"
    title="SQLite"
    body="Keep structured data on the device with a real SQL database: queries, transactions, prepared statements, change tracking and a simple key-value store on top."
  >
    <SQLiteProvider
      :databaseName="form.databaseName"
      :directory="directory"
      :options="options"
      :onInit="createNotesTable"
      :onError="onError"
    >
      <SqliteNotes />
      <Explorer testID="sqlite-database-explorer" :color="color">
        <SqliteDatabaseCards />
      </Explorer>
    </SQLiteProvider>
    <Explorer testID="sqlite-explorer" :color="color">
      <SqliteProviderCard :form="form" :setForm="setForm" :color="color" />
      <text testID="sqlite-provider-error" class="info-text">{{ `onError: ${providerError}` }}</text>
      <SqliteStandaloneCards :form="form" />
      <SqliteKv />
    </Explorer>
  </ScreenShell>
</template>
