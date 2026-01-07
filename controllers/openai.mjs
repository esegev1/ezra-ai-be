/**
 * openai.mjs
 * -----------------------------------------------------------------------------
 * FINANCIAL ADVISOR MULTI-AGENT PIPELINE (CHEAPER + MORE RELIABLE)
 *
 * What’s improved vs your current version:
 *  1) Uses the Responses API (recommended) + SSE streaming for the final answer. :contentReference[oaicite:0]{index=0}
 *  2) Uses Structured Outputs (JSON Schema) for Agent 1 + Agent 2 so you’re not
 *     passing “blobs of prose” between agents. :contentReference[oaicite:1]{index=1}
 *  3) Cost controls:
 *      - Smaller/cheaper model for background agents (gpt-5-mini)
 *      - Tight max_output_tokens for background agents
 *      - Snapshot is compacted before sending to the models (top N rows only)
 *      - store:false to avoid storing responses unless you explicitly want that
 *  4) Safer SSE behavior (handles client disconnects)
 *
 * Requirements:
 *   - Node.js ESM (you already are, since you use import/export)
 *   - npm i openai pg dotenv
 *   - OPENAI_API_KEY set
 *
 * NOTE:
 *   - Model IDs below assume gpt-5 / gpt-5-mini exist in your project.
 *   - If your project uses different model IDs, swap them in MODEL_CONFIG.
 */

// -----------------------------------------------------------------------------
// 0) Imports & Setup
// -----------------------------------------------------------------------------
import "dotenv/config";
import OpenAI from "openai";
import pg from "pg";

const { Pool } = pg;

// OpenAI client (Responses API lives on `client.responses.*`)
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Postgres connection
// Uses DATABASE_URL (prod) or local dev config.
const pool = process.env.DATABASE_URL
    ? new Pool({ connectionString: process.env.DATABASE_URL })
    : new Pool({
        user: "ericsegev",
        host: "localhost",
        database: "ezra_ai",
        password: "",
        port: 5432,
    });

// -----------------------------------------------------------------------------
// 1) Model + Cost Controls
// -----------------------------------------------------------------------------

/**
 * Central place to change models.
 * - Background agents: cheaper model
 * - Final agent: best model (since it’s user-facing + streamed)
 */
const MODEL_CONFIG = {
    financial: "gpt-4o-mini", // Very cheap and fast
    psychology: "gpt-4o-mini",
    final: "gpt-4o",          // High quality for the user-facing response
};

/**
 * Token budgets (key cost lever).
 * Keep background agents tight.
 */
const TOKEN_BUDGETS = {
    financial: 700,
    psychology: 550,
    final: 1400, // user-facing; adjust based on how long you want answers to be
};

/**
 * Snapshot compaction (key cost lever).
 * Avoid shipping huge DB dumps into the prompt.
 */
const SNAPSHOT_LIMITS = {
    fixedCostsTopN: 15,
    incomesTopN: 10,
    assetsTopN: 10,
    liabilitiesTopN: 10,
};

// -----------------------------------------------------------------------------
// 2) Utilities: Money / Math
// -----------------------------------------------------------------------------

/**
 * normalizeMonthlyIncome(amount, frequency)
 * Converts various pay frequencies into a standardized monthly number.
 */
const normalizeMonthlyIncome = (amount, frequency) => {
    if (!amount || !frequency) return 0;

    const frequencyMultipliers = {
        "Every 2 Weeks": (amount * 26) / 12,
        "15th And 30th": amount * 2,
        Weekly: (amount * 52) / 12,
        Monthly: amount,
    };

    return frequencyMultipliers[frequency] ?? 0;
};

/**
 * Safely convert nullable DB values to numbers.
 */
const toNum = (v) => (v ?? 0);

/**
 * Optional: format dollars for readability in logs or any debug strings.
 * (We generally avoid doing formatting inside the LLM prompt; LLM can format.)
 */
const formatUSD = (n) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
        Number(n || 0)
    );

// -----------------------------------------------------------------------------
// 3) Database Layer
// -----------------------------------------------------------------------------

