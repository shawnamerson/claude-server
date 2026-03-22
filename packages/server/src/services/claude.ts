import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { getDb } from "../db/client.js";

let client: Anthropic | null = null;

export function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: config.anthropicApiKey });
  }
  return client;
}

const FAST_MODEL = "claude-sonnet-4-20250514";
const CHAT_MODEL = "claude-sonnet-4-20250514";

// Sonnet pricing per million tokens
const INPUT_COST_PER_M = 3.0;      // $3 per 1M input tokens
const CACHE_READ_COST_PER_M = 0.3; // $0.30 per 1M cached input tokens
const OUTPUT_COST_PER_M = 15.0;    // $15 per 1M output tokens

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  costCents: number;
}

// Track cumulative usage per deploy
const deployUsage = new Map<string, TokenUsage>();

function trackUsage(deploymentId: string | null, message: Anthropic.Message) {
  const input = message.usage?.input_tokens || 0;
  const output = message.usage?.output_tokens || 0;
  const cacheRead = (message.usage as any)?.cache_read_input_tokens || 0;
  const uncachedInput = input - cacheRead;
  const costCents = Math.round(
    (uncachedInput / 1_000_000 * INPUT_COST_PER_M + cacheRead / 1_000_000 * CACHE_READ_COST_PER_M + output / 1_000_000 * OUTPUT_COST_PER_M) * 100
  );

  const cacheInfo = cacheRead > 0 ? ` (${cacheRead.toLocaleString()} cached)` : "";
  console.log(`API usage: ${input} in${cacheInfo} / ${output} out / $${(costCents / 100).toFixed(3)}`);

  if (deploymentId) {
    const existing = deployUsage.get(deploymentId) || { inputTokens: 0, outputTokens: 0, costCents: 0 };
    existing.inputTokens += input;
    existing.outputTokens += output;
    existing.costCents += costCents;
    deployUsage.set(deploymentId, existing);

    // Save to logs
    try {
      const db = getDb();
      db.prepare("INSERT INTO logs (deployment_id, stream, message) VALUES (?, 'system', ?)").run(
        deploymentId,
        `Tokens: ${input.toLocaleString()} in + ${output.toLocaleString()} out = $${(costCents / 100).toFixed(3)}`
      );
    } catch { /* ignore if deployment doesn't exist */ }
  }

  return { inputTokens: input, outputTokens: output, costCents };
}

export function getDeployUsage(deploymentId: string): TokenUsage {
  return deployUsage.get(deploymentId) || { inputTokens: 0, outputTokens: 0, costCents: 0 };
}

// Current deployment context for tracking
let currentDeploymentId: string | null = null;
export function setCurrentDeployment(id: string | null) {
  currentDeploymentId = id;
}

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
        max_tokens: 64000,
        system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
        messages,
        tools,
        ...(tools ? { tool_choice: { type: "tool" as const, name: tools[0].name } } : {}),
      },
      { signal: controller.signal }
    );
    const message = await stream.finalMessage();
    trackUsage(currentDeploymentId, message);
    return message;
  } finally {
    clearTimeout(timeout);
  }
}

export function claudeStream(
  systemPrompt: string,
  messages: Anthropic.MessageParam[],
) {
  const client = getClient();
  const stream = client.messages.stream({
    model: CHAT_MODEL,
    max_tokens: 8192,
    system: systemPrompt,
    messages,
  });

  // Track usage when stream completes
  stream.finalMessage().then((msg) => {
    trackUsage(currentDeploymentId, msg);
  }).catch(() => {});

  return stream;
}
