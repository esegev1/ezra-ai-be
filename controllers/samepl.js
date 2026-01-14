/**
 * server.mjs (ESM, Node 20+)
 *
 * Multi-agent orchestrator using OpenAI Chat Completions:
 *  - Router (non-stream JSON)
 *  - Experts (non-stream JSON, parallel)
 *  - Editor (streamed) -> SSE to the client
 *
 * POST /ask   (SSE)
 * Body: { "question": "...", "facts": { ...optional... } }
 *
 * Example:
 *   curl -N -X POST http://localhost:3000/ask \
 *     -H "Content-Type: application/json" \
 *     -d '{"question":"I have $12k credit card debt at 24% APR. What should I do?","facts":{"monthly_take_home":5500,"rent":2200}}'
 */

import OpenAI from "openai";
import { createServer } from "node:http";
import { URL } from "node:url";

// -----------------------------
// OpenAI client + model config
// -----------------------------
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Use cheaper models for router/experts; stronger for editor.
 * Swap these for what your org has access to.
 */
const MODELS = {
  ROUTER: "gpt-4.1-mini",
  EXPERT: "gpt-4.1-mini",
  EDITOR: "gpt-4.1",
};

// -----------------------------
// Helpers: parsing, validation
// -----------------------------

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function assertRouterShape(obj) {
  const questionTypes = new Set([
    "lookup",
    "calculation",
    "diagnosis",
    "recommendation",
    "goal_planning",
    "crisis",
  ]);
  const emotionalStates = new Set([
    "anxious",
    "motivated",
    "defensive",
    "curious",
    "overwhelmed",
  ]);
  const urgency = new Set(["immediate", "standard", "long_term"]);

  if (!obj) throw new Error("Router output was not valid JSON.");
  if (!questionTypes.has(obj.question_type)) throw new Error("Bad question_type.");
  if (!emotionalStates.has(obj.emotional_state)) throw new Error("Bad emotional_state.");
  if (!urgency.has(obj.urgency)) throw new Error("Bad urgency.");
  if (typeof obj.follow_up_needed !== "boolean") throw new Error("Bad follow_up_needed.");
}

function detectTopicHints(question) {
  const q = question.toLowerCase();
  return {
    taxes: /tax|irs|w-2|1099|deduction|refund|withholding/.test(q),
    investing: /invest|etf|stock|bond|allocation|roth|401k|ira/.test(q),
    debt: /debt|credit card|apr|loan|interest rate|balance|collections?/.test(q),
    budgeting: /budget|spending|cash flow|expense|categor/.test(q),
    emergency: /eviction|foreclosure|shutoff|can[’']?t pay|overdraft/.test(q),
  };
}

// -----------------------------
// Modern request body reader
// -----------------------------

/**
 * Read JSON from a Node http.IncomingMessage using async iteration.
 * This avoids nested event callbacks and plays nicely with modern style.
 */
async function readJson(req, { limitBytes = 1_000_000 } = {}) {
  let size = 0;
  let raw = "";

  for await (const chunk of req) {
    size += chunk.length;
    if (size > limitBytes) throw new Error("Request body too large.");
    raw += chunk.toString("utf8");
  }

  if (!raw) return {};
  return JSON.parse(raw);
}

// -----------------------------
// Timeouts / cancellation
// -----------------------------

/**
 * Wraps a promise with a timeout using AbortController.
 * The OpenAI SDK supports `signal`.
 */
async function withTimeout(fn, ms, label = "operation") {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);

  try {
    return await fn(controller.signal);
  } catch (err) {
    // Normalize abort errors into something readable
    if (controller.signal.aborted) {
      throw new Error(`${label} timed out after ${ms}ms`);
    }
    throw err;
  } finally {
    clearTimeout(t);
  }
}

// -----------------------------
// Router (JSON)
// -----------------------------

async function routeQuestion(userQuestion) {
  const system = `
You are a strict JSON router for a financial assistant.
Return ONLY valid JSON. No markdown, no prose, no extra keys.

Schema:
{
  "question_type": "lookup|calculation|diagnosis|recommendation|goal_planning|crisis",
  "emotional_state": "anxious|motivated|defensive|curious|overwhelmed",
  "urgency": "immediate|standard|long_term",
  "follow_up_needed": true|false
}

Guidelines:
- lookup: definitions, rules, limits, how something works
- calculation: explicit math (affordability, payoff, ROI)
- diagnosis: identify causes + tests
- recommendation: choose a path + tradeoffs
- goal_planning: multi-step plan toward a target
- crisis: imminent harm (rent due now, shutoff, collections, panic)

follow_up_needed:
- true if missing inputs could change the best answer materially.
- false if reasonable assumptions still yield a useful answer.
`.trim();

  const completion = await withTimeout(
    (signal) =>
      client.chat.completions.create({
        model: MODELS.ROUTER,
        temperature: 0,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userQuestion },
        ],
        signal,
      }),
    12_000,
    "router"
  );

  const text = completion.choices?.[0]?.message?.content ?? "";
  const parsed = safeJsonParse(text);
  assertRouterShape(parsed);
  return parsed;
}

