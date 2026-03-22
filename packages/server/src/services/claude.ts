import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";

let client: Anthropic | null = null;

export function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: config.anthropicApiKey });
  }
  return client;
}

export async function claudeChat(
  systemPrompt: string,
  messages: Anthropic.MessageParam[],
  tools?: Anthropic.Tool[]
): Promise<Anthropic.Message> {
  const client = getClient();

  // Use streaming to avoid timeout, with a 5 minute abort
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5 * 60 * 1000);

  try {
    const stream = client.messages.stream(
      {
        model: "claude-sonnet-4-20250514",
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
    model: "claude-sonnet-4-20250514",
    max_tokens: 8192,
    system: systemPrompt,
    messages,
  });
}
