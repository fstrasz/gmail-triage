// ─── Local (Ollama) read-triage classifier ─────────────────────────────────
// Mirrors classifyReadState's interface exactly (same input, same
// {decisions, failedIds} shape, same chunking, same fail-safe) so a
// comparison harness can call either provider interchangeably. Reuses the
// exact prompt-building and decision-validation logic from claude.js — the
// prompt sent to a local model must be byte-identical to what Claude sees,
// or a comparison between them isn't measuring the model, it's measuring a
// prompt difference.
import {
  READ_TRIAGE_SYSTEM_PROMPT,
  READ_TRIAGE_TOOL,
  READ_TRIAGE_CHUNK_SIZE,
  buildReadTriageUserPrompt,
  parseReadTriageDecisions,
} from "./claude.js";

function toOllamaTool(anthropicTool) {
  return {
    type: "function",
    function: {
      name: anthropicTool.name,
      description: anthropicTool.description,
      parameters: anthropicTool.input_schema,
    },
  };
}

async function classifyReadStateChunkLocal(
  messages,
  { model, host, temperature = 0 },
) {
  const userPrompt = buildReadTriageUserPrompt(messages);
  const res = await fetch(`http://${host}:11434/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: READ_TRIAGE_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      tools: [toOllamaTool(READ_TRIAGE_TOOL)],
      tool_choice: {
        type: "function",
        function: { name: READ_TRIAGE_TOOL.name },
      },
      // 4096 was Claude's own max_tokens, carried over as a first guess —
      // too small for this model: a harder, more ambiguous 25-message batch
      // hit done_reason "length" at exactly 4096, cut off mid-reasoning
      // before it ever reached the tool call (confirmed by inspecting the
      // raw response). 8192 was verified sufficient on that same chunk
      // (used 4901). Without an explicit cap at all, this model's verbose
      // "thinking" can exhaust Ollama's default budget the same way.
      // temperature defaults to 0 (greedy) — this is a deterministic
      // classification task against a fixed rubric, not creative
      // generation, and some models ship a modelfile default of 1, which
      // was shown (5 repeated trials) to cause non-deterministic malformed
      // output at temperature 1 that temperature 0 eliminated.
      options: { num_predict: 8192, temperature },
      stream: false,
    }),
  });
  if (!res.ok) {
    throw new Error(`Ollama ${model} HTTP ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const toolCall = (data.message?.tool_calls || []).find(
    (t) => t.function?.name === READ_TRIAGE_TOOL.name,
  );
  return parseReadTriageDecisions(toolCall?.function?.arguments?.decisions);
}

// `host` is the Ollama server's address (no scheme, no port — e.g.
// "100.112.97.92"); `model` is the Ollama model tag (e.g. "gpt-oss:120b").
export async function classifyReadStateLocal(
  messages,
  { model, host, temperature = 0 },
) {
  if (!messages.length) return { decisions: [], failedIds: [] };

  const decisions = [];
  const failedIds = [];

  for (let i = 0; i < messages.length; i += READ_TRIAGE_CHUNK_SIZE) {
    const chunk = messages.slice(i, i + READ_TRIAGE_CHUNK_SIZE);
    try {
      decisions.push(
        ...(await classifyReadStateChunkLocal(chunk, {
          model,
          host,
          temperature,
        })),
      );
    } catch (e) {
      console.error(
        `[localLlm] ${model} chunk failed (${chunk.length} messages): ${e.message}`,
      );
      failedIds.push(...chunk.map((m) => m.id));
    }
  }

  return { decisions, failedIds };
}