// -----------------------------
// Agent selection (2–4 agents)
// -----------------------------

function selectAgents(router, hints) {
  let agents = [];

  switch (router.question_type) {
    case "lookup":
      agents = ["facts_checker"];
      break;
    case "calculation":
      agents = ["quant"];
      break;
    case "diagnosis":
      agents = ["financial_debugger", "risk_officer"];
      break;
    case "recommendation":
      agents = ["financial_planner", "risk_officer"];
      break;
    case "goal_planning":
      agents = ["financial_planner", "behavior_coach"];
      break;
    case "crisis":
      agents = ["crisis_triage", "risk_officer"];
      break;
  }

  // Add domain specialists if strongly suggested, but cap total
  if (hints.taxes) agents.push("tax_specialist");
  if (hints.debt && router.question_type !== "lookup") agents.push("debt_specialist");
  if (hints.investing) agents.push("investment_pm");

  return [...new Set(agents)].slice(0, 4);
}

// -----------------------------
// Experts (JSON artifacts)
// -----------------------------

function expertSystemPrompt(agentName) {
  const base = `
You are an expert sub-agent assisting a financial Q&A system.
Return ONLY valid JSON. No markdown. No prose. No extra keys.

Output schema:
{
  "agent": "<name>",
  "claims": ["..."],
  "assumptions": ["..."],
  "numbers": [{"label":"...", "calculation":"...", "result":"..."}],
  "risks": ["..."],
  "questions_to_ask_user": ["..."],
  "confidence": 0.0
}

Rules:
- Do NOT write the final user-facing answer.
- Put missing inputs into questions_to_ask_user.
- confidence is 0.0 to 1.0.
- Keep it concise and mergeable.
`.trim();

  const roles = {
    facts_checker: "Role: factual explanations/definitions; note uncertainty by jurisdiction/time.",
    quant: "Role: math + formulas + assumptions; sanity-check numbers.",
    financial_debugger: "Role: diagnose causes; ranked hypotheses; tests to confirm.",
    financial_planner: "Role: recommend a path; tradeoffs; sequencing.",
    behavior_coach: "Role: make the plan doable; reduce friction; 1–3 next actions.",
    risk_officer: "Role: downside/edge cases; traps; high-stakes flags.",
    tax_specialist: "Role: tax implications/pitfalls; when to consult a CPA.",
    debt_specialist: "Role: payoff/refi/negotiation; prioritize APR/cashflow.",
    investment_pm: "Role: allocation/risk/time horizon; no single-stock pushing.",
    crisis_triage: "Role: immediate stabilization steps; housing/utilities first.",
  };

  return `${base}\n\n${roles[agentName] ?? "Role: general financial expert."}`;
}

async function runExpert({ agentName, userQuestion, router, userFacts }) {
  const system = expertSystemPrompt(agentName);
  const factsBlock = userFacts
    ? `Known user facts (may be incomplete):\n${JSON.stringify(userFacts, null, 2)}`
    : "Known user facts: none provided.";

  const completion = await withTimeout(
    (signal) =>
      client.chat.completions.create({
        model: MODELS.EXPERT,
        temperature: 0.2,
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content:
              `User question:\n${userQuestion}\n\n` +
              `Router:\n${JSON.stringify(router)}\n\n` +
              `${factsBlock}`,
          },
        ],
        signal,
      }),
    20_000,
    `expert:${agentName}`
  );

  const text = completion.choices?.[0]?.message?.content ?? "";
  const parsed = safeJsonParse(text);

  // If parsing fails, return a low-confidence fallback artifact
  if (!parsed) {
    return {
      agent: agentName,
      claims: [],
      assumptions: [],
      numbers: [],
      risks: ["Expert returned invalid JSON; ignore unless corroborated."],
      questions_to_ask_user: [],
      confidence: 0.0,
      _raw: text,
    };
  }

  parsed.agent = parsed.agent || agentName;
  return parsed;
}

