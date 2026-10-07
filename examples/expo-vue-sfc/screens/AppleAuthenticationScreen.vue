<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Platform } from '@symbiote-native/vue';
import {
  AppleAuthenticationButton,
  AppleAuthenticationButtonStyle,
  AppleAuthenticationButtonType,
  AppleAuthenticationScope,
  addRevokeListener,
  formatFullName,
  getCredentialStateAsync,
  isAvailableAsync,
  refreshAsync,
  signInAsync,
  signOutAsync,
} from '@symbiote-native/apple-authentication/vue';
import type { IAppleAuthenticationCredential } from '@symbiote-native/apple-authentication/vue';
import { deleteItemAsync, getItemAsync, setItemAsync } from '@symbiote-native/secure-store';
import ActionButton from '../components/ActionButton.vue';
import Card from '../components/Card.vue';
import ChoiceRow from '../components/ChoiceRow.vue';
import Explorer from '../components/Explorer.vue';
import Field from '../components/Field.vue';
import ResultRow from '../components/ResultRow.vue';
import Scenario from '../components/Scenario.vue';
import ScreenShell from '../components/ScreenShell.vue';
import ToggleRow from '../components/ToggleRow.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import {
  BUTTON_STYLES,
  BUTTON_TYPES,
  CREDENTIAL_STATE_LABEL,
  RADIUS_OPTIONS,
  REAL_USER_LABEL,
  REQUEST_STATE,
  SIMULATOR_NOTE,
  USER_KEY,
  describeError,
  preview,
  runSessionStep,
  scopesOf,
} from './apple-authentication-helpers';

const ROUTE = ROUTE_NAME.AppleAuthentication;
const color = lineColorOf(ROUTE);
const IS_IOS = Platform.select({ ios: true, default: false });
const SIGN_IN_TYPE = AppleAuthenticationButtonType.SIGN_IN;
const WHITE_STYLE = AppleAuthenticationButtonStyle.WHITE;

const credential = ref<IAppleAuthenticationCredential | null>(null);
const isAvailable = ref('checking…');
const signInStatus = ref('not signed in');
const savedUser = ref<string | null>(null);
const sessionState = ref('not checked');
const revokedAt = ref('no revoke yet');
const type = ref(AppleAuthenticationButtonType.SIGN_IN);
const buttonStyle = ref(AppleAuthenticationButtonStyle.BLACK);
const radius = ref(8);
const isNameRequested = ref(true);
const isEmailRequested = ref(true);
const nonce = ref('');
const galleryResult = ref('press the button');

const user = computed(() => credential.value?.user ?? savedUser.value);
const savedUserLabel = computed(() => user.value ?? 'none');
const fullNameLabel = computed(() => {
  const name = credential.value?.fullName;
  return name === null || name === undefined ? 'null' : formatFullName(name, 'medium');
});
const realUserLabel = computed(() => (credential.value === null ? '' : REAL_USER_LABEL[credential.value.realUserStatus]));
const identityTokenLabel = computed(() => preview(credential.value?.identityToken ?? null));
const authCodeLabel = computed(() => preview(credential.value?.authorizationCode ?? null));
const emailLabel = computed(() => credential.value?.email ?? 'null');

const setState = (text: string) => {
  sessionState.value = text;
};

async function signIn(): Promise<void> {
  signInStatus.value = 'waiting for the system sheet…';
  try {
    const value = await signInAsync({ requestedScopes: [AppleAuthenticationScope.FULL_NAME, AppleAuthenticationScope.EMAIL] });
    credential.value = value;
    signInStatus.value = 'signed in, the user id is saved';
    await setItemAsync(USER_KEY, value.user);
  } catch (error) {
    signInStatus.value = `failed: ${describeError(error)}`;
  }
}

const checkState = () =>
  runSessionStep(user.value, async id => CREDENTIAL_STATE_LABEL[await getCredentialStateAsync(id)], setState, SIMULATOR_NOTE);

const runRefresh = () =>
  runSessionStep(user.value, async id => {
    await refreshAsync({ user: id });
    return 'refreshed, new tokens issued';
  }, setState);

const runSignOut = () =>
  runSessionStep(user.value, async id => {
    await signOutAsync({ user: id });
    await deleteItemAsync(USER_KEY);
    savedUser.value = null;
    return 'signed out, the saved user id is deleted';
  }, setState);

async function request(): Promise<void> {
  try {
    const value = await signInAsync({
      requestedScopes: scopesOf(isNameRequested.value, isEmailRequested.value),
      nonce: nonce.value === '' ? undefined : nonce.value,
      state: REQUEST_STATE,
    });
    galleryResult.value = `ok, state echoed: ${value.state ?? 'null'}`;
  } catch (error) {
    galleryResult.value = `failed: ${describeError(error)}`;
  }
}

// Re-read the saved id whenever a new credential arrives
watch(
  credential,
  async () => {
    try {
      savedUser.value = await getItemAsync(USER_KEY);
    } catch {
      savedUser.value = null;
    }
  },
  { immediate: true },
);

let stopRevoke = (): void => {};
onMounted(async () => {
  if (IS_IOS) {
    const subscription = addRevokeListener(() => {
      revokedAt.value = `revoked at ${new Date().toLocaleTimeString()}`;
    });
    stopRevoke = () => subscription.remove();
  }
  try {
    isAvailable.value = String(await isAvailableAsync());
  } catch {
    isAvailable.value = 'error';
  }
});
onBeforeUnmount(() => stopRevoke());
</script>

