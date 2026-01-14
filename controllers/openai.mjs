import "dotenv/config";
import { getFinancialSnapshot } from '../services/financialSnapshot.js'
import { classifyQuestion, routeToExperts, runExpertAnalysis, streamFinalAnalysis } from '../services/agentRouting.js'

const runExpertsStatusOnly = async ({ experts, question, snapshot, sendStatus }) => {
  return Promise.all(
    experts.map(async (expert) => {
      sendStatus(`${expert} started...`);
      const expertResponse = await runExpertAnalysis(expert, question, snapshot);
      sendStatus(`${expert} finished.`);
      return expertResponse;
    })
  );
};


export const create = async (req, res) => {
  // ---------------------------------------------------------
  // ENTRY POINT
  // ---------------------------------------------------------
  console.log("AI Analysis kicked off");

  // Extract user inputs from the request body
  // These are required for downstream DB + AI calls
  const { question, accountId } = req.body;

  // ---------------------------------------------------------
  // SERVER-SENT EVENTS (SSE) SETUP
  // ---------------------------------------------------------
  // SSE allows us to keep a single HTTP connection open
  // and stream multiple messages back to the client over time.
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");

  // Prevent buffering by reverse proxies (nginx, etc.)
  res.setHeader("X-Accel-Buffering", "no");

  // Flush headers immediately so the client
  // knows this is an SSE connection
  res.flushHeaders?.();

  // ---------------------------------------------------------
  // SSE MESSAGE HELPERS
  // ---------------------------------------------------------

  // Sends a structured "status" event to the client.
  // Used for progress updates (non-streaming steps).
  const sendStatus = (msg) => {
    res.write(`data: ${JSON.stringify({ status: msg })}\n\n`);
  };

  // ---------------------------------------------------------
  // CONNECTION / ABORT HANDLING
  // ---------------------------------------------------------
  // Important: SSE connections can be closed by the client
  // at any time (tab closed, navigation, refresh).
  // We must stop work if that happens.
  let aborted = false;

  // Fired when client terminates request early
  req.on("aborted", () => {
    aborted = true;
  });

  // Fired when underlying connection closes
  res.on("close", () => {
    aborted = true;
  });

  // Centralized early-exit guard.
  // If the client is gone, stop processing and close response.
  const bailIfAborted = () => {
    if (!aborted) return false;
    try {
      res.end();
    } catch {}
    return true;
  };

  // ---------------------------------------------------------
  // STEP TIMING / DEBUGGING HELPER
  // ---------------------------------------------------------
  // Wraps async calls so we can see *exactly*
  // where execution hangs or slows down.
  const step = async (label, fn) => {
    console.log(`[STEP] ${label} started`);
    const start = Date.now();
    const result = await fn();
    console.log(`[STEP] ${label} finished in ${Date.now() - start}ms`);
    return result;
  };

  // ---------------------------------------------------------
  // SSE HEARTBEAT
  // ---------------------------------------------------------
  // Some proxies or browsers will kill idle SSE connections.
  // This keeps the connection alive during long AI calls.
  const heartbeat = setInterval(() => {
    res.write(`: keep-alive\n\n`);
  }, 15000);

  // ---------------------------------------------------------
  // MAIN EXECUTION FLOW
  // ---------------------------------------------------------
  try {
    // ---- 1. Fetch financial snapshot (DB / aggregation work)
    sendStatus(`Fetching financial data for account ${accountId}...`);

    const snapshot = await step("getFinancialSnapshot", () =>
      getFinancialSnapshot(accountId)
    );

    // If client disconnected while we were waiting, stop.
    if (bailIfAborted()) return;

    // ---- 2. Classify the user's question
    // Determines question type, sentiment, and data needs
    sendStatus("Routing your question to the right expert...");

    const classification = await step("classifyQuestion", () =>
      classifyQuestion(question, snapshot)
    );

    if (bailIfAborted()) return;

    // ---- 3. Select the appropriate expert agents
    const experts = await step("routeToExperts", () =>
      routeToExperts(classification, snapshot)
    );

    if (bailIfAborted()) return;

    // ---- 4. Run expert agents (NON-STREAMING)
    // Each expert only sends:
    //   - "started"
    //   - "finished"
    // Their internal reasoning is hidden from the client.
    const expertResponses = await step("runExpertsStatusOnly", () =>
      runExpertsStatusOnly({
        experts,
        question,
        snapshot,
        sendStatus,
      })
    );

    if (bailIfAborted()) return;

    // ---- 5. Final agent (STREAMING)
    // This is the only agent whose text output
    // is streamed token-by-token back to the client.
    await step("streamFinalAnalysis", () =>
      streamFinalAnalysis({
        expertResponses,
        question,
        classification,
        res,
        sendStatus,
      })
    );

    // ---- 6. Signal completion to the client
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    // ---------------------------------------------------------
    // ERROR HANDLING
    // ---------------------------------------------------------
    console.error("AI controller error:", err);

    // Even errors should be sent as SSE events
    // so the frontend can handle them gracefully.
    res.write(
      `data: ${JSON.stringify({
        error: err?.message || "Unexpected server error",
      })}\n\n`
    );

    res.end();
  } finally {
    // ---------------------------------------------------------
    // CLEANUP
    // ---------------------------------------------------------
    // Always clear heartbeat timer to avoid leaks.
    clearInterval(heartbeat);
  }
};

