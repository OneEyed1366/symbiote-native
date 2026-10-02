import { useState } from 'react';
import type { ReactNode } from 'react';
import { ActionButton } from './ActionButton';

type IScenarioProps = {
  testID: string;
  title: string;
  why: string;
  steps: readonly string[];
  expect: string;
  children?: ReactNode;
};

// One user task: what it is for, what to do on the device, what must be seen afterwards
export function Scenario({ testID, title, why, steps, expect, children }: IScenarioProps) {
  return (
    <view testID={testID} className="scenario-card">
      <text className="scenario-title">{title}</text>
      <text className="scenario-why">{why}</text>
      <view className="scenario-steps">
        {steps.map((step, index) => (
          <text key={step} className="scenario-step">{`${index + 1}. ${step}`}</text>
        ))}
      </view>
      {children}
      <view className="scenario-expect">
        <text className="scenario-expect-label">Expected</text>
        <text className="scenario-expect-text">{expect}</text>
      </view>
    </view>
  );
}

type IExplorerProps = { testID: string; color: string; children: ReactNode };

// Every remaining API call of the package, collapsed so the scenarios above stay the main story
export function Explorer({ testID, color, children }: IExplorerProps) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <view testID={testID} className="explorer">
      <ActionButton
        testID={`${testID}-toggle`}
        title={isOpen ? 'Hide API explorer' : 'Open API explorer: every call and option'}
        onPress={() => setIsOpen(previous => !previous)}
        color={color}
      />
      {isOpen && children}
    </view>
  );
}
