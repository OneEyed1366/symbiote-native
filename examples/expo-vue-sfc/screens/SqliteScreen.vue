<!--
  @symbiote-native/sqlite tour stop — SQLiteProvider/useSQLiteContext (open card + CRUD +
  transaction, all sharing one provider since useSQLiteContext only works inside its
  descendants — see components/SqliteBody.vue), and the SQLite-backed key-value store from its
  own `/kv-store` subpath, which needs no provider at all. First port of this screen across the
  example suite — no React/Svelte/Solid/Angular twin to mirror yet.
-->
<script setup lang="ts">
import { ref } from 'vue';
import {} from '@symbiote-native/vue';
import { SQLiteProvider } from '@symbiote-native/sqlite/vue';
import type { SQLiteDatabase } from '@symbiote-native/sqlite/vue';
import { AsyncStorage } from '@symbiote-native/sqlite/kv-store';
import SqliteBody from '../components/SqliteBody.vue';
import ActionButton from '../components/ActionButton.vue';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Sqlite];
const lineColor = LINE_COLOR[lineInfo.line];

async function handleInitNotesTable(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(
    'CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL)',
  );
}

const providerError = ref<string | null>(null);

function handleProviderError(error: Error): void {
  providerError.value = `open failed: ${error.message}`;
}

// Key-value store — no SQLiteProvider needed, opens its own database lazily on first use.
const kvReadBackText = ref('not written yet');
const kvError = ref<string | null>(null);

function handleKvRoundTrip(): void {
  kvError.value = null;
  void AsyncStorage.setItem('demo-key', 'demo-value')
    .then(() => AsyncStorage.getItem('demo-key'))
    .then(value => {
      kvReadBackText.value = value ?? 'null';
    })
    .catch((error: unknown) => {
      kvError.value = `round trip failed: ${errorMessage(error)}`;
    });
}
</script>

<template>
  <safe-area-view class="screen">
    <scroll-view
      testID="sqlite-scroll"
      class="screen"
      content-container-style="scroll-content"
    >
      <view :class="`line-tag line-tag-${lineInfo.line}`">
        <text class="line-tag-text">{{
          `${lineInfo.code} · ${lineInfo.label}`
        }}</text>
      </view>
      <view class="hero-card">
        <view class="hero-badge" :style="{ backgroundColor: lineColor }">
          <text class="hero-badge-text">{{ lineInfo.code }}</text>
        </view>
        <view class="hero-copy">
          <text class="hero-title">SQLite</text>
          <text testID="sqlite-hero" class="hero-body"
            >@symbiote-native/sqlite — SQLiteProvider/context, CRUD, transactions with
            rollback, and a SQLite-backed key-value store.</text
          >
        </view>
      </view>

      <SQLiteProvider
        database-name="canary-demo.db"
        :on-init="handleInitNotesTable"
        :on-error="handleProviderError"
      >
        <SqliteBody :line-color="lineColor" />
      </SQLiteProvider>
      <view v-if="providerError" testID="sqlite-open-error" class="auth-result auth-result-error">
        <text class="auth-result-text">{{ providerError }}</text>
      </view>

      <view testID="sqlite-kv-store-card" class="auth-card">
        <view class="auth-card-header">
          <text class="auth-card-title">Key-value store</text>
        </view>
        <ActionButton
          testID="sqlite-kv-store-round-trip"
          title="Set + read demo-key"
          :onPress="handleKvRoundTrip"
          :color="lineColor"
        />
        <text testID="sqlite-kv-store-value" class="auth-value-text">{{
          kvReadBackText
        }}</text>
        <view v-if="kvError" class="auth-result auth-result-error">
          <text class="auth-result-text">{{ kvError }}</text>
        </view>
      </view>
    </scroll-view>
  </safe-area-view>
</template>