/**
 * getFinancialSnapshot(accountId)
 * Fetches all relevant financial data for a specific user.
 *
 * NOTE: This returns the raw snapshot (your full lists).
 *       We then create a compact snapshot for the LLM to reduce cost.
 */
const getFinancialSnapshot = async (accountId) => {
    const [fixedCostsResult, incomesResult, assetsResult, liabilitiesResult, spendingResult] =
        await Promise.all([
            pool.query(
                `SELECT name, amount, category
                FROM fixed_costs
                WHERE account_id = $1
                ORDER BY amount DESC`,
                [accountId]
            ),
            pool.query(
                `SELECT source, amount, frequency
                FROM incomes
                WHERE account_id = $1
                ORDER BY amount DESC`,
                [accountId]
            ),
            pool.query(
                `SELECT name, category, value
                FROM assets
                WHERE account_id = $1
                ORDER BY value DESC`,
                [accountId]
            ),
            pool.query(
                `SELECT name, category, value
                FROM liabilities
                WHERE account_id = $1
                ORDER BY value DESC`,
                [accountId]
            ),
            pool.query(
                `SELECT
                    TO_CHAR(transaction_date, 'Month') name, 
                    category, 
                    SUM(amount) value
                FROM credit_cards
                WHERE account_id = $1 
                GROUP BY 1,2;`,
                [accountId]
            ),
        ]);

// Map rows -> clean objects
const fixedCosts = fixedCostsResult.rows.map(({ name, category, amount }) => ({
    name,
    category,
    amount: toNum(amount),
}));

const incomes = incomesResult.rows.map(({ source, amount, frequency }) => {
    const numAmount = toNum(amount);
    return {
        source,
        frequency,
        originalAmount: numAmount,
        monthlyAmount: normalizeMonthlyIncome(numAmount, frequency),
    };
});

const assets = assetsResult.rows.map(({ name, category, value }) => ({
    name,
    category,
    value: toNum(value),
}));

const liabilities = liabilitiesResult.rows.map(({ name, category, value }) => ({
    name,
    category,
    value: toNum(value),
}));

const spending = spendingResult.rows.map(({ name, category, value }) => ({
    name,
    category,
    value: toNum(value),
}));

// Aggregation - Use Number() to prevent string concatenation
const totalFixedCosts = fixedCosts.reduce((sum, { amount }) => sum + Number(amount || 0), 0);
const totalMonthlyIncome = incomes.reduce((sum, { monthlyAmount }) => sum + Number(monthlyAmount || 0), 0);
const totalAssets = assets.reduce((sum, { value }) => sum + Number(value || 0), 0);
const totalLiabilities = liabilities.reduce((sum, { value }) => sum + Number(value || 0), 0);
const totalSpending = spending.reduce((sum, { value }) => sum + Number(value || 0), 0);

return {
    fixedCosts,
    incomes,
    assets,
    liabilities,
    spending,
    totals: {
        totalFixedCosts,
        totalMonthlyIncome,
        totalAssets,
        totalLiabilities,
        totalSpending,
        netWorthApprox: totalAssets - totalLiabilities,
        monthlyCashflowApprox: totalMonthlyIncome - totalFixedCosts - totalSpending,
    },
};
};

/**
 * compactSnapshotForLLM(snapshot)
 * Reduces payload size while keeping what matters:
 * - totals
 * - top N items per category
 */
const compactSnapshotForLLM = (snapshot) => {
    const topN = (arr, n) => (Array.isArray(arr) ? arr.slice(0, n) : []);

    return {
        totals: snapshot?.totals ?? {},
        fixedCostsTop: topN(snapshot?.fixedCosts, SNAPSHOT_LIMITS.fixedCostsTopN),
        incomesTop: topN(snapshot?.incomes, SNAPSHOT_LIMITS.incomesTopN),
        assetsTop: topN(snapshot?.assets, SNAPSHOT_LIMITS.assetsTopN),
        liabilitiesTop: topN(snapshot?.liabilities, SNAPSHOT_LIMITS.liabilitiesTopN),
        notes: snapshot?.variableSpendNote ?? "",
    };
};

