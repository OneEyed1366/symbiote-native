<script setup lang="ts">
import Card from '../components/Card.vue';
import ChoiceRow from '../components/ChoiceRow.vue';
import Field from '../components/Field.vue';
import ToggleRow from '../components/ToggleRow.vue';
import {
  CHALLENGE_METHOD_CHOICES,
  PROMPT_CHOICES,
  RESPONSE_TYPE_CHOICES,
} from './auth-session-form';
import type { IForm, ISetForm } from './auth-session-form';

defineProps<{ form: IForm; setForm: ISetForm; color: string }>();
</script>

<template>
  <Card testID="auth-session-config-card" title="AuthRequest config">
    <Field
      testID="auth-session-client-input"
      label="clientId"
      :value="form.clientId"
      :onChange="clientId => setForm({ clientId })"
    />
    <Field
      testID="auth-session-redirect-input"
      label="redirectUri"
      :value="form.redirectUri"
      :onChange="redirectUri => setForm({ redirectUri })"
    />
    <Field
      testID="auth-session-scopes-input"
      label="scopes (space separated)"
      :value="form.scopes"
      :onChange="scopes => setForm({ scopes })"
    />
    <Field
      testID="auth-session-secret-input"
      label="clientSecret"
      :value="form.clientSecret"
      :onChange="clientSecret => setForm({ clientSecret })"
    />
    <ChoiceRow
      testID="auth-session-response-type"
      label="responseType"
      :options="RESPONSE_TYPE_CHOICES"
      :value="form.responseType"
      :onChange="responseType => setForm({ responseType })"
      :color="color"
    />
    <ChoiceRow
      testID="auth-session-challenge-method"
      label="codeChallengeMethod"
      :options="CHALLENGE_METHOD_CHOICES"
      :value="form.codeChallengeMethod"
      :onChange="codeChallengeMethod => setForm({ codeChallengeMethod })"
      :color="color"
    />
    <ChoiceRow
      testID="auth-session-prompt"
      label="prompt"
      :options="PROMPT_CHOICES"
      :value="form.prompt"
      :onChange="prompt => setForm({ prompt })"
      :color="color"
    />
    <Field
      testID="auth-session-state-input"
      label="state"
      :value="form.state"
      :onChange="state => setForm({ state })"
    />
    <Field
      testID="auth-session-extra-input"
      label="extraParams (JSON object)"
      :value="form.extraParams"
      :onChange="extraParams => setForm({ extraParams })"
    />
    <ToggleRow
      testID="auth-session-pkce-switch"
      label="usePKCE"
      :value="form.usePKCE"
      :onChange="usePKCE => setForm({ usePKCE })"
      :color="color"
    />
  </Card>
</template>
