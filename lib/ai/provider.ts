import { anthropic } from '@/lib/anthropic';
import { AI_MODELS, AiTaskProfile } from '@/lib/ai/models';
import { parseJsonOrFallback } from '@/lib/ai/json';

type TextBlock = { type: 'text'; text: string };
type ImageBlock = {
  type: 'image';
  source: { type: 'base64'; media_type: 'image/jpeg' | 'image/png' | 'image/webp'; data: string };
};
type DocumentBlock = {
  type: 'document';
  source: { type: 'base64'; media_type: 'application/pdf'; data: string };
};

export type AiContentBlock = TextBlock | ImageBlock | DocumentBlock;

interface GenerateTextInput {
  profile: AiTaskProfile;
  system?: string;
  prompt?: string;
  content?: AiContentBlock[];
  maxTokens?: number;
}

interface GenerateJsonInput<T> extends GenerateTextInput {
  fallback: T;
  onParseError?: (payload: string) => void;
}

export async function generateText({ profile, system, prompt, content, maxTokens = 4096 }: GenerateTextInput): Promise<string> {
  const messageContent = content || [{ type: 'text', text: prompt || '' } satisfies TextBlock];

  const response = await anthropic.messages.create({
    model: AI_MODELS[profile],
    max_tokens: maxTokens,
    ...(system ? { system } : {}),
    messages: [{ role: 'user', content: messageContent }],
  });

  return response.content.find(block => block.type === 'text')?.text || '';
}

export async function generateJson<T>(input: GenerateJsonInput<T>): Promise<T> {
  const text = await generateText(input);
  return parseJsonOrFallback(text, input.fallback, input.onParseError);
}
