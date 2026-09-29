import { requireNativeModule } from 'expo-modules-core';

const EXPO_APP_INTEGRITY_MODULE_NAME = 'ExpoAppIntegrity';

// The App Attest trio and `isSupported` exist only on iOS, the Play Integrity/hardware-attestation
// methods only on Android, so app-integrity.ts checks Platform.OS before calling through, same
// convention as packages/application/src/core/native-module.ts
export type INativeAppIntegrityModule = {
  isSupported?: boolean;
  generateKeyAsync?(): Promise<string>;
  attestKeyAsync?(keyId: string, challenge: string): Promise<string>;
  generateAssertionAsync?(keyId: string, challenge: string): Promise<string>;
  prepareIntegrityTokenProviderAsync?(
    cloudProjectNumber: string,
  ): Promise<void>;
  requestIntegrityCheckAsync?(requestHash: string): Promise<string>;
  isHardwareAttestationSupportedAsync?(): Promise<boolean>;
  generateHardwareAttestedKeyAsync?(
    keyAlias: string,
    challenge: string,
  ): Promise<void>;
  getAttestationCertificateChainAsync?(keyAlias: string): Promise<string[]>;
};

export const expoAppIntegrity = requireNativeModule<INativeAppIntegrityModule>(
  EXPO_APP_INTEGRITY_MODULE_NAME,
);