// -----------------------------------------------------------------------------
// 4) SSE Helpers (Server-Sent Events)
// -----------------------------------------------------------------------------

/**
 * sendSSE(res, data)
 * Sends a single SSE message to the frontend.
 */
const sendSSE = (res, data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
};

/**
 * Setup SSE headers.
 */
const setSSEHeaders = (res) => {
    const sseHeaders = {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
    };
    Object.entries(sseHeaders).forEach(([k, v]) => res.setHeader(k, v));
};

/**
 * Extract text from a non-streaming Responses API response.
 * The Responses API returns an object with `output` items which contain content parts.
 * We'll join all "output_text" parts into one string.
 */
const extractOutputText = (response) => {
    const output = response?.output ?? [];
    let text = "";

    for (const item of output) {
        if (item?.type !== "message") continue;
        const content = item?.content ?? [];
        for (const part of content) {
            if (part?.type === "output_text" && typeof part?.text === "string") {
                text += part.text;
            }
        }
    }

    return text.trim();
};

/**
 * Streams a Responses API stream to the browser via SSE.
 * We listen for `response.output_text.delta` events and forward their `.delta`.
 * :contentReference[oaicite:2]{index=2}
 */
const streamResponseTextToSSE = async (stream, res, sseType = "answer") => {
    let fullText = "";

    for await (const event of stream) {
        if (!event?.type) continue;

        if (event.type === "response.output_text.delta") {
            const delta = event.delta ?? "";
            if (delta) {
                fullText += delta;
                sendSSE(res, { type: `${sseType}_chunk`, content: delta });
            }
        }

        // You can optionally forward lifecycle events to the client if you want.
        // Example:
        // if (event.type === "response.completed") { ... }
    }

    return fullText.trim();
};

// -----------------------------------------------------------------------------
// 5) Structured Output Schemas (JSON Schema)
// -----------------------------------------------------------------------------

/**
 * Agent 1: financial analysis -> structured plan.
 * Keep schema lean; big schemas increase prompt tokens and can cause brittleness.
 */
const FINANCIAL_PLAN_SCHEMA = {
    name: "financial_plan",
    schema: {
        type: "object",
        additionalProperties: false,
        properties: {
            key_metrics: {
                type: "object",
                additionalProperties: false,
                properties: {
                    monthly_income: { type: "number" },
                    fixed_costs: { type: "number" },
                    monthly_spending: { type: "number" },
                    monthly_cashflow: { type: "number" },
                    net_worth: { type: "number" },
                },
                required: ["monthly_income", "fixed_costs", "monthly_spending", "monthly_cashflow", "net_worth"],
            },
            diagnosis: {
                type: "array",
                items: { type: "string" },
            },
            top_actions: {
                type: "array",
                items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                        title: { type: "string" },
                        why_it_matters: { type: "string" },
                        next_step: { type: "string" },
                        impact: { type: "string", enum: ["high", "medium", "low"] },
                    },
                    required: ["title", "why_it_matters", "next_step", "impact"],
                },
            },
            clarifying_questions: {
                type: "array",
                items: { type: "string" },
            },
            assumptions: {
                type: "array",
                items: { type: "string" },
            },
        },
        required: ["key_metrics", "diagnosis", "top_actions", "clarifying_questions", "assumptions"],
    },
};

/**
 * Agent 2: psychology coach -> rewrite the plan in a motivational, non-shaming way
 * while keeping the core actions intact.
 */
const MOTIVATION_SCHEMA = {
    name: "motivational_rewrite",
    schema: {
        type: "object",
        additionalProperties: false,
        properties: {
            tone_principles: {
                type: "array",
                items: { type: "string" },
            },
            rewritten_summary: { type: "string" },
            rewritten_actions: {
                type: "array",
                items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                        title: { type: "string" },
                        motivating_why: { type: "string" },
                        next_step: { type: "string" },
                    },
                    required: ["title", "motivating_why", "next_step"],
                },
            },
        },
        required: ["tone_principles", "rewritten_summary", "rewritten_actions"],
    },
};

