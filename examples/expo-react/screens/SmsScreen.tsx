import { useEffect, useState } from 'react';
import { isAvailableAsync, sendSMSAsync } from '@symbiote-native/sms';
import type { ISmsAttachment } from '@symbiote-native/sms';
import { ActionButton } from '../components/ActionButton';
import { Explorer, Scenario } from '../components/Scenario';
import { Card, Field, ResultRow, ScreenShell, ToggleRow, lineColorOf } from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';

const color = lineColorOf(ROUTE_NAME.Sms);

type IForm = {
  recipients: string;
  message: string;
  isAttaching: boolean;
  isSecondAttachment: boolean;
  isArrayForm: boolean;
  uri: string;
  mimeType: string;
  filename: string;
};
type ISetForm = (patch: Partial<IForm>) => void;

function attachmentsOf(form: IForm): ISmsAttachment | ISmsAttachment[] | undefined {
  if (!form.isAttaching) {
    return undefined;
  }
  const first = { uri: form.uri, mimeType: form.mimeType, filename: form.filename };
  if (!form.isSecondAttachment) {
    return form.isArrayForm ? [first] : first;
  }
  return [first, { ...first, filename: `second-${form.filename}` }];
}

function addressesOf(text: string): string[] {
  return text
    .split(',')
    .map(address => address.trim())
    .filter(address => address.length > 0);
}

function ComposeCard({ form, setForm }: { form: IForm; setForm: ISetForm }) {
  return (
    <>
      <Field testID="sms-recipients-input" label="recipients, comma separated" value={form.recipients} onChange={recipients => setForm({ recipients })} placeholder="0123456789, 9876543210" />
      <Field testID="sms-message-input" label="message" value={form.message} onChange={message => setForm({ message })} />
    </>
  );
}

function AttachmentCard({ form, setForm }: { form: IForm; setForm: ISetForm }) {
  return (
    <Card testID="sms-attachment-card" title="attachments">
      <ToggleRow testID="sms-attach-switch" label="attach a file" value={form.isAttaching} onChange={isAttaching => setForm({ isAttaching })} color={color} />
      <ToggleRow testID="sms-array-switch" label="pass an array (single attachment)" value={form.isArrayForm} onChange={isArrayForm => setForm({ isArrayForm })} color={color} />
      <ToggleRow testID="sms-second-switch" label="two attachments (Android keeps the first)" value={form.isSecondAttachment} onChange={isSecondAttachment => setForm({ isSecondAttachment })} color={color} />
      <Field testID="sms-uri-input" label="uri (content uri)" value={form.uri} onChange={uri => setForm({ uri })} placeholder="content://..." />
      <Field testID="sms-mime-input" label="mimeType" value={form.mimeType} onChange={mimeType => setForm({ mimeType })} />
      <Field testID="sms-filename-input" label="filename" value={form.filename} onChange={filename => setForm({ filename })} />
    </Card>
  );
}

export function SmsScreen() {
  const [availability, setAvailability] = useState('checking');
  const [lastResult, setLastResult] = useState('idle');
  const [form, setFormState] = useState<IForm>({
    recipients: '',
    message: 'Sent from the Symbiote canary',
    isAttaching: false,
    isSecondAttachment: false,
    isArrayForm: false,
    uri: '',
    mimeType: 'image/png',
    filename: 'canary.png',
  });
  const setForm: ISetForm = patch => setFormState(previous => ({ ...previous, ...patch }));

  useEffect(() => {
    isAvailableAsync().then(available => setAvailability(available ? 'yes' : 'no'));
  }, []);

  const send = () => {
    const addresses = addressesOf(form.recipients);
    if (addresses.length === 0) {
      setLastResult('no recipients');
      return;
    }
    setLastResult('composer open…');
    const attachments = attachmentsOf(form);
    sendSMSAsync(form.recipients.includes(',') ? addresses : addresses[0], form.message, attachments === undefined ? undefined : { attachments })
      .then(response => setLastResult(`result: ${response.result}`))
      .catch((error: Error) => setLastResult(`send failed: ${error.message}`));
  };

  return (
    <ScreenShell
      route={ROUTE_NAME.Sms}
      testID="sms-scroll"
      title="SMS"
      body="Open the system SMS composer with recipients, text and attachments already filled in. The user reviews and presses send, so the app needs no SMS permission and never sends by itself."
    >
      <Card testID="sms-capability-card" title="Can this device send SMS?">
        <ResultRow testID="sms-available" label="Available" value={availability} />
        <text className="info-text">NO is expected on the iOS simulator and on Android devices without telephony hardware.</text>
      </Card>
      <Scenario
        testID="sms-send-card"
        title="Invite a friend or text support with a prefilled message"
        why="Share an invite code, send a delivery update or contact support by SMS. The composer opens ready to send, with one or many recipients."
        steps={['Enter your own number in recipients', 'Press Open composer', 'Send or cancel in the composer']}
        expect="The composer opens with the recipients and text. Last result says sent or cancelled on iOS, and always unknown on Android because it cannot report the outcome."
      >
        <ComposeCard form={form} setForm={setForm} />
        <ActionButton testID="sms-send-button" title="Open composer" onPress={send} color={color} />
        <ResultRow testID="sms-result" label="Last result" value={lastResult} />
      </Scenario>
      <Explorer testID="sms-explorer" color={color}>
        <AttachmentCard form={form} setForm={setForm} />
      </Explorer>
    </ScreenShell>
  );
}
