// The native module reads these enums as raw integers, so their numbering is the contract

import { describe, expect, it } from 'vitest';
import {
  AppleAuthenticationButtonStyle,
  AppleAuthenticationButtonType,
  AppleAuthenticationCredentialState,
  AppleAuthenticationOperation,
  AppleAuthenticationScope,
  AppleAuthenticationUserDetectionStatus,
} from './types';

describe('native enum numbering', () => {
  it('numbers the scopes the way the native request expects', () => {
    expect([
      AppleAuthenticationScope.FULL_NAME,
      AppleAuthenticationScope.EMAIL,
    ]).toEqual([0, 1]);
  });

  it('numbers the operations the way the native request expects', () => {
    expect([
      AppleAuthenticationOperation.IMPLICIT,
      AppleAuthenticationOperation.LOGIN,
      AppleAuthenticationOperation.REFRESH,
      AppleAuthenticationOperation.LOGOUT,
    ]).toEqual([0, 1, 2, 3]);
  });

  it('numbers the credential states the way the native module reports them', () => {
    expect([
      AppleAuthenticationCredentialState.REVOKED,
      AppleAuthenticationCredentialState.AUTHORIZED,
      AppleAuthenticationCredentialState.NOT_FOUND,
      AppleAuthenticationCredentialState.TRANSFERRED,
    ]).toEqual([0, 1, 2, 3]);
  });

  it('numbers the user detection statuses the way the native module reports them', () => {
    expect([
      AppleAuthenticationUserDetectionStatus.UNSUPPORTED,
      AppleAuthenticationUserDetectionStatus.UNKNOWN,
      AppleAuthenticationUserDetectionStatus.LIKELY_REAL,
    ]).toEqual([0, 1, 2]);
  });

  it('numbers the button types the way the native view expects', () => {
    expect([
      AppleAuthenticationButtonType.SIGN_IN,
      AppleAuthenticationButtonType.CONTINUE,
      AppleAuthenticationButtonType.SIGN_UP,
    ]).toEqual([0, 1, 2]);
  });

  it('numbers the button styles the way the native view expects', () => {
    expect([
      AppleAuthenticationButtonStyle.WHITE,
      AppleAuthenticationButtonStyle.WHITE_OUTLINE,
      AppleAuthenticationButtonStyle.BLACK,
    ]).toEqual([0, 1, 2]);
  });
});