// -----------------------------------------------------------------------------
// 6) Agent System Prompts
// -----------------------------------------------------------------------------

const AGENT_CONFIGS = {
    financial: {
        systemPrompt: [
            "You are a financial advisor who believes in the importance of saving for the future and the value of compounding interest",
            "You receive a snapshot of a user's finances.",
            "Your job: Answer the user's questions based on the financial snapshot.",
            "be realistic abiout their financial situation and what is best for them.", 
            "Determine what is best for them by optimizing for their future",
            "look at their total spending as part of their monthly budget",
            "Important rules:",
            "- Use the provided data as truth; do not invent numbers.",,
            "- Keep actions concrete and high leverage.",
            "Reference the numbers and math based on the numbers from the snapshot in your response."
        ].join("\n"),
        startMessage: "🔍 Our financial advisor is taking a look at your assets, income and spending...",
        completeMessage: "✅ Financial analysis complete",
    },

    psychology: {
        systemPrompt: [
            "You are a world class psychologist who practices psycho-analysis",
            "Look at the Financial Plan JSON and the Financial snapshot, ",
            "and then come up with a response to the user's orignal question.",
            "Reference specific numbers from the financial snapshot, add any other metrics you feel are worth sharing.",
            "You can calcualte some metrics by using the Financial snapshot if it make sense",
            "Avoid guilt, avoid catastrophizing, and use 'small wins' framing.",
            "Keep the plan practical and specific.",
            "Keep actions aligned with the plan (no new actions unless absolutely necessary).",
            "IMPORTANT: Do not come up with your own finanicial guidance, rely on the financial advisor for that.",
        ].join("\n"),
        startMessage: "💡 Next, our behavioral specialist is thinking through the perfect way to explain the data...",
        completeMessage: "✅ Behavioral coaching complete",
    },

    final: {
        systemPrompt: [
            "You are a marketing + communications specialist for a financial coaching app.",
            "Your goal: take the inputs from FINANCIAL PLAN (JSON) and the TONE + MOTIVATIONAL REWRITE (JSON) and,",
            "then present the plan clearly, with a friendly and confident tone.",
            "Make it skimmable and 'dashboard-like': headings, bullets, short paragraphs.",
            "Make sure to include specific metrics and calculations from the data you recieved form the financial expert",
            "Call out: key metrics, what’s going well, the 3–5 next best moves, and what to track next.",
            "IMPORTANT: Do not come up with your own finanicial guidance, rely on the financial advisor for that.",
            "Do NOT mention internal agents or schemas.",
        ].join("\n"),
        startMessage: "✍️ Lastly, our experts are preparing their fidnings for you...",
        completeMessage: "✅ Response ready",
    },
};

// -----------------------------------------------------------------------------
// 7) OpenAI Helpers (Responses API)
// -----------------------------------------------------------------------------

/**
 * createStructuredResponse({ model, system, user, schema, maxOutputTokens })
 * Uses Responses API + Structured Outputs (json_schema) to force schema-compliant JSON.
 * :contentReference[oaicite:3]{index=3}
 */
const createStructuredResponse = async ({
    model,
    system,
    user,
    schema,
    maxOutputTokens,
}) => {
    const response = await client.chat.completions.create({
        model: model,
        messages: [
            { role: "system", content: system },
            { role: "user", content: user }
        ],
        response_format: {
            type: "json_schema",
            json_schema: schema // Note: standard API uses 'json_schema' key here
        },
        max_tokens: maxOutputTokens,
        temperature: 0.3,
    });

    const raw = response.choices[0].message.content;

    // The model should return valid JSON per schema.
    // Still, we harden parsing so your app doesn’t crash if something changes.
    try {
        return JSON.parse(raw);
    } catch (e) {
        // Fallback: return something actionable instead of blowing up.
        return {
            _parse_error: true,
            _raw: raw,
        };
    }
};

/**
 * createStreamingFinalResponse({ model, system, user, maxOutputTokens })
 * Streams final answer text to the server (we then forward to browser via SSE).
 * :contentReference[oaicite:4]{index=4}
 */
