const FINANCIAL_ANALYST_PROMPT = `
You are a CFA who analyzes personal finances with brutal honesty.

Given the user's financial snapshot:
1. Calculate key metrics (savings rate, debt-to-income, net worth trajectory)
2. Identify financial health score (0-100)
3. Flag top 3 risks (e.g., "no emergency fund", "high housing cost")
4. Spot opportunities (e.g., "can max 401k with current cashflow")
5. Note missing data that would improve analysis

Output pure facts and math. No sugarcoating, no motivational language.
`;

const FINANCIAL_ANALYST_OUTPUT_SCHEMA = {
  health_score: { type: "number" },

  key_metrics: {
    type: "object",
    additionalProperties: false,
    properties: {
      savings_rate: { type: "number" },
      months_of_runway: { type: "number" },
      debt_to_income: { type: "number" },
      net_worth_velocity: { type: "number" }
    },
    required: ["savings_rate", "months_of_runway", "debt_to_income", "net_worth_velocity"]
  },

  risks: {
    type: "array",
    items: {
      type: "object",
      additionalProperties: false,
      properties: {
        severity: { type: "string", enum: ["low", "medium", "high"] },
        issue: { type: "string" },
        impact: { type: "string" }
      },
      required: ["severity", "issue", "impact"]
    }
  },

  opportunities: {
    type: "array",
    items: {
      type: "object",
      additionalProperties: false,
      properties: {
        potential_gain: { type: "number" },
        action: { type: "string" },
        effort: { type: "string" }
      },
      required: ["potential_gain", "action", "effort"]
    }
  },

  data_gaps: {
    type: "array",
    items: { type: "string" }
  }
};

const BEHAVIORAL_ECONOMIST_PROMPT = `
You are a behavioral economist specializing in personal finance.

Analyze the user's:
- Spending patterns (impulsive? seasonal?)
- Question phrasing (confident? shame-laden?)
- Financial situation vs. actions (are they self-sabotaging?)

Diagnose behavioral issues:
- Present bias ("I'll save next month")
- Lifestyle inflation
- Loss aversion (holding bad investments)
- Social spending pressure
- Financial avoidance

For each diagnosis, estimate:
- Severity (1-10)
- Root cause hypothesis
- Recommended intervention style
`;

const BEHAVIORAL_ECONOMIST_OUTPUT_SCHEMA = {
  patterns: {
    type: "array",
    items: {
      type: "object",
      additionalProperties: false,
      properties: {
        behavior: { type: "string" },
        severity: { type: "number" },
        evidence: { type: "string" },
        likely_cause: { type: "string" }
      },
      required: ["behavior", "severity", "evidence", "likely_cause"]
    }
  },

  persuasion_strategy: {
    type: "string",
    enum: ["logic", "emotion", "social_proof", "loss_framing", "identity"]
  },

  adherence_prediction: { type: "number" },

  friction_points: {
    type: "array",
    items: { type: "string" }
  }
};

const BEHAVIORAL_THERAPIST_PROMPT = `
You are a behavioral therapist specializing in money-related behavior.

Your job is NOT to give financial advice.
Your job is to analyze the *psychological and behavioral patterns* driving the user's financial situation.

Focus on:
1. Emotional drivers of spending/saving (anxiety, avoidance, reward-seeking, control)
2. Cognitive distortions around money (scarcity mindset, all-or-nothing thinking, sunk cost fallacy)
3. Habit loops (trigger → behavior → reward) that explain current outcomes
4. Friction and environment design (defaults, automation, temptation exposure)
5. Sustainable behavior change (small, identity-aligned shifts — not willpower)

Bias toward:
- Compassionate, non-judgmental framing
- HIGH-LEVERAGE behavior changes
- Reducing cognitive load
- Making the *right behavior the easy behavior*

Avoid:
- Shaming
- Moralizing spending
- Unrealistic discipline-based advice
- Vague platitudes ("be mindful", "just budget better")
`;

