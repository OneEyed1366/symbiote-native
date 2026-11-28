// What the port did with each top-level declaration of the package: ported, or refused and why
export const PORT_STATUS = { ported: 'ported', refused: 'refused' } as const;
export type IPortStatus = (typeof PORT_STATUS)[keyof typeof PORT_STATUS];

export type IPortEntry = {
  file: string;
  name: string;
  status: IPortStatus;
  reason?: string;
  notes: string[];
};

// Thrown by a rule that meets a form it has no translation for; the whole declaration is refused
export class PortRefusal extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'PortRefusal';
  }
}

export function refuse(reason: string): never {
  throw new PortRefusal(reason);
}
