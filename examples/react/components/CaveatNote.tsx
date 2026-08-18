import { Text } from '@symbiote-native/react';

type ICaveatNoteProps = {
  children: string;
  testID?: string;
};

// Partial-row caveats surface here instead of being silently glossed over — the degraded
// behavior IS the point of a Partial demo (see .docs/framework-api-surface/react.md).
export function CaveatNote({ children, testID }: ICaveatNoteProps) {
  return (
    <Text
      testID={testID}
      className="caveat-text"
    >{`Partial: ${children}`}</Text>
  );
}
