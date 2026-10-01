import {
  CodeChallengeMethod,
  Prompt,
  ResponseType,
} from '@symbiote-native/auth-session/vue';
import type { IAuthRequestConfig } from '@symbiote-native/auth-session/vue';

export const NO_PROMPT = 'no prompt';

export type IForm = {
  issuer: string;
  clientId: string;
  redirectUri: string;
  scopes: string;
  clientSecret: string;
  responseType: ResponseType;
  codeChallengeMethod: CodeChallengeMethod;
  prompt: Prompt | typeof NO_PROMPT;
  state: string;
  extraParams: string;
  usePKCE: boolean;
  scheme: string;
  path: string;
  queryParams: string;
  isTripleSlashed: boolean;
  preferLocalhost: boolean;
  native: string;
};
export type ISetForm = (patch: Partial<IForm>) => void;

export const INITIAL_FORM: IForm = {
  issuer: 'https://demo.duendesoftware.com',
  clientId: 'interactive.public',
  redirectUri: '',
  scopes: 'openid profile email',
  clientSecret: '',
  responseType: ResponseType.Code,
  codeChallengeMethod: CodeChallengeMethod.S256,
  prompt: NO_PROMPT,
  state: '',
  extraParams: '',
  usePKCE: true,
  scheme: 'canaryexpo',
  path: 'redirect',
  queryParams: '',
  isTripleSlashed: false,
  preferLocalhost: false,
  native: '',
};

export function choices<T extends string>(
  values: readonly T[],
): { label: T; value: T }[] {
  return values.map(value => ({ label: value, value }));
}

export function optional(text: string): string | undefined {
  return text.trim() === '' ? undefined : text.trim();
}

export function parseRecord(text: string): Record<string, string> | undefined {
  if (text.trim() === '') {
    return undefined;
  }
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('expected a JSON object');
  }
  return Object.fromEntries(
    Object.entries(parsed).map(([key, value]) => [key, String(value)]),
  );
}

export function toRequestConfig(form: IForm): IAuthRequestConfig {
  return {
    clientId: form.clientId,
    redirectUri: form.redirectUri,
    scopes: form.scopes.split(' ').filter(scope => scope !== ''),
    clientSecret: optional(form.clientSecret),
    responseType: form.responseType,
    codeChallengeMethod: form.codeChallengeMethod,
    prompt: form.prompt === NO_PROMPT ? undefined : form.prompt,
    state: optional(form.state),
    extraParams: parseRecord(form.extraParams),
    usePKCE: form.usePKCE,
  };
}

export function redirectOptions(form: IForm) {
  return {
    scheme: optional(form.scheme),
    path: optional(form.path),
    queryParams: parseRecord(form.queryParams),
    isTripleSlashed: form.isTripleSlashed,
    preferLocalhost: form.preferLocalhost,
    native: optional(form.native),
  };
}

export const RESPONSE_TYPE_CHOICES = choices(Object.values(ResponseType));
export const CHALLENGE_METHOD_CHOICES = choices(
  Object.values(CodeChallengeMethod),
);
export const PROMPT_CHOICES = choices<Prompt | typeof NO_PROMPT>([
  NO_PROMPT,
  ...Object.values(Prompt),
]);
