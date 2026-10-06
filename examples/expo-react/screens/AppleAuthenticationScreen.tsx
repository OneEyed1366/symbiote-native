import { useCallback, useEffect, useState } from 'react';
import { Platform } from '@symbiote-native/react';
import {
  AppleAuthenticationButton,
  AppleAuthenticationButtonStyle,
  AppleAuthenticationButtonType,
  AppleAuthenticationCredentialState,
  AppleAuthenticationScope,
  AppleAuthenticationUserDetectionStatus,
  addRevokeListener,
  formatFullName,
  getCredentialStateAsync,
  isAvailableAsync,
  refreshAsync,
  signInAsync,
  signOutAsync,
} from '@symbiote-native/apple-authentication/react';
import type { IAppleAuthenticationCredential } from '@symbiote-native/apple-authentication/react';
import { deleteItemAsync, getItemAsync, setItemAsync } from '@symbiote-native/secure-store';
import { ActionButton } from '../components/ActionButton';
import { Explorer, Scenario } from '../components/Scenario';
import { Card, ChoiceRow, Field, ResultRow, ScreenShell, ToggleRow, lineColorOf } from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';

const ROUTE = ROUTE_NAME.AppleAuthentication;
const USER_KEY = 'canary.apple-auth.user';
const TOKEN_PREVIEW_CHARS = 12;
const BUTTON_HEIGHT = 44;
const IS_IOS = Platform.select({ ios: true, default: false });

const CREDENTIAL_STATE_LABEL: Record<AppleAuthenticationCredentialState, string> = {
  [AppleAuthenticationCredentialState.REVOKED]: 'REVOKED: the user stopped using Sign in with Apple, log them out',
  [AppleAuthenticationCredentialState.AUTHORIZED]: 'AUTHORIZED: keep the user signed in',
  [AppleAuthenticationCredentialState.NOT_FOUND]: 'NOT_FOUND: no such user on this device, show sign in',
  [AppleAuthenticationCredentialState.TRANSFERRED]: 'TRANSFERRED: the app moved to another team, migrate the user',
};

const REAL_USER_LABEL: Record<AppleAuthenticationUserDetectionStatus, string> = {
  [AppleAuthenticationUserDetectionStatus.UNSUPPORTED]: 'unsupported',
  [AppleAuthenticationUserDetectionStatus.UNKNOWN]: 'unknown',
  [AppleAuthenticationUserDetectionStatus.LIKELY_REAL]: 'likely a real person',
};

const BUTTON_TYPES = [
  { label: 'sign in', value: AppleAuthenticationButtonType.SIGN_IN },
  { label: 'continue', value: AppleAuthenticationButtonType.CONTINUE },
  { label: 'sign up', value: AppleAuthenticationButtonType.SIGN_UP },
];
const BUTTON_STYLES = [
  { label: 'black', value: AppleAuthenticationButtonStyle.BLACK },
  { label: 'white', value: AppleAuthenticationButtonStyle.WHITE },
  { label: 'outline', value: AppleAuthenticationButtonStyle.WHITE_OUTLINE },
];

function describeError(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }
  const code: unknown = Reflect.get(error, 'code');
  return typeof code === 'string' ? `${code}: ${error.message}` : error.message;
}

function preview(token: string | null): string {
  return token === null ? 'null' : `${token.slice(0, TOKEN_PREVIEW_CHARS)}… (${token.length} chars)`;
}

function CredentialCard({ credential }: { credential: IAppleAuthenticationCredential | null }) {
  if (credential === null) {
    return <ResultRow testID="apple-credential-empty" label="Credential" value="none yet" />;
  }
  return (
    <view testID="apple-credential">
      <ResultRow testID="apple-user" label="user (stable id)" value={credential.user} />
      <ResultRow testID="apple-email" label="email (first sign-in only)" value={credential.email ?? 'null'} />
      <ResultRow testID="apple-name" label="fullName (first sign-in only)" value={credential.fullName === null ? 'null' : formatFullName(credential.fullName, 'medium')} />
      <ResultRow testID="apple-real-user" label="realUserStatus" value={REAL_USER_LABEL[credential.realUserStatus]} />
      <ResultRow testID="apple-identity-token" label="identityToken (send to your server)" value={preview(credential.identityToken)} />
      <ResultRow testID="apple-auth-code" label="authorizationCode" value={preview(credential.authorizationCode)} />
    </view>
  );
}

