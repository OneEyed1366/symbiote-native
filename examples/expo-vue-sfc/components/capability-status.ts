export type ICapabilityStatus = 'checking' | 'yes' | 'no';

export const CAPABILITY_LABEL: Record<ICapabilityStatus, string> = {
  checking: 'CHECKING…',
  yes: 'YES',
  no: 'NO',
};

export function toCapabilityStatus(isEnabled: boolean): ICapabilityStatus {
  return isEnabled ? 'yes' : 'no';
}
