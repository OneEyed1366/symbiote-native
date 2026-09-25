import type { IAuthRequestConfig } from '../auth-request.types';

export type IProviderAuthRequestConfig = IAuthRequestConfig & {
  /** ISO 639-1 code, optionally `-<ISO 3166-1 alpha-2>` (e.g. `it`, `pt-PT`). */
  language?: string;
};
