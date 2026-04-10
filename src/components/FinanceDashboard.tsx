import React, { useState, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  Upload,
  TrendingUp,
  Wallet,
  ShoppingBag,
  Lightbulb,
  AlertCircle,
  Loader2,
} from "lucide-react";
import readXlsxFile, { type Row } from "read-excel-file/browser";
import { BUDGETS } from "../config/budgets";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface Transaction {
  date: string;
  description: string;
  amount: number;
  category: string;
}

interface BudgetEntry {
  category: string;
  budget: number;
  actual: number;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  Food: "#4ade80",
  Transport: "#60a5fa",
  Shopping: "#f472b6",
  Other: "#a78bfa",
};

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

// ── Helper Functions ───────────────────────────────────────────────────────────

/** Format a Date (or date-like value) to YYYY-MM-DD. */
function formatDate(value: Row[number]): string {
  if (value instanceof Date) {
    return value.toISOString().split("T")[0];
  }
  return String(value ?? "").trim();
}

/** Map header names (case-insensitive) to their column index. */
function buildHeaderMap(headers: Row): Record<string, number> {
  const map: Record<string, number> = {};
  headers.forEach((cell, i) => {
    if (cell !== null) {
      map[String(cell).trim().toLowerCase()] = i;
    }
  });
  return map;
}

/** Return the first matching column index, or -1. */
function findCol(map: Record<string, number>, keys: string[]): number {
  for (const key of keys) {
    if (map[key.toLowerCase()] !== undefined) return map[key.toLowerCase()];
  }
  return -1;
}

/** Parse an xlsx file using read-excel-file (no known CVEs). */
async function parseXlsxFile(file: File): Promise<Transaction[]> {
  const rows: Row[] = await readXlsxFile(file);
  if (rows.length < 2) return [];

  const headerMap = buildHeaderMap(rows[0]);

  const dateIdx = findCol(headerMap, ["date", "transaction date", "txn date", "value date"]);
  const descIdx = findCol(headerMap, ["description", "narration", "details", "particulars", "memo"]);
  const amountIdx = findCol(headerMap, ["amount", "amt", "debit", "credit"]);
  const categoryIdx = findCol(headerMap, ["category", "type", "tag"]);

  const results: Transaction[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];

    const rawAmount = amountIdx >= 0 ? row[amountIdx] : null;
    const parsedAmount =
      typeof rawAmount === "number"
        ? rawAmount
        : parseFloat(String(rawAmount ?? "").replace(/[^0-9.-]/g, ""));

    if (isNaN(parsedAmount) || parsedAmount === 0) continue;

    const date = dateIdx >= 0 ? formatDate(row[dateIdx]) : "";
    const description = descIdx >= 0 ? String(row[descIdx] ?? "Unknown").trim() : "Unknown";
    const rawCategory = categoryIdx >= 0 ? String(row[categoryIdx] ?? "").trim() : "";
    const category = rawCategory || inferCategory(description);

    results.push({ date, description, amount: Math.abs(parsedAmount), category });
  }

  return results;
}

/** Parse a plain-text CSV file without any third-party dependency. */
/** RFC 4180-compliant CSV row parser: handles quoted fields with embedded commas and escaped quotes. */
function parseCsvRow(line: string): string[] {
  const fields: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++; // skip escaped quote
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
  }
  fields.push(cur.trim());
  return fields;
}

/** Parse a plain-text CSV file without any third-party dependency. */
function parseCsvContent(text: string): Transaction[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = parseCsvRow(lines[0]);
  const headerMap: Record<string, number> = {};
  headers.forEach((h, i) => { headerMap[h.toLowerCase()] = i; });

  const dateIdx = findCol(headerMap, ["date", "transaction date", "txn date", "value date"]);
  const descIdx = findCol(headerMap, ["description", "narration", "details", "particulars", "memo"]);
  const amountIdx = findCol(headerMap, ["amount", "amt", "debit", "credit"]);
  const categoryIdx = findCol(headerMap, ["category", "type", "tag"]);

  const results: Transaction[] = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cols = parseCsvRow(lines[i]);

    const rawAmount = amountIdx >= 0 ? cols[amountIdx] : "";
    const parsedAmount = parseFloat(rawAmount.replace(/[^0-9.-]/g, ""));
    if (isNaN(parsedAmount) || parsedAmount === 0) continue;

    const date = dateIdx >= 0 ? (cols[dateIdx] ?? "") : "";
    const description = descIdx >= 0 ? (cols[descIdx] ?? "Unknown").trim() : "Unknown";
    const rawCategory = categoryIdx >= 0 ? (cols[categoryIdx] ?? "").trim() : "";
    const category = rawCategory || inferCategory(description);

    results.push({ date, description, amount: Math.abs(parsedAmount), category });
  }

  return results;
}

