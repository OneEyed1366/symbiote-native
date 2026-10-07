<script lang="ts">
  import { onMount } from 'svelte';
  import { Platform } from '@symbiote-native/svelte';
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
  } from '@symbiote-native/apple-authentication/svelte';
  import type { IAppleAuthenticationCredential } from '@symbiote-native/apple-authentication/svelte';
  import { deleteItemAsync, getItemAsync, setItemAsync } from '@symbiote-native/secure-store';
  import ActionButton from '../components/ActionButton.svelte';
  import Card from '../components/Card.svelte';
  import ChoiceRow from '../components/ChoiceRow.svelte';
  import Explorer from '../components/Explorer.svelte';
  import Field from '../components/Field.svelte';
  import ResultRow from '../components/ResultRow.svelte';
  import Scenario from '../components/Scenario.svelte';
  import ScreenShell from '../components/ScreenShell.svelte';
  import ToggleRow from '../components/ToggleRow.svelte';
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

  let credential = $state<IAppleAuthenticationCredential | null>(null);
  let isAvailable = $state('checking…');
  let signInStatus = $state('not signed in');
  let savedUser = $state<string | null>(null);
  let sessionState = $state('not checked');
  let revokedAt = $state('no revoke yet');
  let type = $state(AppleAuthenticationButtonType.SIGN_IN);
  let buttonStyle = $state(AppleAuthenticationButtonStyle.BLACK);
  let radius = $state(8);
  let isNameRequested = $state(true);
  let isEmailRequested = $state(true);
  let nonce = $state('');
  let galleryResult = $state('press the button');

  const user = $derived(credential?.user ?? savedUser);

  async function signIn(): Promise<void> {
    signInStatus = 'waiting for the system sheet…';
    try {
      const value = await signInAsync({ requestedScopes: [AppleAuthenticationScope.FULL_NAME, AppleAuthenticationScope.EMAIL] });
      credential = value;
      signInStatus = 'signed in, the user id is saved';
      await setItemAsync(USER_KEY, value.user);
    } catch (error) {
      signInStatus = `failed: ${describeError(error)}`;
    }
  }

  async function readSavedUser(): Promise<void> {
    try {
      savedUser = await getItemAsync(USER_KEY);
    } catch {
      savedUser = null;
    }
  }

  const setState = (text: string) => (sessionState = text);

  const checkState = () =>
    runSessionStep(user, async id => CREDENTIAL_STATE_LABEL[await getCredentialStateAsync(id)], setState, SIMULATOR_NOTE);

  const runRefresh = () =>
    runSessionStep(user, async id => {
      await refreshAsync({ user: id });
      return 'refreshed, new tokens issued';
    }, setState);

  const runSignOut = () =>
    runSessionStep(user, async id => {
      await signOutAsync({ user: id });
      await deleteItemAsync(USER_KEY);
      savedUser = null;
      return 'signed out, the saved user id is deleted';
    }, setState);

  async function request(): Promise<void> {
    try {
      const value = await signInAsync({
        requestedScopes: scopesOf(isNameRequested, isEmailRequested),
        nonce: nonce === '' ? undefined : nonce,
        state: REQUEST_STATE,
      });
      galleryResult = `ok, state echoed: ${value.state ?? 'null'}`;
    } catch (error) {
      galleryResult = `failed: ${describeError(error)}`;
    }
  }

  // Re-read the saved id whenever a new credential arrives
  $effect(() => {
    void credential;
    void readSavedUser();
  });

  $effect(() => {
    if (!IS_IOS) {
      return undefined;
    }
    const subscription = addRevokeListener(() => (revokedAt = `revoked at ${new Date().toLocaleTimeString()}`));
    return () => subscription.remove();
  });

  onMount(async () => {
    try {
      isAvailable = String(await isAvailableAsync());
    } catch {
      isAvailable = 'error';
    }
  });
</script>

<ScreenShell
  route={ROUTE}
  testID="apple-authentication-scroll"
  title="Apple Authentication"
  body="Sign in with Apple: the native button, the system sheet, the credential state and the revoke event. iOS only, a real Apple ID is needed."
