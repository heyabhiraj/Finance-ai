import type { APIRoute } from "astro";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { BUDGETS } from "../../config/budgets";

export interface TransactionSummary {
  totalSpent: number;
  byCategory: Record<string, number>;
  topCategory: string;
  transactionCount: number;
}

export const POST: APIRoute = async ({ request }) => {
  const apiKey = import.meta.env.GEMINI_API_KEY;

  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "Internal server error." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  let summary: TransactionSummary;

  try {
    const body = await request.json();
    summary = body as TransactionSummary;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const categoryBreakdown = Object.entries(summary.byCategory)
    .map(([cat, spent]) => {
      const budget = BUDGETS[cat];
      const budgetLine = budget
        ? `, budget: ₹${budget}, ${spent > budget ? "over budget by ₹" + (spent - budget) : "remaining: ₹" + (budget - spent)}`
        : "";
      return `  - ${cat}: ₹${spent}${budgetLine}`;
    })
    .join("\n");

  const prompt = `
You are a personal finance advisor. Analyze the following monthly spending summary and provide exactly 3 concise, actionable financial insights. Format your response as a JSON array of 3 strings, each being a single insight (1-2 sentences max).

Spending Summary:
- Total spent: ₹${summary.totalSpent}
- Number of transactions: ${summary.transactionCount}
- Top spending category: ${summary.topCategory}
- Breakdown by category:
${categoryBreakdown}

Budget constraints:
${Object.entries(BUDGETS).map(([cat, amt]) => `- ${cat}: ₹${amt.toLocaleString()}`).join("\n")}

Return only a valid JSON array of 3 insight strings, nothing else. Example format:
["Insight 1 here.", "Insight 2 here.", "Insight 3 here."]
`.trim();

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    // Extract JSON array from response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error("No JSON array found in Gemini response.");
    }

    const insights: string[] = JSON.parse(jsonMatch[0]);

    if (!Array.isArray(insights) || insights.length === 0) {
      throw new Error("Invalid insights format from Gemini.");
    }

    return new Response(JSON.stringify({ insights }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: `Failed to generate insights: ${message}` }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