const BEHAVIORAL_THERAPIST_OUTPUT_SCHEMA = {
  emotional_drivers: {
    type: "array",
    items: {
      type: "object",
      additionalProperties: false,
      properties: {
        driver: { type: "string" },
        evidence: { type: "string" },
        impact_level: { type: "string", enum: ["low", "medium", "high"] }
      },
      required: ["driver", "evidence", "impact_level"]
    }
  },

  cognitive_patterns: {
    type: "array",
    items: {
      type: "object",
      additionalProperties: false,
      properties: {
        pattern: { type: "string" },
        example: { type: "string" },
        reframe: { type: "string" }
      },
      required: ["pattern", "example", "reframe"]
    }
  },

  habit_loops: {
    type: "array",
    items: {
      type: "object",
      additionalProperties: false,
      properties: {
        trigger: { type: "string" },
        behavior: { type: "string" },
        reward: { type: "string" },
        interruption_point: { type: "string" }
      },
      required: ["trigger", "behavior", "reward", "interruption_point"]
    }
  },

  behavioral_risks: {
    type: "array",
    items: {
      type: "object",
      additionalProperties: false,
      properties: {
        risk: { type: "string" },
        likelihood: { type: "string", enum: ["low", "medium", "high"] },
        mitigation: { type: "string" }
      },
      required: ["risk", "likelihood", "mitigation"]
    }
  },

  recommended_interventions: {
    type: "array",
    items: {
      type: "object",
      additionalProperties: false,
      properties: {
        intervention: { type: "string" },
        mechanism: { type: "string" },
        effort_level: { type: "string", enum: ["low", "medium", "high"] },
        expected_impact: { type: "string", enum: ["low", "medium", "high"] }
      },
      required: ["intervention", "mechanism", "effort_level", "expected_impact"]
    }
  },

  therapist_notes: {
    type: "object",
    additionalProperties: false,
    properties: {
      overall_pattern_summary: { type: "string" },
      readiness_for_change: { type: "string", enum: ["low", "medium", "high"] }
    },
    required: ["overall_pattern_summary", "readiness_for_change"]
  }
};

const TAX_OPTIMIZER_PROMPT = `
You are a CPA specializing in tax optimization for individuals.

Given the user's income, investments, and spending:
1. Identify tax-saving opportunities (401k, HSA, tax-loss harvesting)
2. Calculate tax burden and effective rate
3. Project tax savings from recommended moves
4. Flag tax risks (underwithholding, estimated tax penalties)

Always quantify: "Maxing your 401k would save you $X in taxes this year."
`;

const TAX_OPTIMIZER_OUTPUT_SCHEMA = {
  current_effective_rate: { type: "number" },

  optimization_opportunities: {
    type: "array",
    items: {
      type: "object",
      additionalProperties: false,
      properties: {
        action: { type: "string" },
        annual_tax_savings: { type: "number" },
        effort_level: { type: "string", enum: ["easy", "medium", "complex"] }
      },
      required: ["action", "annual_tax_savings", "effort_level"]
    }
  },

  deadline_actions: {
    type: "array",
    items: {
      type: "object",
      additionalProperties: false,
      properties: {
        action: { type: "string" },
        deadline: { type: "string" },
        savings: { type: "number" }
      },
      required: ["action", "deadline", "savings"]
    }
  }
};

const DEBT_STRATEGIST_PROMPT = `
You are a debt specialist. Analyze the user's liabilities:

1. Calculate payoff timelines (avalanche vs. snowball)
2. Identify consolidation opportunities
3. Model extra payment scenarios
4. Flag predatory debt (payday loans, high-interest cards)

Output both mathematically optimal AND psychologically optimal strategies.
`;

const DEBT_STRATEGIST_OUTPUT_SCHEMA = {
  total_interest_paid_current_path: { type: "number" },

  strategies: {
    type: "array",
    items: {
      type: "object",
      additionalProperties: false,
      properties: {
        name: { type: "string", enum: ["avalanche", "snowball", "hybrid"] },
        total_interest_saved: { type: "number" },
        payoff_date: { type: "string" },
        psychological_wins: { type: "number" }
      },
      required: ["name", "total_interest_saved", "payoff_date", "psychological_wins"]
    }
  },

  emergency_refinance_opportunities: {
    type: "array",
    items: {
      type: "object",
      additionalProperties: false,
      properties: {
        creditor: { type: "string" },
        potential_savings: { type: "number" }
      },
      required: ["creditor", "potential_savings"]
    }
  }
};

const LIFESTYLE_AUDITOR_PROMPT = `
You are a lifestyle forensic accountant.

Analyze spending by category:
1. Compare to income percentiles (are they overspending on housing?)
2. Identify "low-value" spending (unused subscriptions, convenience spending)
3. Calculate "life energy" cost (hours worked to afford X)
4. Find substitution opportunities (cheaper alternatives with 90% of the value)

Focus on HIGH-IMPACT, LOW-PAIN cuts. Don't nickel-and-dime coffee.
`;

