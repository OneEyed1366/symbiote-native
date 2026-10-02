import { defineComponent, ref, shallowRef } from 'vue';
import type {
  IDiscoveryDocument,
  TokenResponse,
} from '@symbiote-native/auth-session/vue';
import { Explorer, Scenario } from '../components/Scenario';
import { ScreenShell, lineColorOf } from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';
import { ProviderCards } from './auth-session-providers';
import {
  ConfigCard,
  DiscoveryCard,
  HookFlowCard,
  INITIAL_FORM,
  ManualFlowCard,
  RedirectCard,
  ResultCard,
} from './auth-session-request';
import type { IForm, ISetForm } from './auth-session-request';
import { TokenCards } from './auth-session-tokens';

export const AuthSessionScreen = defineComponent(
  () => {
    const form = ref<IForm>(INITIAL_FORM);
    const discovery = shallowRef<IDiscoveryDocument | null>(null);
    const token = shallowRef<TokenResponse | null>(null);
    const result = shallowRef<unknown>(null);
    const setForm: ISetForm = patch => {
      form.value = { ...form.value, ...patch };
    };
    const setDiscovery = (next: IDiscoveryDocument | null) => {
      discovery.value = next;
    };
    const setToken = (next: TokenResponse | null) => {
      token.value = next;
    };
    const setResult = (next: unknown) => {
      result.value = next;
    };

    return () => (
      <ScreenShell
        route={ROUTE_NAME.AuthSession}
        testID="auth-session-scroll"
        title="Auth Session"
        body="Sign users in with any OAuth 2 or OpenID Connect provider through the system browser, with PKCE, token exchange and refresh. Ready-made flows for Google and Facebook."
      >
        <Scenario
          testID="auth-session-scenario"
          title="Sign in with an identity provider"
          why="Let users log in with their existing account. The provider page opens in a secure browser, your app receives a code, exchanges it for tokens and never sees the password."
          steps={['Set the redirect scheme (canaryexpo is registered in this app)', 'Enter the provider issuer and your client id below', 'Press the manual flow button and sign in']}
          expect="The result card shows the authorization code or an error from the provider. The token cards below exchange and refresh it."
        />
        <RedirectCard form={form.value} setForm={setForm} />
        <DiscoveryCard form={form.value} setForm={setForm} discovery={discovery.value} setDiscovery={setDiscovery} />
        <ConfigCard form={form.value} setForm={setForm} />
        <ManualFlowCard form={form.value} discovery={discovery.value} onResult={setResult} />
        <ResultCard result={result.value} />
        <Explorer testID="auth-session-explorer" color={lineColorOf(ROUTE_NAME.AuthSession)}>
          <HookFlowCard form={form.value} discovery={discovery.value} onResult={setResult} />
          <TokenCards form={form.value} discovery={discovery.value} token={token.value} setToken={setToken} />
          <ProviderCards />
        </Explorer>
      </ScreenShell>
    );
  },
  { name: 'AuthSessionScreen' },
);
