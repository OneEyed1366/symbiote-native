import { computed, defineComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue';
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
const color = lineColorOf(ROUTE);
const IS_IOS = Platform.select({ ios: true, default: false });

type ICredentialProp = IAppleAuthenticationCredential | null;
type ISignInProps = { credential: ICredentialProp; onCredential: (value: IAppleAuthenticationCredential) => void };
type ISessionProps = { credential: ICredentialProp };

function CredentialCard(props: { credential: ICredentialProp }) {
  const { credential } = props;
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

const SignInScenario = defineComponent<ISignInProps>(
  props => {
    const status = ref('not signed in');
    const signIn = async () => {
      status.value = 'waiting for the system sheet…';
      try {
        const value = await signInAsync({ requestedScopes: [AppleAuthenticationScope.FULL_NAME, AppleAuthenticationScope.EMAIL] });
        props.onCredential(value);
        status.value = 'signed in, the user id is saved';
        await setItemAsync(USER_KEY, value.user);
      } catch (error: unknown) {
        status.value = `failed: ${describeError(error)}`;
      }
    };

    return () => (
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
            class="apple-button"
            onPress={signIn}
          />
        ) : (
          <text class="hero-body">The Apple button renders on iOS only. On Android offer a web based sign in instead.</text>
        )}
        <ResultRow testID="apple-signin-status" label="Status" value={status.value} />
        <CredentialCard credential={props.credential} />
      </Scenario>
    );
  },
  {
    name: 'SignInScenario',
    props: ['credential', 'onCredential'],
  },
);

const SessionScenario = defineComponent<ISessionProps>(
  props => {
    const savedUser = ref<string | null>(null);
    const state = ref('not checked');
    const revokedAt = ref('no revoke yet');
    const user = computed(() => props.credential?.user ?? savedUser.value);
    const setState = (text: string) => {
      state.value = text;
    };

    // Re-read the saved id whenever a new credential arrives
    watch(
      () => props.credential,
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
    onMounted(() => {
      if (!IS_IOS) {
        return;
      }
      const subscription = addRevokeListener(() => {
        revokedAt.value = `revoked at ${new Date().toLocaleTimeString()}`;
      });
      stopRevoke = () => subscription.remove();
    });
    onBeforeUnmount(() => stopRevoke());

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

    return () => (
      <Scenario
        testID="apple-session-scenario"
        title="Keep the user signed in, and notice when they leave"
        why="Apple requires apps to react when someone stops using Sign in with Apple. On every launch ask whether the saved user is still authorized, and listen for a revoke while the app runs."
        steps={['Press Check credential state after signing in', 'On a device open Settings, Apple ID, Sign in with Apple, pick this app and stop using it', 'Come back to the app']}
        expect="The state reads AUTHORIZED while the user is signed in. After the user stops using the app the revoke line shows a time, and the next check reads REVOKED."
      >
        <ResultRow testID="apple-saved-user" label="Saved user id" value={user.value ?? 'none'} />
        <ResultRow testID="apple-credential-state" label="getCredentialStateAsync" value={state.value} />
        <ResultRow testID="apple-revoke-line" label="addRevokeListener" value={revokedAt.value} />
        <view class="button-row">
          <ActionButton testID="apple-check-state" title="Check credential state" color={color} onPress={checkState} />
          <ActionButton testID="apple-refresh" title="Refresh" color={color} onPress={runRefresh} />
          <ActionButton testID="apple-signout" title="Sign out" color={color} onPress={runSignOut} />
        </view>
      </Scenario>
    );
  },
  {
    name: 'SessionScenario',
    props: ['credential'],
  },
);

const ButtonGallery = defineComponent(
  () => {
    const type = ref(AppleAuthenticationButtonType.SIGN_IN);
    const buttonStyle = ref(AppleAuthenticationButtonStyle.BLACK);
    const radius = ref(8);
    const isNameRequested = ref(true);
    const isEmailRequested = ref(true);
    const nonce = ref('');
    const result = ref('press the button');

    const request = async () => {
      try {
        const value = await signInAsync({
          requestedScopes: scopesOf(isNameRequested.value, isEmailRequested.value),
          nonce: nonce.value === '' ? undefined : nonce.value,
          state: REQUEST_STATE,
        });
        result.value = `ok, state echoed: ${value.state ?? 'null'}`;
      } catch (error: unknown) {
        result.value = `failed: ${describeError(error)}`;
      }
    };

    return () => (
      <Explorer testID="apple-explorer" color={color}>
        <Card testID="apple-gallery" title="Button and request options">
          {IS_IOS ? (
            <view class="apple-gallery">
              <AppleAuthenticationButton testID="apple-gallery-button" buttonType={type.value} buttonStyle={buttonStyle.value} cornerRadius={radius.value} class="apple-button" onPress={request} />
            </view>
          ) : (
            <text class="hero-body">iOS only.</text>
          )}
          <ChoiceRow testID="apple-button-type" label="buttonType" color={color} value={type.value} options={BUTTON_TYPES} onChange={value => { type.value = value; }} />
          <ChoiceRow testID="apple-button-style" label="buttonStyle" color={color} value={buttonStyle.value} options={BUTTON_STYLES} onChange={value => { buttonStyle.value = value; }} />
          <ChoiceRow testID="apple-button-radius" label="cornerRadius" color={color} value={radius.value} options={RADIUS_OPTIONS} onChange={value => { radius.value = value; }} />
          <ToggleRow testID="apple-scope-name" label="scope FULL_NAME" value={isNameRequested.value} onChange={value => { isNameRequested.value = value; }} color={color} />
          <ToggleRow testID="apple-scope-email" label="scope EMAIL" value={isEmailRequested.value} onChange={value => { isEmailRequested.value = value; }} color={color} />
          <Field testID="apple-nonce" label="nonce (guards against replay, hashed into the identity token)" value={nonce.value} onChange={value => { nonce.value = value; }} />
          <ResultRow testID="apple-gallery-result" label="Last request" value={result.value} />
        </Card>
      </Explorer>
    );
  },
  { name: 'ButtonGallery' },
);

export const AppleAuthenticationScreen = defineComponent(
  () => {
    const credential = ref<ICredentialProp>(null);
    const isAvailable = ref('checking…');
    onMounted(async () => {
      try {
        isAvailable.value = String(await isAvailableAsync());
      } catch {
        isAvailable.value = 'error';
      }
    });
    return () => (
      <ScreenShell
        route={ROUTE}
        testID="apple-authentication-scroll"
        title="Apple Authentication"
        body="Sign in with Apple: the native button, the system sheet, the credential state and the revoke event. iOS only, a real Apple ID is needed."
      >
        <Card testID="apple-availability-card" title="Is it available?">
          <ResultRow testID="apple-available" label="isAvailableAsync()" value={isAvailable.value} />
          <text class="hero-body">
            The app needs the Sign in with Apple capability: a .entitlements file with com.apple.developer.applesignin next to Info.plist, and a
            signed build (a development team) for the sheet to open.
          </text>
        </Card>
        <SignInScenario
          credential={credential.value}
          onCredential={(value: IAppleAuthenticationCredential) => {
            credential.value = value;
          }}
        />
        <SessionScenario credential={credential.value} />
        <ButtonGallery />
      </ScreenShell>
    );
  },
  { name: 'AppleAuthenticationScreen' },
);
