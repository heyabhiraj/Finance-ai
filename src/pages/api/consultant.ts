import type { APIRoute } from "astro";
import { GoogleGenerativeAI } from "@google/generative-ai";

// ── Types ──────────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface SpendingSummary {
  totalSpend: number;
  byCategory: Record<string, number>;
  byType: {
    Fixed: number;
    Essential: number;
    Variable: number;
    Luxury: number;
  };
  transactionCount: number;
}

interface OptimizationRecommendation {
  category: string;
  expenseType: string;
  currentSpend: number;
  targetSpend: number;
  reductionPercent: number;
}

interface BudgetPlan {
  savingsGoal: number;
  totalSpend: number;
  fixedExpenses: number;
  essentialExpenses: number;
  variableExpenses: number;
  luxuryExpenses: number;
  allowedVariableSpend: number;
  surplusNeeded: number;
  isFeasible: boolean;
  recommendations: OptimizationRecommendation[];
}

interface ConsultantRequest {
  message: string;
  history: ChatMessage[];
  summary: SpendingSummary;
  budgetPlan: BudgetPlan | null;
}

// ── System Instruction ────────────────────────────────────────────────────────

const SYSTEM_INSTRUCTION = `You are a Pragmatic Financial Strategist with deep expertise in Operational Research (OR) and personal finance optimization.

Your role:
- Provide direct, logic-driven financial advice grounded in optimization principles
- Frame advice using OR concepts: objective functions, constraints, trade-offs, shadow prices
- Be concise and actionable — avoid vague platitudes
- Acknowledge the mathematical structure of the user's budget: Fixed and Essential costs are hard constraints; Variable and Luxury costs are the decision variables to minimize
- When asked about savings goals, reason about feasibility: if Fixed + Essential > (Total Spend - Savings Goal), declare infeasibility
- Use the spending data provided to give personalized, data-backed recommendations
- Explain shadow prices when relevant: "For every ₹1,000 increase in your savings goal, you must reduce flexible spending by ₹X"
- Keep responses to 3–5 sentences unless a detailed breakdown is explicitly requested`;

// ── Helper ────────────────────────────────────────────────────────────────────

function buildContextPreamble(
  summary: SpendingSummary,
  budgetPlan: BudgetPlan | null
): string {
  const categoryLines = Object.entries(summary.byCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, amt]) => `  • ${cat}: ₹${amt.toLocaleString("en-IN")}`)
    .join("\n");

  const planLines = budgetPlan
    ? `
Savings Goal: ₹${budgetPlan.savingsGoal.toLocaleString("en-IN")}
Immutable spend (Fixed + Essential): ₹${(budgetPlan.fixedExpenses + budgetPlan.essentialExpenses).toLocaleString("en-IN")}
Flexible spend (Variable + Luxury): ₹${(budgetPlan.variableExpenses + budgetPlan.luxuryExpenses).toLocaleString("en-IN")}
Allowed flexible spend after goal: ₹${budgetPlan.allowedVariableSpend.toLocaleString("en-IN")}
Cuts required: ₹${budgetPlan.surplusNeeded.toLocaleString("en-IN")}
Goal feasible: ${budgetPlan.isFeasible ? "Yes" : "No"}
Recommendations:
${budgetPlan.recommendations.map((r) => `  • Reduce ${r.category} (${r.expenseType}) by ${r.reductionPercent}% — ₹${r.currentSpend.toLocaleString("en-IN")} → ₹${r.targetSpend.toLocaleString("en-IN")}`).join("\n") || "  None (goal already met)"}`
    : "No savings goal set yet.";

  return `[SPENDING CONTEXT — use this data to answer the user's question]
Total monthly spend: ₹${summary.totalSpend.toLocaleString("en-IN")} across ${summary.transactionCount} transactions
By expense type: Fixed ₹${summary.byType.Fixed.toLocaleString("en-IN")}, Essential ₹${summary.byType.Essential.toLocaleString("en-IN")}, Variable ₹${summary.byType.Variable.toLocaleString("en-IN")}, Luxury ₹${summary.byType.Luxury.toLocaleString("en-IN")}
By category:
${categoryLines}
${planLines}
[END CONTEXT]`;
}

// ── API Route ─────────────────────────────────────────────────────────────────

export const POST: APIRoute = async ({ request }) => {
  const apiKey = import.meta.env.GEMINI_API_KEY;

  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "Gemini API key is not configured." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  let body: ConsultantRequest;

  try {
    body = (await request.json()) as ConsultantRequest;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { message, history, summary, budgetPlan } = body;

  if (!message || typeof message !== "string") {
    return new Response(JSON.stringify({ error: "message is required." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const contextPreamble = buildContextPreamble(summary, budgetPlan);

  // Prepend the spending context to the first user turn so the model always
  // has up-to-date data regardless of history length.
  const historyForChat = history.map((msg, idx) => ({
    role: msg.role === "user" ? ("user" as const) : ("model" as const),
    parts: [
      {
        text:
          idx === 0 && msg.role === "user"
            ? `${contextPreamble}\n\n${msg.content}`
            : msg.content,
      },
    ],
  }));

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      systemInstruction: SYSTEM_INSTRUCTION,
    });

    const chat = model.startChat({
      history: historyForChat,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 800,
      },
    });

    // Include context in the user's current message if this is the first turn
    const messageToSend =
      history.length === 0
        ? `${contextPreamble}\n\n${message}`
        : message;

    const result = await chat.sendMessage(messageToSend);
    const reply = result.response.text().trim();

    return new Response(JSON.stringify({ reply }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error from Gemini.";
    return new Response(
      JSON.stringify({ error: `Failed to generate response: ${message}` }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