const createStreamingFinalResponse = async ({
    model,
    system,
    user,
    maxOutputTokens,
}) => {
    const stream = await client.responses.create({
        model,
        instructions: system,
        input: [{ role: "user", content: user }],
        stream: true,
        max_output_tokens: maxOutputTokens,
        temperature: 0.6,
        store: false,
    });

    return stream;
};

// -----------------------------------------------------------------------------
// 8) Controller: question(req, res)
// -----------------------------------------------------------------------------
export const question = async (req, res) => {
    console.log("AI Analysis kicked off");

    // Track disconnects correctly for SSE
    let clientDisconnected = false;

    req.on("aborted", () => {
        clientDisconnected = true;
        console.log("❌ Request aborted by client");
    });

    res.on("close", () => {
        clientDisconnected = true;
        console.log("❌ Response closed (client likely disconnected)");
    });

    res.on("finish", () => {
        console.log("✅ Response finished");
    });

    const safeEnd = () => {
        try {
            // If we’re in SSE mode, this ends the stream cleanly.
            res.end();
        } catch {
            // no-op
        }
    };

    // Optional: make SSE writes resilient to backpressure
    const sendSSESafe = async (data) => {
        if (clientDisconnected) return;

        const payload = `data: ${JSON.stringify(data)}\n\n`;
        const ok = res.write(payload);

        // If the internal buffer is full, wait for drain
        if (!ok) {
            await new Promise((resolve) => res.once("drain", resolve));
        }
    };

    try {
        const { question: userQuestion, accountId } = req.body ?? {};

        // 1) Validate
        if (!userQuestion?.trim() || !accountId?.trim()) {
            return res.status(400).json({ error: "Missing question or accountId." });
        }

        // 2) SSE headers + flush immediately
        setSSEHeaders(res);

        // If you use Express + compression middleware, this helps prevent buffering.
        // (Safe even if compression isn’t enabled.)
        res.setHeader("Content-Encoding", "identity");

        // Flush headers ASAP so the client actually “opens” the stream
        if (typeof res.flushHeaders === "function") res.flushHeaders();

        // Send an initial comment ping to ensure the connection is established
        res.write(":\n\n");

        await sendSSESafe({
            type: "status",
            message: "📊 Analyzing your financial data...",
            stage: "initial",
        });

        // 3) Fetch Data
        const snapshot = await getFinancialSnapshot(accountId);
        console.log("snapshot: ", snapshot)
        // const compactSnapshot = compactSnapshotForLLM(snapshot);

        // 4) If client disconnected already, end cleanly
        if (clientDisconnected) return safeEnd();
        console.log("✅ client still connected (post-snapshot)");

        // -----------------------------------------------------------------------
        // Agent 1: Financial Expert (structured JSON, non-streaming)
        // -----------------------------------------------------------------------
        await sendSSESafe({
            type: "agent_start",
            agent: "financial",
            message: AGENT_CONFIGS.financial.startMessage,
        });

        console.log("message:", AGENT_CONFIGS.financial.startMessage);

        const financialPlan = await createStructuredResponse({
            model: MODEL_CONFIG.financial,
            system: AGENT_CONFIGS.financial.systemPrompt,
            maxOutputTokens: TOKEN_BUDGETS.financial,
            schema: FINANCIAL_PLAN_SCHEMA,
            user: [
                `User question: ${userQuestion}`,
                "",
                `Financial snapshot : ${JSON.stringify(snapshot)}`,
            ].join("\n"),
        });

        if (clientDisconnected) return safeEnd();

        await sendSSESafe({
            type: "agent_complete",
            agent: "financial",
            message: AGENT_CONFIGS.financial.completeMessage,
        });

        // NOTE: you had a typo here: complegeMessage -> completeMessage
        console.log("message:", AGENT_CONFIGS.financial.completeMessage);

        // -----------------------------------------------------------------------
        // Agent 2: Psychology Coach (structured JSON, non-streaming)
        // -----------------------------------------------------------------------
        if (clientDisconnected) return safeEnd();
        console.log("✅ client still connected (pre-psychology)");

        await sendSSESafe({
            type: "agent_start",
            agent: "psychology",
            message: AGENT_CONFIGS.psychology.startMessage,
        });

        console.log("message:", AGENT_CONFIGS.psychology.startMessage);

        const motivation = await createStructuredResponse({
            model: MODEL_CONFIG.psychology,
            system: AGENT_CONFIGS.psychology.systemPrompt,
            maxOutputTokens: TOKEN_BUDGETS.psychology,
            schema: MOTIVATION_SCHEMA,
            user: [
                `Original question: ${userQuestion}`,
                "",
                `Financial plan JSON: ${JSON.stringify(financialPlan)}`,
                "",
                `Financial snapshot : ${JSON.stringify(snapshot)}`,
                ".",
            ].join("\n"),
        });

        if (clientDisconnected) return safeEnd();

        await sendSSESafe({
            type: "agent_complete",
            agent: "psychology",
            message: AGENT_CONFIGS.psychology.completeMessage,
        });

        console.log("message:", AGENT_CONFIGS.psychology.completeMessage);

        // -----------------------------------------------------------------------
        // Agent 3: Final Communications Specialist (streaming)
        // -----------------------------------------------------------------------
        if (clientDisconnected) return safeEnd();
        console.log("✅ client still connected (pre-final)");

        await sendSSESafe({
            type: "agent_start",
            agent: "final",
            message: AGENT_CONFIGS.final.startMessage,
        });

        console.log("message:", AGENT_CONFIGS.final.startMessage);

        const finalPrompt = [
            `User question: ${userQuestion}`,
            "",
            "=== KEY FINANCIAL DATA ===",
            JSON.stringify(snapshot),
            "",
            "=== FINANCIAL PLAN (JSON) ===",
            JSON.stringify(financialPlan),
            "",
            "=== TONE + MOTIVATIONAL REWRITE (JSON) ===",
            JSON.stringify(motivation),
            "",
            "Now write the final user-facing response.",
            "Format requirements:",
            "- Start with a 1–2 sentence ‘headline’ summary.",
            "add aditional sections as needed you can consider giving the user next steps,",
            "or any structured guidance you see fit",
            // "- Include ‘What to do next (top 3–5)’ with clear steps.",
            // "- Include ‘What to track next’ (since variable spend is missing).",
            // "- Keep it encouraging and non-shaming.",
        ].join("\n");

        const finalStream = await createStreamingFinalResponse({
            model: MODEL_CONFIG.final,
            system: AGENT_CONFIGS.final.systemPrompt,
            user: finalPrompt,
            maxOutputTokens: TOKEN_BUDGETS.final,
        });

        if (clientDisconnected) return safeEnd();

        // Stream deltas to the client (this function uses your existing sendSSE)
        // We’ll rely on it, but ensure we end if client disconnects mid-stream.
        const finalUserFacingResponse = await streamResponseTextToSSE(
            finalStream,
            res,
            "answer"
        );

        if (clientDisconnected) return safeEnd();

        await sendSSESafe({
            type: "agent_complete",
            agent: "final",
            message: AGENT_CONFIGS.final.completeMessage,
        });

        // Signal completion
        await sendSSESafe({ type: "complete", answer: finalUserFacingResponse });

        // Optional terminal sentinel for your frontend
        res.write("data: [DONE]\n\n");
        safeEnd();

        console.log("AI Analysis finished");
    } catch (err) {
        console.error("Error in AI Controller:", err);

        // If we’re already streaming SSE, try to send an SSE error then end.
        try {
            // Ensure headers are set if they weren’t already
            if (!res.headersSent) {
                setSSEHeaders(res);
                if (typeof res.flushHeaders === "function") res.flushHeaders();
                res.write(":\n\n");
            }

            const msg = err?.message ?? "Unknown error";
            res.write(`data: ${JSON.stringify({ type: "error", message: msg })}\n\n`);
            safeEnd();
        } catch {
            // Fallback to normal JSON if SSE fails
            try {
                res.status(500).json({ error: err?.message ?? "Unknown error" });
            } catch {
                // last resort
                safeEnd();
            }
        }
    }
};
