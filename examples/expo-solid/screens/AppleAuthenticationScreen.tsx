import { Show, createEffect, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import { Platform } from '@symbiote-native/solid';
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
} from '@symbiote-native/apple-authentication/solid';
import type { IAppleAuthenticationCredential } from '@symbiote-native/apple-authentication/solid';
import { deleteItemAsync, getItemAsync, setItemAsync } from '@symbiote-native/secure-store';
import { ActionButton } from '../components/ActionButton';
import { Explorer, Scenario } from '../components/Scenario';
import { Card, ChoiceRow, Field, ResultRow, ScreenShell, ToggleRow, lineColorOf } from '../components/ScreenShell';
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
const IS_IOS = Platform.select({ ios: true, default: false });

function CredentialCard(props: { credential: IAppleAuthenticationCredential | null }) {
  return (
    <Show
      when={props.credential}
      fallback={<ResultRow testID="apple-credential-empty" label="Credential" value="none yet" />}
    >
      {credential => (
        <view testID="apple-credential">
          <ResultRow testID="apple-user" label="user (stable id)" value={credential().user} />
          <ResultRow testID="apple-email" label="email (first sign-in only)" value={credential().email ?? 'null'} />
          <ResultRow testID="apple-name" label="fullName (first sign-in only)" value={credential().fullName === null ? 'null' : formatFullName(credential().fullName, 'medium')} />
          <ResultRow testID="apple-real-user" label="realUserStatus" value={REAL_USER_LABEL[credential().realUserStatus]} />
          <ResultRow testID="apple-identity-token" label="identityToken (send to your server)" value={preview(credential().identityToken)} />
          <ResultRow testID="apple-auth-code" label="authorizationCode" value={preview(credential().authorizationCode)} />
        </view>
      )}
    </Show>
  );
}

