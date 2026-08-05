// @symbiote-native/sms/react: the React entry over the framework-agnostic core.
// Both exports are stateless free functions — `sendSMSAsync` resolves once the system composer
// closes and holds nothing afterwards, and there is no event stream to subscribe to — so there
// is nothing for a hook to own or clean up. Plain re-export, the same shape
// packages/secure-store's React entry has for the same reason.
export * from '../core';
