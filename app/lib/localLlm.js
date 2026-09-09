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
  PROVIDER_QWEN,
  buildReadTriageUserPrompt,
  parseReadTriageDecisions,
  classifyReadState,
} from "./claude.js";
import { loadSettings } from "./settings.js";

// Appended to the shared system prompt for the LOCAL path only — Claude's
// path is untouched, because Claude has neither of these failure modes.
// Both instructions target a defect observed in the raw responses during
// evaluation: the model returned `decisions` as a JSON-encoded STRING
// instead of a native array on one real chunk, and on another it spent its
// entire generation budget deliberating per-message and was cut off before
// it ever emitted the tool call.
const LOCAL_FORMAT_HINT = `

OUTPUT FORMAT REQUIREMENTS (strict):
- The "decisions" argument MUST be a native JSON array of objects. Never a string containing JSON.
- Each object MUST use the field name "decision", whose value is exactly "read" or "unread". Do not substitute other field names such as "read", "action", or "status".
- Keep your internal reasoning brief. Decide each message quickly against the policy; do not deliberate at length or second-guess yourself. Emit the tool call.`;

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

// Generous but bounded: a legitimate 25-message chunk takes ~100-170s on the
// local box, so the timeout must clear that comfortably. Without any timeout
// an unreachable host (a Tailscale ACL change, a box that is asleep) hangs
// each chunk on the OS-level TCP connect timeout instead of failing over to
// Claude promptly.
const LOCAL_REQUEST_TIMEOUT_MS = 300000;

async function classifyReadStateChunkLocal(
  messages,
  { model, host, temperature = 0 },
) {
  const userPrompt = buildReadTriageUserPrompt(messages);
  const res = await fetch(`http://${host}:11434/api/chat`, {
    method: "POST",
    signal: AbortSignal.timeout(LOCAL_REQUEST_TIMEOUT_MS),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: READ_TRIAGE_SYSTEM_PROMPT + LOCAL_FORMAT_HINT,
        },
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

  // Truncated mid-generation: the model never reached the tool call. Observed
  // on a real chunk at num_predict 4096 (done_reason "length", cut off after
  // reasoning through all 25 decisions). Must THROW, not return [] — an empty
  // result is indistinguishable from "nothing was clearable" to the caller,
  // which would silently drop the whole chunk instead of falling back.
  if (data.done_reason === "length") {
    throw new Error(
      `Ollama ${model} truncated before emitting a tool call (done_reason=length, eval_count=${data.eval_count})`,
    );
  }

  const toolCall = (data.message?.tool_calls || []).find(
    (t) => t.function?.name === READ_TRIAGE_TOOL.name,
  );
  if (!toolCall) {
    throw new Error(`Ollama ${model} returned no ${READ_TRIAGE_TOOL.name} call`);
  }

  // Observed on a real chunk: `decisions` came back as a JSON-encoded STRING
  // rather than a native array. parseReadTriageDecisions correctly rejects
  // that (Array.isArray fails) and returns [] — safe, but silent. Throwing
  // here is what routes the chunk to the Claude fallback instead.
  const raw = toolCall.function?.arguments?.decisions;
  if (!Array.isArray(raw)) {
    throw new Error(
      `Ollama ${model} returned decisions as ${typeof raw}, not an array`,
    );
  }

  return parseReadTriageDecisions(raw, PROVIDER_QWEN);
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

// The production classifier: local model first, Claude per-chunk fallback.
//
// Matches classifyReadState's signature exactly (messages, anthropicClient)
// so it can be dropped in as triageReadState's `classify` without any other
// wiring. When the local model is disabled or unconfigured this delegates
// straight to Claude, so the default path is byte-for-byte today's
// behaviour.
//
// Fallback is per-CHUNK, not per-run: one bad chunk costs one Claude call,
// not a full re-run. Both observed local failure modes (truncation, wrong
// JSON type) throw out of classifyReadStateChunkLocal and land here.
export async function classifyReadStateHybrid(
  messages,
  anthropicClient,
  { getSettings = loadSettings, classifyCloud = classifyReadState } = {},
) {
  if (!messages.length) return { decisions: [], failedIds: [] };

  const settings = getSettings();
  if (!settings.readTriageLocalModelEnabled) {
    return classifyCloud(messages, anthropicClient);
  }

  const host = process.env.OLLAMA_HOST;
  if (!host) {
    console.error(
      "[localLlm] readTriageLocalModelEnabled is set but OLLAMA_HOST is not — using Claude for this run",
    );
    return classifyCloud(messages, anthropicClient);
  }
  const model = settings.readTriageLocalModel || "qwen3.8:27b";

  const decisions = [];
  const failedIds = [];

  for (let i = 0; i < messages.length; i += READ_TRIAGE_CHUNK_SIZE) {
    const chunk = messages.slice(i, i + READ_TRIAGE_CHUNK_SIZE);
    try {
      decisions.push(...(await classifyReadStateChunkLocal(chunk, { model, host })));
    } catch (e) {
      console.error(
        `[localLlm] ${model} failed on a ${chunk.length}-message chunk, falling back to Claude: ${e.message}`,
      );
      // Claude's own classifyReadState catches its per-chunk errors and
      // reports them via failedIds rather than throwing, so a fallback that
      // ALSO fails still degrades safely: those ids stay unread and unlabeled.
      const cloud = await classifyCloud(chunk, anthropicClient);
      decisions.push(...cloud.decisions);
      failedIds.push(...cloud.failedIds);
    }
  }

  return { decisions, failedIds };
}