function SignInScenario({ onCredential, credential }: { onCredential: (value: IAppleAuthenticationCredential) => void; credential: IAppleAuthenticationCredential | null }) {
  const [status, setStatus] = useState('not signed in');
  const signIn = useCallback(() => {
    setStatus('waiting for the system sheet…');
    signInAsync({ requestedScopes: [AppleAuthenticationScope.FULL_NAME, AppleAuthenticationScope.EMAIL] })
      .then(value => {
        onCredential(value);
        setStatus('signed in, the user id is saved');
        return setItemAsync(USER_KEY, value.user);
      })
      .catch((error: unknown) => setStatus(`failed: ${describeError(error)}`));
  }, [onCredential]);

  return (
    <Scenario
      testID="apple-signin-scenario"
      title="Let people sign in without a password"
      why="One tap replaces the sign-up form. The app gets a stable user id and a token for its server, and the user may hide the real email behind an Apple relay address."
      steps={['Press the Sign in with Apple button', 'Finish the system sheet with Face ID or the Apple ID password', 'Sign in again later and compare the name and email']}
      expect="A credential appears with the user id and tokens. The name and email are filled only the first time for this Apple ID, later sign-ins return null for both: save them on the first run."
    >
      {IS_IOS ? (
        <AppleAuthenticationButton
          testID="apple-signin-button"
          buttonType={AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={AppleAuthenticationButtonStyle.WHITE}
          cornerRadius={8}
          className="apple-button"
          onPress={signIn}
        />
      ) : (
        <text className="hero-body">The Apple button renders on iOS only. On Android offer a web based sign in instead.</text>
      )}
      <ResultRow testID="apple-signin-status" label="Status" value={status} />
      <CredentialCard credential={credential} />
    </Scenario>
  );
}

function SessionScenario({ credential, color }: { credential: IAppleAuthenticationCredential | null; color: string }) {
  const [savedUser, setSavedUser] = useState<string | null>(null);
  const [state, setState] = useState('not checked');
  const [revokedAt, setRevokedAt] = useState('no revoke yet');
  const user = credential?.user ?? savedUser;

  useEffect(() => {
    getItemAsync(USER_KEY).then(setSavedUser).catch(() => setSavedUser(null));
  }, [credential]);
  useEffect(() => {
    if (!IS_IOS) {
      return undefined;
    }
    const subscription = addRevokeListener(() => setRevokedAt(`revoked at ${new Date().toLocaleTimeString()}`));
    return () => subscription.remove();
  }, []);

  const checkState = useCallback(() => {
    if (user === null) {
      setState('sign in first');
      return;
    }
    getCredentialStateAsync(user)
      .then(value => setState(CREDENTIAL_STATE_LABEL[value]))
      .catch((error: unknown) => setState(`failed: ${describeError(error)} (the simulator always throws, use a device)`));
  }, [user]);

  const runRefresh = useCallback(() => {
    if (user === null) {
      setState('sign in first');
      return;
    }
    refreshAsync({ user })
      .then(() => setState('refreshed, new tokens issued'))
      .catch((error: unknown) => setState(`failed: ${describeError(error)}`));
  }, [user]);

  const runSignOut = useCallback(() => {
    if (user === null) {
      setState('sign in first');
      return;
    }
    signOutAsync({ user })
      .then(() => deleteItemAsync(USER_KEY))
      .then(() => {
        setSavedUser(null);
        setState('signed out, the saved user id is deleted');
      })
      .catch((error: unknown) => setState(`failed: ${describeError(error)}`));
  }, [user]);

  return (
    <Scenario
      testID="apple-session-scenario"
      title="Keep the user signed in, and notice when they leave"
      why="Apple requires apps to react when someone stops using Sign in with Apple. On every launch ask whether the saved user is still authorized, and listen for a revoke while the app runs."
      steps={['Press Check credential state after signing in', 'On a device open Settings, Apple ID, Sign in with Apple, pick this app and stop using it', 'Come back to the app']}
      expect="The state reads AUTHORIZED while the user is signed in. After the user stops using the app the revoke line shows a time, and the next check reads REVOKED."
    >
      <ResultRow testID="apple-saved-user" label="Saved user id" value={user ?? 'none'} />
      <ResultRow testID="apple-credential-state" label="getCredentialStateAsync" value={state} />
      <ResultRow testID="apple-revoke-line" label="addRevokeListener" value={revokedAt} />
      <view className="button-row">
        <ActionButton testID="apple-check-state" title="Check credential state" color={color} onPress={checkState} />
        <ActionButton testID="apple-refresh" title="Refresh" color={color} onPress={runRefresh} />
        <ActionButton testID="apple-signout" title="Sign out" color={color} onPress={runSignOut} />
      </view>
    </Scenario>
  );
}

function ButtonGallery({ color }: { color: string }) {
  const [type, setType] = useState(AppleAuthenticationButtonType.SIGN_IN);
  const [buttonStyle, setButtonStyle] = useState(AppleAuthenticationButtonStyle.BLACK);
  const [radius, setRadius] = useState(8);
  const [isNameRequested, setIsNameRequested] = useState(true);
  const [isEmailRequested, setIsEmailRequested] = useState(true);
  const [nonce, setNonce] = useState('');
  const [result, setResult] = useState('press the button');

  const request = useCallback(() => {
    const requestedScopes = [
      ...(isNameRequested ? [AppleAuthenticationScope.FULL_NAME] : []),
      ...(isEmailRequested ? [AppleAuthenticationScope.EMAIL] : []),
    ];
    signInAsync({ requestedScopes, nonce: nonce === '' ? undefined : nonce, state: 'canary-state' })
      .then(value => setResult(`ok, state echoed: ${value.state ?? 'null'}`))
      .catch((error: unknown) => setResult(`failed: ${describeError(error)}`));
  }, [isNameRequested, isEmailRequested, nonce]);

  return (
    <Explorer testID="apple-explorer" color={color}>
      <Card testID="apple-gallery" title="Button and request options">
        {IS_IOS ? (
          <view className="apple-gallery">
            <AppleAuthenticationButton testID="apple-gallery-button" buttonType={type} buttonStyle={buttonStyle} cornerRadius={radius} className="apple-button" onPress={request} />
          </view>
        ) : (
          <text className="hero-body">iOS only.</text>
        )}
        <ChoiceRow testID="apple-button-type" label="buttonType" color={color} value={type} options={BUTTON_TYPES} onChange={setType} />
        <ChoiceRow testID="apple-button-style" label="buttonStyle" color={color} value={buttonStyle} options={BUTTON_STYLES} onChange={setButtonStyle} />
        <ChoiceRow testID="apple-button-radius" label="cornerRadius" color={color} value={radius} options={[0, 8, 22].map(item => ({ label: String(item), value: item }))} onChange={setRadius} />
        <ToggleRow testID="apple-scope-name" label="scope FULL_NAME" value={isNameRequested} onChange={setIsNameRequested} color={color} />
        <ToggleRow testID="apple-scope-email" label="scope EMAIL" value={isEmailRequested} onChange={setIsEmailRequested} color={color} />
        <Field testID="apple-nonce" label="nonce (guards against replay, hashed into the identity token)" value={nonce} onChange={setNonce} />
        <ResultRow testID="apple-gallery-result" label="Last request" value={result} />
      </Card>
    </Explorer>
  );
}

export function AppleAuthenticationScreen() {
  const color = lineColorOf(ROUTE);
  const [credential, setCredential] = useState<IAppleAuthenticationCredential | null>(null);
  const [isAvailable, setIsAvailable] = useState('checking…');
  useEffect(() => {
    isAvailableAsync().then(value => setIsAvailable(String(value))).catch(() => setIsAvailable('error'));
  }, []);
  return (
    <ScreenShell
      route={ROUTE}
      testID="apple-authentication-scroll"
      title="Apple Authentication"
      body="Sign in with Apple: the native button, the system sheet, the credential state and the revoke event. iOS only, a real Apple ID is needed."
    >
      <Card testID="apple-availability-card" title="Is it available?">
        <ResultRow testID="apple-available" label="isAvailableAsync()" value={isAvailable} />
        <text className="hero-body">
          The app needs the Sign in with Apple capability: a .entitlements file with com.apple.developer.applesignin next to Info.plist, and a
          signed build (a development team) for the sheet to open.
        </text>
      </Card>
      <SignInScenario credential={credential} onCredential={setCredential} />
      <SessionScenario credential={credential} color={color} />
      <ButtonGallery color={color} />
    </ScreenShell>
  );
}
