import type { IAuthSessionResult } from './auth-session.types';

const SUCCESS_TYPE = 'success' satisfies IAuthSessionResult['type'];

/** The variant that carries params and authentication */
export type IAuthSessionParamsResult = Extract<
  IAuthSessionResult,
  { params: unknown }
>;

export function isSuccessResult(
  result: IAuthSessionResult | null,
): result is IAuthSessionParamsResult {
  return result?.type === SUCCESS_TYPE;
}
