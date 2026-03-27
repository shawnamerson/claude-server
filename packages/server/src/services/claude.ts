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
const CHAT_MODEL = "claude-haiku-4-5-20251001";

// Sonnet pricing per million tokens (used for deploys)
const INPUT_COST_PER_M = 3.0;      // $3 per 1M input tokens
const CACHE_READ_COST_PER_M = 0.3; // $0.30 per 1M cached input tokens
const OUTPUT_COST_PER_M = 15.0;    // $15 per 1M output tokens
// Haiku pricing (used for chat) — $0.80/$4 input/output per 1M
const HAIKU_INPUT_COST_PER_M = 0.8;
const HAIKU_OUTPUT_COST_PER_M = 4.0;

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  costCents: number;
}

// Track cumulative usage per deploy
const deployUsage = new Map<string, TokenUsage>();

export function trackUsage(deploymentId: string | null, message: Anthropic.Message, model?: string) {
  const input = message.usage?.input_tokens || 0;
  const output = message.usage?.output_tokens || 0;
  const cacheRead = (message.usage as unknown as Record<string, number>)?.cache_read_input_tokens || 0;
  const uncachedInput = input - cacheRead;
  const isHaiku = model?.includes("haiku");
  const inputRate = isHaiku ? HAIKU_INPUT_COST_PER_M : INPUT_COST_PER_M;
  const outputRate = isHaiku ? HAIKU_OUTPUT_COST_PER_M : OUTPUT_COST_PER_M;
  const cacheRate = isHaiku ? 0.08 : CACHE_READ_COST_PER_M; // Haiku cache read: $0.08/M
  const costCents = Math.round(
    (uncachedInput / 1_000_000 * inputRate + cacheRead / 1_000_000 * cacheRate + output / 1_000_000 * outputRate) * 100
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
    } catch {
      // Deployment may not exist yet during early pipeline stages
    }
  }

  // Track all API usage in a central table (deploy + chat)
  try {
    const db = getDb();
    const source = deploymentId ? "deploy" : "chat";
    db.prepare("INSERT INTO api_usage (input_tokens, output_tokens, cost_cents, source) VALUES (?, ?, ?, ?)").run(input, output, costCents, source);
  } catch {}

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

export interface ToolHandler {
  name: string;
  execute: (input: any) => Promise<string>;
}

export async function claudeAgentLoop(
  systemPrompt: string,
  userMessage: string,
  tools: Anthropic.Tool[],
  handlers: ToolHandler[],
  opts?: { maxTurns?: number; onText?: (text: string) => void; onToolUse?: (name: string, input: any) => void }
): Promise<string> {
  const client = getClient();
  const maxTurns = opts?.maxTurns || 50;
  const handlerMap = new Map(handlers.map(h => [h.name, h]));

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userMessage },
  ];

  for (let turn = 0; turn < maxTurns; turn++) {
    console.log(`Agent turn ${turn + 1}/${maxTurns}`);

    let response!: Anthropic.Message;
    for (let retry = 0; retry < 5; retry++) {
      try {
        const stream = client.messages.stream({
          model: FAST_MODEL,
          max_tokens: 32000,
          system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
          messages,
          tools,
        });
        response = await stream.finalMessage();
        break;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isTransient = /overloaded|rate.?limit|529|503|timeout|ECONNRESET|socket hang up/i.test(msg);
        if (isTransient && retry < 4) {
          const wait = (retry + 1) * 3;
          console.log(`API overloaded, retrying in ${wait}s (attempt ${retry + 2}/5)...`);
          await new Promise(r => setTimeout(r, wait * 1000));
          continue;
        }
        throw err;
      }
    }

    trackUsage(currentDeploymentId, response);
    console.log(`Agent response: stop_reason=${response.stop_reason}, blocks=${response.content.map(b => b.type).join(",")}`);

    // Collect text and tool uses
    const toolUses: Array<{ id: string; name: string; input: any }> = [];
    let lastText = "";

    for (const block of response.content) {
      if (block.type === "text") {
        lastText = block.text;
        opts?.onText?.(block.text);
      } else if (block.type === "tool_use") {
        toolUses.push({ id: block.id, name: block.name, input: block.input });
      }
    }

    // No tool uses and no tool_use stop — Claude is done talking
    if (toolUses.length === 0) {
      return lastText || "Done";
    }

    // Process all tool calls
    messages.push({ role: "assistant", content: response.content });
    const results: Anthropic.ToolResultBlockParam[] = [];

    for (const tu of toolUses) {
      const handler = handlerMap.get(tu.name);
      if (!handler) {
        results.push({ type: "tool_result", tool_use_id: tu.id, content: `Unknown tool: ${tu.name}`, is_error: true });
        continue;
      }

      opts?.onToolUse?.(tu.name, tu.input);

      try {
        const result = await handler.execute(tu.input);
        results.push({ type: "tool_result", tool_use_id: tu.id, content: result });

        // If this was "done", return immediately
        if (tu.name === "done") {
          return tu.input.notes || lastText || "Done";
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({ type: "tool_result", tool_use_id: tu.id, content: `Error: ${msg}`, is_error: true });
      }
    }

    messages.push({ role: "user", content: results });

    // If stop_reason was end_turn (not tool_use), Claude wanted to stop but we processed tools anyway.
    // Continue the loop so Claude can see tool results and decide what to do next.
  }

  return "Reached maximum turns";
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