function SignInScenario(props: { onCredential: (value: IAppleAuthenticationCredential) => void; credential: IAppleAuthenticationCredential | null }) {
  const [status, setStatus] = createSignal('not signed in');
  const signIn = async () => {
    setStatus('waiting for the system sheet…');
    try {
      const value = await signInAsync({ requestedScopes: [AppleAuthenticationScope.FULL_NAME, AppleAuthenticationScope.EMAIL] });
      props.onCredential(value);
      setStatus('signed in, the user id is saved');
      await setItemAsync(USER_KEY, value.user);
    } catch (error: unknown) {
      setStatus(`failed: ${describeError(error)}`);
    }
  };

  return (
    <Scenario
      testID="apple-signin-scenario"
      title="Let people sign in without a password"
      why="One tap replaces the sign-up form. The app gets a stable user id and a token for its server, and the user may hide the real email behind an Apple relay address."
      steps={['Press the Sign in with Apple button', 'Finish the system sheet with Face ID or the Apple ID password', 'Sign in again later and compare the name and email']}
      expect="A credential appears with the user id and tokens. The name and email are filled only the first time for this Apple ID, later sign-ins return null for both: save them on the first run."
    >
      <Show when={IS_IOS} fallback={<text class="hero-body">The Apple button renders on iOS only. On Android offer a web based sign in instead.</text>}>
        <AppleAuthenticationButton
          testID="apple-signin-button"
          buttonType={AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={AppleAuthenticationButtonStyle.WHITE}
          cornerRadius={8}
          class="apple-button"
          onPress={signIn}
        />
      </Show>
      <ResultRow testID="apple-signin-status" label="Status" value={status()} />
      <CredentialCard credential={props.credential} />
    </Scenario>
  );
}

function SessionScenario(props: { credential: IAppleAuthenticationCredential | null; color: string }) {
  const [savedUser, setSavedUser] = createSignal<string | null>(null);
  const [state, setState] = createSignal('not checked');
  const [revokedAt, setRevokedAt] = createSignal('no revoke yet');
  const user = createMemo(() => props.credential?.user ?? savedUser());

  createEffect(async () => {
    // Re-read the saved id whenever a new credential arrives
    void props.credential;
    try {
      setSavedUser(await getItemAsync(USER_KEY));
    } catch {
      setSavedUser(null);
    }
  });
  onMount(() => {
    if (!IS_IOS) {
      return;
    }
    const subscription = addRevokeListener(() => setRevokedAt(`revoked at ${new Date().toLocaleTimeString()}`));
    onCleanup(() => subscription.remove());
  });

  const checkState = () =>
    runSessionStep(user(), async id => CREDENTIAL_STATE_LABEL[await getCredentialStateAsync(id)], setState, SIMULATOR_NOTE);

  const runRefresh = () =>
    runSessionStep(user(), async id => {
      await refreshAsync({ user: id });
      return 'refreshed, new tokens issued';
    }, setState);

  const runSignOut = () =>
    runSessionStep(user(), async id => {
      await signOutAsync({ user: id });
      await deleteItemAsync(USER_KEY);
      setSavedUser(null);
      return 'signed out, the saved user id is deleted';
    }, setState);

  return (
    <Scenario
      testID="apple-session-scenario"
      title="Keep the user signed in, and notice when they leave"
      why="Apple requires apps to react when someone stops using Sign in with Apple. On every launch ask whether the saved user is still authorized, and listen for a revoke while the app runs."
      steps={['Press Check credential state after signing in', 'On a device open Settings, Apple ID, Sign in with Apple, pick this app and stop using it', 'Come back to the app']}
      expect="The state reads AUTHORIZED while the user is signed in. After the user stops using the app the revoke line shows a time, and the next check reads REVOKED."
    >
      <ResultRow testID="apple-saved-user" label="Saved user id" value={user() ?? 'none'} />
      <ResultRow testID="apple-credential-state" label="getCredentialStateAsync" value={state()} />
      <ResultRow testID="apple-revoke-line" label="addRevokeListener" value={revokedAt()} />
      <view class="button-row">
        <ActionButton testID="apple-check-state" title="Check credential state" color={props.color} onPress={checkState} />
        <ActionButton testID="apple-refresh" title="Refresh" color={props.color} onPress={runRefresh} />
        <ActionButton testID="apple-signout" title="Sign out" color={props.color} onPress={runSignOut} />
      </view>
    </Scenario>
  );
}

function ButtonGallery(props: { color: string }) {
  const [type, setType] = createSignal(AppleAuthenticationButtonType.SIGN_IN);
  const [buttonStyle, setButtonStyle] = createSignal(AppleAuthenticationButtonStyle.BLACK);
  const [radius, setRadius] = createSignal(8);
  const [isNameRequested, setIsNameRequested] = createSignal(true);
  const [isEmailRequested, setIsEmailRequested] = createSignal(true);
  const [nonce, setNonce] = createSignal('');
  const [result, setResult] = createSignal('press the button');

  const request = async () => {
    try {
      const value = await signInAsync({
        requestedScopes: scopesOf(isNameRequested(), isEmailRequested()),
        nonce: nonce() === '' ? undefined : nonce(),
        state: REQUEST_STATE,
      });
      setResult(`ok, state echoed: ${value.state ?? 'null'}`);
    } catch (error: unknown) {
      setResult(`failed: ${describeError(error)}`);
    }
  };

  return (
    <Explorer testID="apple-explorer" color={props.color}>
      <Card testID="apple-gallery" title="Button and request options">
        <Show when={IS_IOS} fallback={<text class="hero-body">iOS only.</text>}>
          <view class="apple-gallery">
            <AppleAuthenticationButton testID="apple-gallery-button" buttonType={type()} buttonStyle={buttonStyle()} cornerRadius={radius()} class="apple-button" onPress={request} />
          </view>
        </Show>
        <ChoiceRow testID="apple-button-type" label="buttonType" color={props.color} value={type()} options={BUTTON_TYPES} onChange={setType} />
        <ChoiceRow testID="apple-button-style" label="buttonStyle" color={props.color} value={buttonStyle()} options={BUTTON_STYLES} onChange={setButtonStyle} />
        <ChoiceRow testID="apple-button-radius" label="cornerRadius" color={props.color} value={radius()} options={RADIUS_OPTIONS} onChange={setRadius} />
        <ToggleRow testID="apple-scope-name" label="scope FULL_NAME" value={isNameRequested()} onChange={setIsNameRequested} color={props.color} />
        <ToggleRow testID="apple-scope-email" label="scope EMAIL" value={isEmailRequested()} onChange={setIsEmailRequested} color={props.color} />
        <Field testID="apple-nonce" label="nonce (guards against replay, hashed into the identity token)" value={nonce()} onChange={setNonce} />
        <ResultRow testID="apple-gallery-result" label="Last request" value={result()} />
      </Card>
    </Explorer>
  );
}

export function AppleAuthenticationScreen() {
  const color = lineColorOf(ROUTE);
  const [credential, setCredential] = createSignal<IAppleAuthenticationCredential | null>(null);
  const [isAvailable, setIsAvailable] = createSignal('checking…');
  onMount(async () => {
    try {
      setIsAvailable(String(await isAvailableAsync()));
    } catch {
      setIsAvailable('error');
    }
  });
  return (
    <ScreenShell
      route={ROUTE}
      testID="apple-authentication-scroll"
      title="Apple Authentication"
      body="Sign in with Apple: the native button, the system sheet, the credential state and the revoke event. iOS only, a real Apple ID is needed."
    >
      <Card testID="apple-availability-card" title="Is it available?">
        <ResultRow testID="apple-available" label="isAvailableAsync()" value={isAvailable()} />
        <text class="hero-body">
          The app needs the Sign in with Apple capability: a .entitlements file with com.apple.developer.applesignin next to Info.plist, and a
          signed build (a development team) for the sheet to open.
        </text>
      </Card>
      <SignInScenario credential={credential()} onCredential={setCredential} />
      <SessionScenario credential={credential()} color={color} />
      <ButtonGallery color={color} />
    </ScreenShell>
  );
}