<template>
  <ScreenShell
    :route="ROUTE"
    testID="apple-authentication-scroll"
    title="Apple Authentication"
    body="Sign in with Apple: the native button, the system sheet, the credential state and the revoke event. iOS only, a real Apple ID is needed."
  >
    <Card
      testID="apple-availability-card"
      title="Is it available?"
    >
      <ResultRow
        testID="apple-available"
        label="isAvailableAsync()"
        :value="isAvailable"
      />
      <text class="hero-body">
        The app needs the Sign in with Apple capability: a .entitlements file with com.apple.developer.applesignin next to Info.plist, and a
        signed build (a development team) for the sheet to open.
      </text>
    </Card>

    <Scenario
      testID="apple-signin-scenario"
      title="Let people sign in without a password"
      why="One tap replaces the sign-up form. The app gets a stable user id and a token for its server, and the user may hide the real email behind an Apple relay address."
      :steps="['Press the Sign in with Apple button', 'Finish the system sheet with Face ID or the Apple ID password', 'Sign in again later and compare the name and email']"
      expect="A credential appears with the user id and tokens. The name and email are filled only the first time for this Apple ID, later sign-ins return null for both: save them on the first run."
    >
      <AppleAuthenticationButton
        v-if="IS_IOS"
        testID="apple-signin-button"
        :buttonType="SIGN_IN_TYPE"
        :buttonStyle="WHITE_STYLE"
        :cornerRadius="8"
        class="apple-button"
        @press="signIn"
      />
      <text
        v-else
        class="hero-body"
      >
        The Apple button renders on iOS only. On Android offer a web based sign in instead.
      </text>
      <ResultRow
        testID="apple-signin-status"
        label="Status"
        :value="signInStatus"
      />
      <ResultRow
        v-if="credential === null"
        testID="apple-credential-empty"
        label="Credential"
        value="none yet"
      />
      <view
        v-else
        testID="apple-credential"
      >
        <ResultRow
          testID="apple-user"
          label="user (stable id)"
          :value="credential.user"
        />
        <ResultRow
          testID="apple-email"
          label="email (first sign-in only)"
          :value="emailLabel"
        />
        <ResultRow
          testID="apple-name"
          label="fullName (first sign-in only)"
          :value="fullNameLabel"
        />
        <ResultRow
          testID="apple-real-user"
          label="realUserStatus"
          :value="realUserLabel"
        />
        <ResultRow
          testID="apple-identity-token"
          label="identityToken (send to your server)"
          :value="identityTokenLabel"
        />
        <ResultRow
          testID="apple-auth-code"
          label="authorizationCode"
          :value="authCodeLabel"
        />
      </view>
    </Scenario>

    <Scenario
      testID="apple-session-scenario"
      title="Keep the user signed in, and notice when they leave"
      why="Apple requires apps to react when someone stops using Sign in with Apple. On every launch ask whether the saved user is still authorized, and listen for a revoke while the app runs."
      :steps="['Press Check credential state after signing in', 'On a device open Settings, Apple ID, Sign in with Apple, pick this app and stop using it', 'Come back to the app']"
      expect="The state reads AUTHORIZED while the user is signed in. After the user stops using the app the revoke line shows a time, and the next check reads REVOKED."
    >
      <ResultRow
        testID="apple-saved-user"
        label="Saved user id"
        :value="savedUserLabel"
      />
      <ResultRow
        testID="apple-credential-state"
        label="getCredentialStateAsync"
        :value="sessionState"
      />
      <ResultRow
        testID="apple-revoke-line"
        label="addRevokeListener"
        :value="revokedAt"
      />
      <view class="button-row">
        <ActionButton
          testID="apple-check-state"
          title="Check credential state"
          :color="color"
          @press="checkState"
        />
        <ActionButton
          testID="apple-refresh"
          title="Refresh"
          :color="color"
          @press="runRefresh"
        />
        <ActionButton
          testID="apple-signout"
          title="Sign out"
          :color="color"
          @press="runSignOut"
        />
      </view>
    </Scenario>

    <Explorer
      testID="apple-explorer"
      :color="color"
    >
      <Card
        testID="apple-gallery"
        title="Button and request options"
      >
        <view
          v-if="IS_IOS"
          class="apple-gallery"
        >
          <AppleAuthenticationButton
            testID="apple-gallery-button"
            :buttonType="type"
            :buttonStyle="buttonStyle"
            :cornerRadius="radius"
            class="apple-button"
            @press="request"
          />
        </view>
        <text
          v-else
          class="hero-body"
        >
          iOS only.
        </text>
        <ChoiceRow
          testID="apple-button-type"
          label="buttonType"
          :color="color"
          :value="type"
          :options="BUTTON_TYPES"
          @change="value => (type = value)"
        />
        <ChoiceRow
          testID="apple-button-style"
          label="buttonStyle"
          :color="color"
          :value="buttonStyle"
          :options="BUTTON_STYLES"
          @change="value => (buttonStyle = value)"
        />
        <ChoiceRow
          testID="apple-button-radius"
          label="cornerRadius"
          :color="color"
          :value="radius"
          :options="RADIUS_OPTIONS"
          @change="value => (radius = value)"
        />
        <ToggleRow
          testID="apple-scope-name"
          label="scope FULL_NAME"
          :value="isNameRequested"
          :color="color"
          @change="value => (isNameRequested = value)"
        />
        <ToggleRow
          testID="apple-scope-email"
          label="scope EMAIL"
          :value="isEmailRequested"
          :color="color"
          @change="value => (isEmailRequested = value)"
        />
        <Field
          testID="apple-nonce"
          label="nonce (guards against replay, hashed into the identity token)"
          :value="nonce"
          @change="value => (nonce = value)"
        />
        <ResultRow
          testID="apple-gallery-result"
          label="Last request"
          :value="galleryResult"
        />
      </Card>
    </Explorer>
  </ScreenShell>
</template>
