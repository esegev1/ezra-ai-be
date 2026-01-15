import "dotenv/config";
import OpenAI from "openai";
import { expertPanel } from "./agents.js";

// OpenAI client (Responses API lives on `client.responses.*`)
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Central place to change models.
 * - Background agents: cheaper model
 * - Final agent: best model (since it’s user-facing + streamed)
 */
const MODEL_CONFIG = {
    router: "gpt-4.1-mini", // Very cheap and fast
    expert: "gpt-4.1-mini",
    editor: "gpt-4.1",          // High quality for the user-facing response
};

const INTENT_ROUTER_SCHEMA = {
  question_type: ['lookup', 'calculation', 'analysis', 'future_planning', 'tax'],
  emotional_state: ['anxious', 'motivated', 'defensive', 'curious'],
};


export const classifyQuestion = async (question, snapshot) => {
  const response = await client.chat.completions.create({
    model: MODEL_CONFIG.router,
    messages: [{
      role: "system",
      content: ` Pick the item from each array that best describes the user's question for each category/key in the object: ${JSON.stringify(INTENT_ROUTER_SCHEMA)}.
      
                Use the below to understand how to determine the question type:
                lookups: Can be answered with 1-2 numbers from the Available data.
                calculations: Require math but no judgment calls.
                diagnosis: Need financial expertise to interpret.
                recommendation: Require advice/strategy.
                goal_planning: Need to have a long term view of finances to determine the right steps to take
                Complex: Multi-faceted questions needing full analysis (can't be categorized as one of the previous categories).
                `
    }, {
      role: "user", 
      content: `Question: "${question}"\n\nAvailable data: ${JSON.stringify(snapshot.totals)}`
    }],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "question_classification",
        schema: {
          type: "object",
          properties: {
            question_type: { type: "string", enum: Object.values(INTENT_ROUTER_SCHEMA.question_type), reasoning: {type: "string"} },
            emotional_state: { type: "string", enum: Object.values(INTENT_ROUTER_SCHEMA.emotional_state), reasoning: {type: "string"} },            
            required_data: { type: "array", items: { type: "string" } }
          },
          required: ["type", "reasoning"]
        }
      }
    },
    max_tokens: 150
  });

  console.log("routing response: ", response.choices[0].message.content)
  
  return JSON.parse(response.choices[0].message.content);
};


export const routeToExperts = (classification, snapshot) => {
  const experts = ["financial_analyst"]; // Always runs
  
  // Add specialists based on intent
  if (classification.question_type === "recommendation") {
    experts.push("behavioral_economist");
  }
  
  if (classification.emotional_state === "anxious" || classification.emotional_state === "defensive") {
    experts.push("behavioral_therapist"); // Triage first
  }
  
  if (snapshot.totals.totalLiabilities > 0) {
    experts.push("debt_strategist");
  }
  
  if (classification.question_type.includes("tax")) {
    experts.push("tax_optimizer");
  }
  
  if (classification.question_type === "future_planning") {
    experts.push("goal_architect");
  }
  
  // Always synthesize with persuasion coach
//   experts.push("persuasion_coach");
  
  return experts;
};

export const runExpertAnalysis = async (expert, question, snapshot) => {
  const panel = expertPanel[expert];

  if (!panel) throw new Error(`Unknown expert "${expert}"`);
  if (!panel.output_schema) return null; // skip persuasion_coach or any non-schema expert

  // Pattern A: output_schema is a PROPERTIES MAP
  const properties = panel.output_schema;

  if (!properties || typeof properties !== "object" || Array.isArray(properties)) {
    throw new Error(`output_schema for "${expert}" must be an object map of properties`);
  }

  // Build the FULL schema at call-time (required by OpenAI strict schema)
  const fullSchema = {
    type: "object",
    properties,
    required: Object.keys(properties),     // ✅ auto: includes every top-level key (e.g., "patterns")
    additionalProperties: false            // ✅ required by OpenAI strict schema
  };

  const response = await client.chat.completions.create({
    model: MODEL_CONFIG.expert,
    messages: [
      {
        role: "system",
        content: `${panel.prompt}
You must output your analysis in the specific JSON format provided.`
      },
      {
        role: "user",
        content: `Question: ${question}\nData to review:\n${JSON.stringify(snapshot)}`
      }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "expert_analysis",
        strict: true,
        schema: fullSchema
      }
    }
  });

  const parsedData = JSON.parse(response.choices[0].message.content);
  console.log("parsedData: ", parsedData);
  return { expertId: expert, data: parsedData };
};

export const runFinalAnalysis = async (expertResponses, question, classification) => {
    const response = await client.chat.completions.create({
        model: MODEL_CONFIG.editor,
        messages: [
        {
            role: "system",
            content: `${expertPanel["persuasion_coach"]}.
                    You also have detailed notes form our experts: ${expertResponses}.`
        },
        {
            role: "user",
            content: `Question: ${question}\nClassification\n${classification}`
        }
        ],
    });

    return response;
}


export const streamFinalAnalysis = async ({ expertResponses, question, classification, res, snapshot }) => {
  const input = [
    {
      role: "system",
      content: `You are the final expert. Use the other experts' results. Stream a clear final answer.
                Results from other experts: ${JSON.stringify(expertResponses)} 
                Use this snapshot as reference data about the user: ${JSON.stringify(snapshot)}`
    },
    {
      role: "user",
      content: JSON.stringify({ question, classification})
    }
  ];

  // console.log("input: ", input);

  const stream = await client.responses.create({
    model: "gpt-4.1-mini", // pick your model
    input,
    stream: true,
  });

  // Stream events -> SSE
  for await (const event of stream) {
    // The exact event types vary slightly by SDK version, but these are the common ones:
    if (event.type === "response.output_text.delta") {
      res.write(`data: ${JSON.stringify({ delta: event.delta })}\n\n`);
    }

    if (event.type === "response.completed") {
      // Optional: final status
    //   sendStatus("Final expert finished.");
    }
  }

  // Tell the client we're done
  res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
};