>
  <Card testID="apple-availability-card" title="Is it available?">
    <ResultRow testID="apple-available" label="isAvailableAsync()" value={isAvailable} />
    <text class="hero-body">
      The app needs the Sign in with Apple capability: a .entitlements file with com.apple.developer.applesignin next to Info.plist, and a
      signed build (a development team) for the sheet to open.
    </text>
  </Card>

  <Scenario
    testID="apple-signin-scenario"
    title="Let people sign in without a password"
    why="One tap replaces the sign-up form. The app gets a stable user id and a token for its server, and the user may hide the real email behind an Apple relay address."
    steps={['Press the Sign in with Apple button', 'Finish the system sheet with Face ID or the Apple ID password', 'Sign in again later and compare the name and email']}
    expect="A credential appears with the user id and tokens. The name and email are filled only the first time for this Apple ID, later sign-ins return null for both: save them on the first run."
  >
    {#if IS_IOS}
      <AppleAuthenticationButton
        testID="apple-signin-button"
        buttonType={AppleAuthenticationButtonType.SIGN_IN}
        buttonStyle={AppleAuthenticationButtonStyle.WHITE}
        cornerRadius={8}
        class="apple-button"
        onPress={signIn}
      />
    {:else}
      <text class="hero-body">The Apple button renders on iOS only. On Android offer a web based sign in instead.</text>
    {/if}
    <ResultRow testID="apple-signin-status" label="Status" value={signInStatus} />
    {#if credential === null}
      <ResultRow testID="apple-credential-empty" label="Credential" value="none yet" />
    {:else}
      <view testID="apple-credential">
        <ResultRow testID="apple-user" label="user (stable id)" value={credential.user} />
        <ResultRow testID="apple-email" label="email (first sign-in only)" value={credential.email ?? 'null'} />
        <ResultRow testID="apple-name" label="fullName (first sign-in only)" value={credential.fullName === null ? 'null' : formatFullName(credential.fullName, 'medium')} />
        <ResultRow testID="apple-real-user" label="realUserStatus" value={REAL_USER_LABEL[credential.realUserStatus]} />
        <ResultRow testID="apple-identity-token" label="identityToken (send to your server)" value={preview(credential.identityToken)} />
        <ResultRow testID="apple-auth-code" label="authorizationCode" value={preview(credential.authorizationCode)} />
      </view>
    {/if}
  </Scenario>

  <Scenario
    testID="apple-session-scenario"
    title="Keep the user signed in, and notice when they leave"
    why="Apple requires apps to react when someone stops using Sign in with Apple. On every launch ask whether the saved user is still authorized, and listen for a revoke while the app runs."
    steps={['Press Check credential state after signing in', 'On a device open Settings, Apple ID, Sign in with Apple, pick this app and stop using it', 'Come back to the app']}
    expect="The state reads AUTHORIZED while the user is signed in. After the user stops using the app the revoke line shows a time, and the next check reads REVOKED."
  >
    <ResultRow testID="apple-saved-user" label="Saved user id" value={user ?? 'none'} />
    <ResultRow testID="apple-credential-state" label="getCredentialStateAsync" value={sessionState} />
    <ResultRow testID="apple-revoke-line" label="addRevokeListener" value={revokedAt} />
    <view class="button-row">
      <ActionButton testID="apple-check-state" title="Check credential state" {color} onPress={checkState} />
      <ActionButton testID="apple-refresh" title="Refresh" {color} onPress={runRefresh} />
      <ActionButton testID="apple-signout" title="Sign out" {color} onPress={runSignOut} />
    </view>
  </Scenario>

  <Explorer testID="apple-explorer" {color}>
    <Card testID="apple-gallery" title="Button and request options">
      {#if IS_IOS}
        <view class="apple-gallery">
          <AppleAuthenticationButton testID="apple-gallery-button" buttonType={type} {buttonStyle} cornerRadius={radius} class="apple-button" onPress={request} />
        </view>
      {:else}
        <text class="hero-body">iOS only.</text>
      {/if}
      <ChoiceRow testID="apple-button-type" label="buttonType" {color} value={type} options={BUTTON_TYPES} onChange={value => (type = value)} />
      <ChoiceRow testID="apple-button-style" label="buttonStyle" {color} value={buttonStyle} options={BUTTON_STYLES} onChange={value => (buttonStyle = value)} />
      <ChoiceRow testID="apple-button-radius" label="cornerRadius" {color} value={radius} options={RADIUS_OPTIONS} onChange={value => (radius = value)} />
      <ToggleRow testID="apple-scope-name" label="scope FULL_NAME" value={isNameRequested} onChange={value => (isNameRequested = value)} {color} />
      <ToggleRow testID="apple-scope-email" label="scope EMAIL" value={isEmailRequested} onChange={value => (isEmailRequested = value)} {color} />
      <Field testID="apple-nonce" label="nonce (guards against replay, hashed into the identity token)" value={nonce} onChange={value => (nonce = value)} />
      <ResultRow testID="apple-gallery-result" label="Last request" value={galleryResult} />
    </Card>
  </Explorer>
</ScreenShell>