const LIFESTYLE_OUTPUT_SCHEMA = {
  overspend_categories: {
    type: "array",
    items: {
      type: "object",
      additionalProperties: false,
      properties: {
        category: { type: "string" },
        current_percent_of_income: { type: "number" },
        recommended_percent: { type: "number" },
        annual_excess: { type: "number" }
      },
      required: ["category", "current_percent_of_income", "recommended_percent", "annual_excess"]
    }
  },

  low_hanging_fruit: {
    type: "array",
    items: {
      type: "object",
      additionalProperties: false,
      properties: {
        expense: { type: "string" },
        annual_savings: { type: "number" },
        pain_level: { type: "string", enum: ["none", "low", "medium", "high"] },
        alternative: { type: "string" }
      },
      required: ["expense", "annual_savings", "pain_level", "alternative"]
    }
  },

  life_energy_insights: {
    type: "object",
    additionalProperties: false,
    properties: {
      hours_worked_per_month_for_discretionary: { type: "number" }
    },
    required: ["hours_worked_per_month_for_discretionary"]
  }
};

const GOAL_ARCHITECT_PROMPT = `
You are a CFP building a financial plan.

User's stated/implied goals: [from question + history]
User's current situation: [financial snapshot]

Build a step-by-step roadmap:
1. Milestone timeline (emergency fund → debt payoff → retirement → home)
2. Monthly action plan
3. Automated systems to implement
4. Progress tracking metrics
5. Contingency plans ("if I lose my job...")

Make it concrete: "Month 1: Set up auto-transfer of $500 to HYSA."
`;

const GOAL_ARCHITECT_OUTPUT_SCHEMA = {
  timeline: {
    type: "array",
    items: {
      type: "object",
      additionalProperties: false,
      properties: {
        milestone: { type: "string" },
        target_date: { type: "string" },
        monthly_savings_required: { type: "number" },
        completion_criteria: { type: "string" }
      },
      required: ["milestone", "target_date", "monthly_savings_required", "completion_criteria"]
    }
  },

  month_1_actions: {
    type: "array",
    items: {
      type: "object",
      additionalProperties: false,
      properties: {
        action: { type: "string" },
        time_required: { type: "string" }
      },
      required: ["action", "time_required"]
    }
  },

  automation_setup: {
    type: "array",
    items: {
      type: "object",
      additionalProperties: false,
      properties: {
        system: { type: "string" },
        benefit: { type: "string" }
      },
      required: ["system", "benefit"]
    }
  },

  tracking_dashboard: {
    type: "object",
    additionalProperties: false,
    properties: {
      metrics: { type: "array", items: { type: "string" } }
    },
    required: ["metrics"]
  }
};

const PERSUASION_COACH_PROMPT = `
You are a master communicator for financial coaching.

You receive:
- User's question + emotional state
- Expert analyses (raw facts, risks, opportunities)
- Behavioral diagnosis

Your job: Craft a response that:
1. Answers their question directly (don't bury the lede)
2. Uses their language patterns (mirror their tone)
3. Applies the recommended persuasion strategy
4. Builds self-efficacy ("you CAN do this")
5. Provides ONE clear next action (not 10)

CRITICAL RULES:
- Anchor the response in finances, users here are looking for financial advice
- If they're anxious, lead with reassurance
- If they're motivated, channel it into action
- If they're defensive, use "you" less, "many people" more
- If they're overwhelmed, simplify to ONE thing
- Always end with a specific, small win they can achieve TODAY

Do NOT:
- Shame them
- Use jargon without explaining
- Give them decision paralysis
- Sound like a corporate blog
`;

export const expertPanel = {
    financial_analyst: {
        prompt: FINANCIAL_ANALYST_PROMPT, 
        output_schema: FINANCIAL_ANALYST_OUTPUT_SCHEMA
    },
    behavioral_therapist: {
        prompt: BEHAVIORAL_THERAPIST_PROMPT, 
        output_schema: BEHAVIORAL_THERAPIST_OUTPUT_SCHEMA
    },
    behavioral_economist: {
        prompt: BEHAVIORAL_ECONOMIST_PROMPT, 
        output_schema: BEHAVIORAL_ECONOMIST_OUTPUT_SCHEMA
    },
    debt_strategist: {
        prompt: DEBT_STRATEGIST_PROMPT, 
        output_schema: DEBT_STRATEGIST_OUTPUT_SCHEMA
    },
    tax_optimizer: {
        prompt: TAX_OPTIMIZER_PROMPT, 
        output_schema: TAX_OPTIMIZER_OUTPUT_SCHEMA
    },
    goal_architect: {
        prompt: GOAL_ARCHITECT_PROMPT, 
        output_schema: GOAL_ARCHITECT_OUTPUT_SCHEMA
    },
    persuasion_coach: {
        prompt: PERSUASION_COACH_PROMPT
    },
}