import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";

let client: Anthropic | null = null;

export function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: config.anthropicApiKey });
  }
  return client;
}

// Fast model for code generation (speed > quality for initial generation)
const FAST_MODEL = "claude-sonnet-4-20250514";
// Quality model for chat and analysis
const CHAT_MODEL = "claude-sonnet-4-20250514";

export async function claudeChat(
  systemPrompt: string,
  messages: Anthropic.MessageParam[],
  tools?: Anthropic.Tool[]
): Promise<Anthropic.Message> {
  const client = getClient();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5 * 60 * 1000);

  try {
    const stream = client.messages.stream(
      {
        model: FAST_MODEL,
        max_tokens: 16000,
        system: systemPrompt,
        messages,
        tools,
        ...(tools ? { tool_choice: { type: "tool" as const, name: tools[0].name } } : {}),
      },
      { signal: controller.signal }
    );
    return await stream.finalMessage();
  } finally {
    clearTimeout(timeout);
  }
}

export function claudeStream(
  systemPrompt: string,
  messages: Anthropic.MessageParam[],
) {
  const client = getClient();
  return client.messages.stream({
    model: CHAT_MODEL,
    max_tokens: 8192,
    system: systemPrompt,
    messages,
  });
}
