import { useCallback, useEffect, useState } from 'react';
import {
  composeAsync,
  getClients,
  isAvailableAsync,
} from '@symbiote-native/mail-composer';
import type { IMailClient } from '@symbiote-native/mail-composer';
import { ActionButton } from '../components/ActionButton';
import { Explorer, Scenario } from '../components/Scenario';
import {
  Card,
  Field,
  ResultRow,
  ScreenShell,
  ToggleRow,
  lineColorOf,
} from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';

const ROUTE = ROUTE_NAME.MailComposer;

type IDraft = {
  recipients: string;
  ccRecipients: string;
  bccRecipients: string;
  subject: string;
  body: string;
  attachments: string;
  isHtml: boolean;
};
type ISetDraft = (patch: Partial<IDraft>) => void;

function splitList(text: string): string[] {
  return text
    .split(',')
    .map(item => item.trim())
    .filter(item => item.length > 0);
}

function describeClient(client: IMailClient): string {
  return `${client.label} (${client.url ?? client.packageName ?? '?'})`;
}

function CapabilityCard() {
  const color = lineColorOf(ROUTE);
  const [availability, setAvailability] = useState('checking…');
  const [clients, setClients] = useState<IMailClient[]>([]);

  useEffect(() => {
    let isMounted = true;
    isAvailableAsync().then(available => {
      if (isMounted) {
        setAvailability(available ? 'YES' : 'NO');
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <Card testID="mail-composer-capability-card" title="Capabilities">
      <ResultRow
        testID="mail-composer-available"
        label="Available"
        value={availability}
      />
      <text className="info-text">
        NO is expected on the iOS simulator (no Mail account configured).
      </text>
      <ActionButton
        testID="mail-composer-clients-button"
        title="List mail clients"
        onPress={() => setClients(getClients())}
        color={color}
      />
      <ResultRow
        testID="mail-composer-clients"
        label="Clients"
        value={
          clients.length === 0
            ? 'none listed'
            : clients.map(describeClient).join(', ')
        }
      />
    </Card>
  );
}

function BasicFields({ draft, setDraft }: { draft: IDraft; setDraft: ISetDraft }) {
  return (
    <>
      <Field
        testID="mail-composer-recipients-input"
        label="To (comma separated)"
        value={draft.recipients}
        onChange={recipients => setDraft({ recipients })}
        placeholder="support@example.com"
      />
      <Field
        testID="mail-composer-subject-input"
        label="Subject"
        value={draft.subject}
        onChange={subject => setDraft({ subject })}
      />
      <Field
        testID="mail-composer-body-input"
        label="Body"
        value={draft.body}
        onChange={body => setDraft({ body })}
      />
    </>
  );
}

function AdvancedFields({ draft, setDraft }: { draft: IDraft; setDraft: ISetDraft }) {
  return (
    <>
      <Field
        testID="mail-composer-cc-input"
        label="ccRecipients"
        value={draft.ccRecipients}
        onChange={ccRecipients => setDraft({ ccRecipients })}
      />
      <Field
        testID="mail-composer-bcc-input"
        label="bccRecipients"
        value={draft.bccRecipients}
        onChange={bccRecipients => setDraft({ bccRecipients })}
      />
      <ToggleRow
        testID="mail-composer-html-switch"
        label="isHtml (wraps body in an h1)"
        value={draft.isHtml}
        onChange={isHtml => setDraft({ isHtml })}
        color={lineColorOf(ROUTE)}
      />
      <Field
        testID="mail-composer-attachments-input"
        label="attachments (file:// URIs, comma separated)"
        value={draft.attachments}
        onChange={attachments => setDraft({ attachments })}
        placeholder="file:///…/report.pdf"
      />
    </>
  );
}

function ComposeCard() {
  const [draft, setDraftState] = useState<IDraft>({
    recipients: '',
    ccRecipients: '',
    bccRecipients: '',
    subject: 'Symbiote canary',
    body: 'Sent from the Symbiote canary',
    attachments: '',
    isHtml: false,
  });
  const [result, setResult] = useState('idle');
  const setDraft: ISetDraft = patch =>
    setDraftState(previous => ({ ...previous, ...patch }));

  const handleCompose = useCallback(() => {
    setResult('composer open…');
    composeAsync({
      recipients: splitList(draft.recipients),
      ccRecipients: splitList(draft.ccRecipients),
      bccRecipients: splitList(draft.bccRecipients),
      subject: draft.subject,
      body: draft.isHtml ? `<h1>${draft.body}</h1>` : draft.body,
      isHtml: draft.isHtml,
      attachments: splitList(draft.attachments),
    })
      .then(response => setResult(`status: ${response.status}`))
      .catch((error: Error) => setResult(`compose failed: ${error.message}`));
  }, [draft]);

  return (
    <>
      <Scenario
        testID="mail-composer-compose-card"
        title="Let users write to support without leaving the app"
        why="One tap opens the system mail composer with the address, subject and text already filled in. The user only reviews and presses send, and the app never sees their mail account."
        steps={['Enter your own address in To', 'Press Open composer', 'Send, save as draft or cancel in the composer']}
        expect="The composer opens prefilled. Last result says sent, saved or cancelled on iOS. Android always says sent, the chooser hands the draft to another app."
      >
        <BasicFields draft={draft} setDraft={setDraft} />
        <ActionButton
          testID="mail-composer-compose-button"
          title="Open composer"
          onPress={handleCompose}
          color={lineColorOf(ROUTE)}
        />
        <ResultRow
          testID="mail-composer-result"
          label="Last result"
          value={result}
        />
      </Scenario>
      <Explorer testID="mail-composer-explorer" color={lineColorOf(ROUTE)}>
        <Card testID="mail-composer-advanced-card" title="Copies, HTML body and attachments">
          <AdvancedFields draft={draft} setDraft={setDraft} />
        </Card>
      </Explorer>
    </>
  );
}

export function MailComposerScreen() {
  return (
    <ScreenShell
      route={ROUTE}
      testID="mail-composer-scroll"
      title="Mail Composer"
      body="Open the system mail composer with a ready draft: recipients, subject, text and attachments. The user stays in control and the app never sends anything by itself."
    >
      <CapabilityCard />
      <ComposeCard />
    </ScreenShell>
  );
}
