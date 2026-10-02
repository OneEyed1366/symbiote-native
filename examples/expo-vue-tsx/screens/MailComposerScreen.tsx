import { defineComponent, onUnmounted, ref } from 'vue';
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

const CapabilityCard = defineComponent(
  () => {
    const color = lineColorOf(ROUTE);
    const availability = ref('checking…');
    const clients = ref<IMailClient[]>([]);

    let isMounted = true;
    onUnmounted(() => {
      isMounted = false;
    });
    isAvailableAsync().then(available => {
      if (isMounted) {
        availability.value = available ? 'YES' : 'NO';
      }
    });

    return () => (
      <Card testID="mail-composer-capability-card" title="Capabilities">
        <ResultRow
          testID="mail-composer-available"
          label="Available"
          value={availability.value}
        />
        <text class="info-text">
          NO is expected on the iOS simulator (no Mail account configured).
        </text>
        <ActionButton
          testID="mail-composer-clients-button"
          title="List mail clients"
          onPress={() => {
            clients.value = getClients();
          }}
          color={color}
        />
        <ResultRow
          testID="mail-composer-clients"
          label="Clients"
          value={
            clients.value.length === 0
              ? 'none listed'
              : clients.value.map(describeClient).join(', ')
          }
        />
      </Card>
    );
  },
  { name: 'CapabilityCard' },
);

function BasicFields(props: { draft: IDraft; setDraft: ISetDraft }) {
  return (
    <>
      <Field
        testID="mail-composer-recipients-input"
        label="To (comma separated)"
        value={props.draft.recipients}
        onChange={recipients => props.setDraft({ recipients })}
        placeholder="support@example.com"
      />
      <Field
        testID="mail-composer-subject-input"
        label="Subject"
        value={props.draft.subject}
        onChange={subject => props.setDraft({ subject })}
      />
      <Field
        testID="mail-composer-body-input"
        label="Body"
        value={props.draft.body}
        onChange={body => props.setDraft({ body })}
      />
    </>
  );
}

function AdvancedFields(props: { draft: IDraft; setDraft: ISetDraft }) {
  return (
    <>
      <Field
        testID="mail-composer-cc-input"
        label="ccRecipients"
        value={props.draft.ccRecipients}
        onChange={ccRecipients => props.setDraft({ ccRecipients })}
      />
      <Field
        testID="mail-composer-bcc-input"
        label="bccRecipients"
        value={props.draft.bccRecipients}
        onChange={bccRecipients => props.setDraft({ bccRecipients })}
      />
      <ToggleRow
        testID="mail-composer-html-switch"
        label="isHtml (wraps body in an h1)"
        value={props.draft.isHtml}
        onChange={isHtml => props.setDraft({ isHtml })}
        color={lineColorOf(ROUTE)}
      />
      <Field
        testID="mail-composer-attachments-input"
        label="attachments (file:// URIs, comma separated)"
        value={props.draft.attachments}
        onChange={attachments => props.setDraft({ attachments })}
        placeholder="file:///…/report.pdf"
      />
    </>
  );
}

const ComposeCard = defineComponent(
  () => {
    const draft = ref<IDraft>({
      recipients: '',
      ccRecipients: '',
      bccRecipients: '',
      subject: 'Symbiote canary',
      body: 'Sent from the Symbiote canary',
      attachments: '',
      isHtml: false,
    });
    const result = ref('idle');
    const setDraft: ISetDraft = patch => {
      draft.value = { ...draft.value, ...patch };
    };

    const handleCompose = () => {
      const current = draft.value;
      result.value = 'composer open…';
      composeAsync({
        recipients: splitList(current.recipients),
        ccRecipients: splitList(current.ccRecipients),
        bccRecipients: splitList(current.bccRecipients),
        subject: current.subject,
        body: current.isHtml ? `<h1>${current.body}</h1>` : current.body,
        isHtml: current.isHtml,
        attachments: splitList(current.attachments),
      })
        .then(response => {
          result.value = `status: ${response.status}`;
        })
        .catch((error: Error) => {
          result.value = `compose failed: ${error.message}`;
        });
    };

    return () => (
      <>
        <Scenario
          testID="mail-composer-compose-card"
          title="Let users write to support without leaving the app"
          why="One tap opens the system mail composer with the address, subject and text already filled in. The user only reviews and presses send, and the app never sees their mail account."
          steps={['Enter your own address in To', 'Press Open composer', 'Send, save as draft or cancel in the composer']}
          expect="The composer opens prefilled. Last result says sent, saved or cancelled on iOS. Android always says sent, the chooser hands the draft to another app."
        >
          <BasicFields draft={draft.value} setDraft={setDraft} />
          <ActionButton
            testID="mail-composer-compose-button"
            title="Open composer"
            onPress={handleCompose}
            color={lineColorOf(ROUTE)}
          />
          <ResultRow
            testID="mail-composer-result"
            label="Last result"
            value={result.value}
          />
        </Scenario>
        <Explorer testID="mail-composer-explorer" color={lineColorOf(ROUTE)}>
          <Card testID="mail-composer-advanced-card" title="Copies, HTML body and attachments">
            <AdvancedFields draft={draft.value} setDraft={setDraft} />
          </Card>
        </Explorer>
      </>
    );
  },
  { name: 'ComposeCard' },
);

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