function inferCategory(description: string): string {
  const desc = description.toLowerCase();
  if (/zomato|swiggy|restaurant|food|cafe|lunch|dinner|breakfast|grocer|supermar/.test(desc))
    return "Food";
  if (/uber|ola|metro|bus|train|fuel|petrol|transport|cab|auto|toll/.test(desc))
    return "Transport";
  if (/amazon|flipkart|myntra|shop|mall|store|purchase|cloth|fashion/.test(desc))
    return "Shopping";
  return "Other";
}

function buildChartData(transactions: Transaction[]): BudgetEntry[] {
  const actual: Record<string, number> = {};
  transactions.forEach((t) => {
    actual[t.category] = (actual[t.category] || 0) + t.amount;
  });

  const categories = new Set([
    ...Object.keys(BUDGETS),
    ...Object.keys(actual),
  ]);

  return Array.from(categories).map((category) => ({
    category,
    budget: BUDGETS[category] || 0,
    actual: Math.round(actual[category] || 0),
  }));
}

// ── Sub-components ─────────────────────────────────────────────────────────────

interface SummaryCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}

function SummaryCard({ icon, label, value, sub, accent = "bg-indigo-50" }: SummaryCardProps) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex items-start gap-4">
      <div className={`${accent} p-3 rounded-xl`}>{icon}</div>
      <div>
        <p className="text-sm text-gray-500 font-medium">{label}</p>
        <p className="text-2xl font-bold text-gray-800 mt-0.5">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function FinanceDashboard() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [insights, setInsights] = useState<string[]>([]);
  const [insightError, setInsightError] = useState<string>("");
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [parseError, setParseError] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);

  // Derived data
  const totalSpent = transactions.reduce((s, t) => s + t.amount, 0);
  const byCategory: Record<string, number> = {};
  transactions.forEach((t) => {
    byCategory[t.category] = (byCategory[t.category] || 0) + t.amount;
  });
  const topCategory =
    Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
  const totalBudget = Object.values(BUDGETS).reduce((s, v) => s + v, 0);
  const remainingBudget = totalBudget - totalSpent;
  const chartData = buildChartData(transactions);

  // ── File Handling ────────────────────────────────────────────────────────────

  const processFile = useCallback((file: File) => {
    setParseError("");
    setInsights([]);
    setInsightError("");

    if (!file.name.match(/\.(xlsx|csv)$/i)) {
      setParseError("Please upload a valid .xlsx or .csv file.");
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setParseError("File size must be under 5 MB.");
      return;
    }

    if (file.name.match(/\.csv$/i)) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const parsed = parseCsvContent(String(e.target?.result ?? ""));
          if (parsed.length === 0) {
            setParseError(
              "No valid transactions found. Ensure your file has Date, Description, Amount, and Category columns."
            );
            return;
          }
          setTransactions(parsed);
        } catch {
          setParseError("Failed to parse CSV file.");
        }
      };
      reader.readAsText(file);
    } else {
      parseXlsxFile(file)
        .then((parsed) => {
          if (parsed.length === 0) {
            setParseError(
              "No valid transactions found. Ensure your file has Date, Description, Amount, and Category columns."
            );
            return;
          }
          setTransactions(parsed);
        })
        .catch(() => {
          setParseError("Failed to parse file. Ensure it is a valid .xlsx spreadsheet.");
        });
    }
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  // ── AI Analysis ──────────────────────────────────────────────────────────────

  const analyzeWithAI = async () => {
    setLoadingInsights(true);
    setInsightError("");
    setInsights([]);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          totalSpent,
          byCategory,
          topCategory,
          transactionCount: transactions.length,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Unknown error");
      setInsights(json.insights as string[]);
    } catch (err) {
      setInsightError(
        err instanceof Error ? err.message : "Failed to get insights."
      );
    } finally {
      setLoadingInsights(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-3">
        <Wallet className="text-indigo-600 w-6 h-6" />
        <h1 className="text-xl font-bold text-gray-800">Pinance Ai – AI Insights</h1>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {/* File Upload */}
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Upload Statement
          </h2>
          <div
            className={`border-2 border-dashed rounded-2xl p-10 text-center transition-colors cursor-pointer ${
              isDragging
                ? "border-indigo-400 bg-indigo-50"
                : "border-gray-300 bg-white hover:border-indigo-300 hover:bg-indigo-50/40"
            }`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => document.getElementById("file-input")?.click()}
          >
            <Upload className="mx-auto w-10 h-10 text-indigo-400 mb-3" />
            <p className="text-gray-600 font-medium">
              Drag &amp; drop your .xlsx or .csv statement here
            </p>
            <p className="text-sm text-gray-400 mt-1">or click to browse (max 5 MB)</p>
            <input
              id="file-input"
              type="file"
              accept=".xlsx,.csv"
              className="hidden"
              onChange={handleFileInput}
            />
          </div>
          {parseError && (
            <div className="mt-3 flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {parseError}
            </div>
          )}
        </section>

        {transactions.length > 0 && (
          <>
            {/* Summary Cards */}
            <section>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Summary
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <SummaryCard
                  icon={<TrendingUp className="text-red-500 w-5 h-5" />}
                  label="Total Spent"
                  value={`₹${totalSpent.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`}
                  sub={`${transactions.length} transactions`}
                  accent="bg-red-50"
                />
                <SummaryCard
                  icon={<Wallet className="text-indigo-500 w-5 h-5" />}
                  label="Remaining Budget"
                  value={`₹${remainingBudget.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`}
                  sub={`of ₹${totalBudget.toLocaleString("en-IN")} total`}
                  accent={remainingBudget < 0 ? "bg-orange-50" : "bg-indigo-50"}
                />
                <SummaryCard
                  icon={<ShoppingBag className="text-purple-500 w-5 h-5" />}
                  label="Top Category"
                  value={topCategory}
                  sub={`₹${(byCategory[topCategory] || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })} spent`}
                  accent="bg-purple-50"
                />
              </div>
            </section>

            {/* Budget vs Actual Chart */}
            <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-base font-semibold text-gray-700 mb-4">
                Budget vs. Actual Spending
              </h2>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="category" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: number) => `₹${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      `₹${value.toLocaleString("en-IN")}`,
                      name === "budget" ? "Budget" : "Actual",
                    ]}
                  />
                  <Legend formatter={(value) => (value === "budget" ? "Budget" : "Actual")} />
                  <Bar dataKey="budget" fill="#c7d2fe" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="actual" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </section>

            {/* Transaction Table */}
            <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="text-base font-semibold text-gray-700">Transactions</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      {["Date", "Description", "Category", "Amount"].map((h) => (
                        <th
                          key={h}
                          className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {transactions.map((t, i) => (
                      <tr key={i} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-3 text-gray-500 whitespace-nowrap">{t.date}</td>
                        <td className="px-6 py-3 text-gray-700 max-w-xs truncate">{t.description}</td>
                        <td className="px-6 py-3">
                          <span
                            className="px-2 py-1 rounded-full text-xs font-medium"
                            style={{
                              background: `${CATEGORY_COLORS[t.category] || "#e5e7eb"}20`,
                              color: CATEGORY_COLORS[t.category] || "#6b7280",
                            }}
                          >
                            {t.category}
                          </span>
                        </td>
                        <td className="px-6 py-3 font-medium text-gray-800">
                          ₹{t.amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* AI Insights */}
            <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Lightbulb className="text-yellow-500 w-5 h-5" />
                  <h2 className="text-base font-semibold text-gray-700">AI Financial Insights</h2>
                </div>
                <button
                  onClick={analyzeWithAI}
                  disabled={loadingInsights}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
                >
                  {loadingInsights ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Analyzing…
                    </>
                  ) : (
                    <>
                      <Lightbulb className="w-4 h-4" />
                      Analyze with AI
                    </>
                  )}
                </button>
              </div>

              {insightError && (
                <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm mb-4">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {insightError}
                </div>
              )}

              {insights.length > 0 ? (
                <ol className="space-y-3">
                  {insights.map((insight, i) => (
                    <li
                      key={i}
                      className="flex gap-3 bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3"
                    >
                      <span className="shrink-0 w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">
                        {i + 1}
                      </span>
                      <p className="text-sm text-gray-700">{insight}</p>
                    </li>
                  ))}
                </ol>
              ) : (
                !insightError && (
                  <p className="text-sm text-gray-400">
                    Click "Analyze with AI" to get personalized insights based on your spending.
                  </p>
                )
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
