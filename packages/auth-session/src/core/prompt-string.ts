import type { Prompt } from './auth-request.types';

export function createPromptString(
  prompt: Prompt | Prompt[] | undefined,
): string | undefined {
  if (!prompt) return undefined;
  return Array.isArray(prompt) ? prompt.join(' ') : prompt;
}
