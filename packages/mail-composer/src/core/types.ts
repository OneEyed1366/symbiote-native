/** A mail client installed on the device. */
export type IMailClient = {
  /** The display name of the mail client. */
  label: string;
  /** The package name of the mail client application. @platform android */
  packageName?: string;
  /** The URL scheme of the mail client. @platform ios */
  url?: string;
};

export type IMailComposerOptions = {
  /** E-mail addresses of the recipients. */
  recipients?: string[];
  /** E-mail addresses of the CC recipients. */
  ccRecipients?: string[];
  /** E-mail addresses of the BCC recipients. */
  bccRecipients?: string[];
  subject?: string;
  body?: string;
  /** Whether `body` contains HTML tags. Not fully supported on Android. */
  isHtml?: boolean;
  /** App-internal file URIs to attach. */
  attachments?: string[];
};

export type IMailComposerStatus =
  'undetermined' | 'sent' | 'saved' | 'cancelled';

export type IMailComposerResult = {
  status: IMailComposerStatus;
};