// -----------------------------
// Editor (STREAM -> SSE)
// -----------------------------

function editorSystemPrompt() {
  return `
You are the final editor that produces ONE user-facing response.

Inputs you will receive:
- userQuestion
- router classification
- expertArtifacts[] (JSON)
- known user facts (optional)

Your job:
- Merge and dedupe expert insights
- Resolve conflicts; if uncertainty depends on missing info, ask 1–3 clarifying questions
- Produce a single coherent answer in a consistent structure
- Match tone to router.emotional_state:
  anxious/overwhelmed: calm, short, fewer options, lead with immediate steps
  defensive: factual, non-judgmental, explain tradeoffs
  motivated: action plan + milestones
  curious: include more "why" and alternatives

Default format:
1) One-sentence answer
2) Top 3 steps (bulleted)
3) Why this is the right path (short)
4) Assumptions (bulleted, only if needed)
5) Questions for you (ONLY if router.follow_up_needed is true)

Special cases:
- question_type=calculation: show the math + assumptions clearly.
- question_type=crisis: lead with “what to do today” and “what NOT to do”.

Do NOT mention internal agent names or that you used agents.
Output normal text (not JSON).
`.trim();
}

/**
 * SSE helpers:
 * - We send "event: token" for each chunk
 * - We send "event: done" at the end
 */
function sseInit(res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // helps with some proxies
  });
  res.write("\n");
}

function sseSend(res, event, data) {
  // data must be a single line or JSON-encoded
  res.write(`event: ${event}\n`);
  res.write(`data: ${typeof data === "string" ? data : JSON.stringify(data)}\n\n`);
}

async function streamEditorToSSE({ res, userQuestion, router, expertArtifacts, userFacts }) {
  sseInit(res);

  const factsBlock = userFacts
    ? `Known user facts (may be incomplete):\n${JSON.stringify(userFacts, null, 2)}`
    : "Known user facts: none provided.";

  const userPayload =
    `User question:\n${userQuestion}\n\n` +
    `Router:\n${JSON.stringify(router, null, 2)}\n\n` +
    `${factsBlock}\n\n` +
    `Expert artifacts (JSON):\n${JSON.stringify(expertArtifacts, null, 2)}`;

  // If the client disconnects, abort the OpenAI stream to save money.
  const controller = new AbortController();
  res.on("close", () => controller.abort());

  try {
    const stream = await client.chat.completions.create({
      model: MODELS.EDITOR,
      temperature: 0.4,
      stream: true,
      messages: [
        { role: "system", content: editorSystemPrompt() },
        { role: "user", content: userPayload },
      ],
      signal: controller.signal,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) sseSend(res, "token", delta);
    }

    sseSend(res, "done", { ok: true });
    res.end();
  } catch (err) {
    const aborted = controller.signal.aborted;
    if (!aborted) {
      sseSend(res, "error", { error: String(err) });
      res.end();
    }
  }
}

// -----------------------------
// HTTP server (ESM, modern style)
// -----------------------------

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

  // Basic health check
  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("OK. POST /ask to receive SSE stream.\n");
    return;
  }

  // Streamed endpoint
  if (req.method === "POST" && url.pathname === "/ask") {
    try {
      const { question, facts } = await readJson(req);
      const userQuestion = (question ?? "").trim();
      const userFacts = facts ?? null;

      if (!userQuestion) {
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "Missing 'question' in JSON body." }));
        return;
      }

      // 1) Router
      const router = await routeQuestion(userQuestion);

      // 2) Agent selection
      const hints = detectTopicHints(userQuestion);
      const agentNames = selectAgents(router, hints);

      // 3) Experts in parallel (non-stream)
      const expertArtifacts = await Promise.all(
        agentNames.map((agentName) =>
          runExpert({ agentName, userQuestion, router, userFacts })
        )
      );

      // 4) Stream editor output as SSE
      await streamEditorToSSE({
        res,
        userQuestion,
        router,
        expertArtifacts,
        userFacts,
      });
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "Server error", detail: String(err) }));
    }
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found\n");
});

server.listen(3000, () => {
  console.log("Listening on http://localhost:3000");
});

/**
 * Frontend consumption notes (SSE):
 * - Browser EventSource only supports GET.
 * - For POST + SSE, you typically use fetch() and read the stream, OR:
 *   - Use GET /ask?question=... for EventSource, or
 *   - Keep POST and parse SSE manually in the client.
 *
 * If you want, I can give you:
 *  - a GET-based EventSource variant (easiest)
 *  - or a React fetch-stream parser for this POST /ask endpoint
 */
