/**
 * How the composer was dismissed.
 *
 * Android never reports it: reading the outcome would mean querying the device's SMS database,
 * which needs the `READ_SMS` permission Google restricts to default-SMS-app publishers, so the
 * native module resolves `unknown` unconditionally there.
 */
export type ISmsResultStatus = 'unknown' | 'sent' | 'cancelled';

export type ISmsResponse = {
  /** Status of the SMS action the user invoked. */
  result: ISmsResultStatus;
};

/** A file to attach to the drafted message. */
export type ISmsAttachment = {
  /**
   * Content URI of the file. It has to be a content URI so applications outside your own can
   * read it — a plain file path is not reachable from the system composer.
   */
  uri: string;
  /** MIME type of the attachment, such as `image/png`. */
  mimeType: string;
  /** File name shown for the attachment in the composer. */
  filename: string;
};

export type ISmsOptions = {
  /**
   * One attachment or a list of them. Android carries only the first — its composer intent has
   * a single `EXTRA_STREAM` slot — so anything past it is dropped before the native call.
   */
  attachments?: ISmsAttachment | ISmsAttachment[];
};
