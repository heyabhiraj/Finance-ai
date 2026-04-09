import React, {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
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
  Target,
  Lightbulb,
  AlertCircle,
  Loader2,
  MessageSquare,
  Send,
  PiggyBank,
  Filter,
  ArrowDownRight,
  TrendingDown,
  ShieldCheck,
} from "lucide-react";
import readXlsxFile, { type Row } from "read-excel-file/browser";

// ── Types ──────────────────────────────────────────────────────────────────────

export type ExpenseType = "Fixed" | "Variable" | "Essential" | "Luxury";

export interface Transaction {
  date: string;
  description: string;
  amount: number;
  category: string;
  expenseType: ExpenseType;
}

export interface OptimizationRecommendation {
  category: string;
  expenseType: ExpenseType;
  currentSpend: number;
  targetSpend: number;
  reductionPercent: number;
}

export interface BudgetPlan {
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

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const EXPENSE_TYPE_MAP: Record<string, ExpenseType> = {
  Rent: "Fixed",
  Mortgage: "Fixed",
  Insurance: "Fixed",
  EMI: "Fixed",
  Loan: "Fixed",
  Subscription: "Fixed",
  Internet: "Fixed",
  Phone: "Fixed",
  Utilities: "Fixed",
  Groceries: "Essential",
  Food: "Essential",
  Medical: "Essential",
  Health: "Essential",
  Education: "Essential",
  Childcare: "Essential",
  Transport: "Variable",
  Fuel: "Variable",
  Travel: "Variable",
  Commute: "Variable",
  Maintenance: "Variable",
  "Dining Out": "Luxury",
  Entertainment: "Luxury",
  Shopping: "Luxury",
  Clothing: "Luxury",
  "Personal Care": "Luxury",
  Gifts: "Luxury",
  Vacation: "Luxury",
  Other: "Variable",
};

const TYPE_COLORS: Record<ExpenseType, string> = {
  Fixed: "#ef4444",
  Essential: "#22c55e",
  Variable: "#3b82f6",
  Luxury: "#f59e0b",
};

const TYPE_BG: Record<ExpenseType, string> = {
  Fixed: "bg-red-50 text-red-700 border-red-200",
  Essential: "bg-green-50 text-green-700 border-green-200",
  Variable: "bg-blue-50 text-blue-700 border-blue-200",
  Luxury: "bg-amber-50 text-amber-700 border-amber-200",
};

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

const STORAGE_KEY = "smart-finance-optimizer-v1";

// ── Helper Functions ───────────────────────────────────────────────────────────

function inferCategory(description: string): string {
  const desc = description.toLowerCase();
  if (
    /zomato|swiggy|restaurant|cafe|diner|bistro|dining|barbeque|bbq/.test(desc)
  )
    return "Dining Out";
  if (
    /grocery|supermarket|grocer|dmart|bigbasket|blinkit|zepto|nature.*basket/.test(
      desc
    )
  )
    return "Groceries";
  if (
    /netflix|spotify|hotstar|prime video|youtube premium|movie|cinema|game|playstation|xbox/.test(
      desc
    )
  )
    return "Entertainment";
  if (
    /amazon|flipkart|myntra|meesho|ajio|mall|cloth|fashion|apparel|nykaa/.test(
      desc
    )
  )
    return "Shopping";
  if (
    /uber|ola|metro|city bus|train|fuel|petrol|diesel|transport|cab|auto|rapido|toll/.test(
      desc
    )
  )
    return "Transport";
  if (/rent|mortgage|landlord|paying guest|pg\s/.test(desc)) return "Rent";
  if (
    /electricity|water bill|gas bill|broadband|internet|wifi|airtel|jio|bsnl|vodafone|vi\s/.test(
      desc
    )
  )
    return "Utilities";
  if (/emi|equated monthly|loan repay/.test(desc)) return "EMI";
  if (
    /hospital|pharmacy|doctor|medical|medicine|apollo|max hospital|fortis|health/.test(
      desc
    )
  )
    return "Medical";
  if (/insurance|premium|lic|term plan|ulip/.test(desc)) return "Insurance";
  if (/school|college|tuition|course|udemy|coursera|edtech/.test(desc))
    return "Education";
  return "Other";
}

function inferExpenseType(category: string): ExpenseType {
  return EXPENSE_TYPE_MAP[category] ?? "Variable";
}

function formatDate(value: Row[number]): string {
  if (value instanceof Date) return value.toISOString().split("T")[0];
  return String(value ?? "").trim();
}

function buildHeaderMap(headers: Row): Record<string, number> {
  const map: Record<string, number> = {};
  headers.forEach((cell, i) => {
    if (cell !== null) map[String(cell).trim().toLowerCase()] = i;
  });
  return map;
}

function findCol(map: Record<string, number>, keys: string[]): number {
  for (const key of keys) {
    if (map[key.toLowerCase()] !== undefined) return map[key.toLowerCase()];
  }
  return -1;
}

async function parseXlsxFile(file: File): Promise<Transaction[]> {
  const rows: Row[] = await readXlsxFile(file);
  if (rows.length < 2) return [];

  const headerMap = buildHeaderMap(rows[0]);
  const dateIdx = findCol(headerMap, [
    "date",
    "transaction date",
    "txn date",
    "value date",
  ]);
  const descIdx = findCol(headerMap, [
    "description",
    "narration",
    "details",
    "particulars",
    "memo",
  ]);
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
    const description =
      descIdx >= 0
        ? String(row[descIdx] ?? "Unknown").trim()
        : "Unknown";
    const rawCategory =
      categoryIdx >= 0 ? String(row[categoryIdx] ?? "").trim() : "";
    const category = rawCategory || inferCategory(description);
    const expenseType = inferExpenseType(category);

    results.push({
      date,
      description,
      amount: Math.abs(parsedAmount),
      category,
      expenseType,
    });
  }
  return results;
}

function parseCsvRow(line: string): string[] {
  const fields: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
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

function parseCsvContent(text: string): Transaction[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = parseCsvRow(lines[0]);
  const headerMap: Record<string, number> = {};
  headers.forEach((h, i) => {
    headerMap[h.toLowerCase()] = i;
  });

  const dateIdx = findCol(headerMap, [
    "date",
    "transaction date",
    "txn date",
    "value date",
  ]);
  const descIdx = findCol(headerMap, [
    "description",
    "narration",
    "details",
    "particulars",
    "memo",
  ]);
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
    const description =
      descIdx >= 0 ? (cols[descIdx] ?? "Unknown").trim() : "Unknown";
    const rawCategory =
      categoryIdx >= 0 ? (cols[categoryIdx] ?? "").trim() : "";
    const category = rawCategory || inferCategory(description);
    const expenseType = inferExpenseType(category);

    results.push({
      date,
      description,
      amount: Math.abs(parsedAmount),
      category,
      expenseType,
    });
  }
  return results;
}

// ── Optimizer (OR Logic) ───────────────────────────────────────────────────────
// Objective: Minimise sum(Variable + Luxury expenses)
// Subject to: total_spend - savings_goal >= Fixed + Essential + Variable' + Luxury'
// Constraint: Fixed and Essential cannot be reduced

function optimizeBudget(
  transactions: Transaction[],
  savingsGoal: number
): BudgetPlan {
  const totalSpend = transactions.reduce((s, t) => s + t.amount, 0);

  const byType: Record<ExpenseType, number> = {
    Fixed: 0,
    Variable: 0,
    Essential: 0,
    Luxury: 0,
  };
  const byCategory = new Map<string, { amount: number; type: ExpenseType }>();

  transactions.forEach((t) => {
    byType[t.expenseType] += t.amount;
    const existing = byCategory.get(t.category);
    if (existing) {
      existing.amount += t.amount;
    } else {
      byCategory.set(t.category, { amount: t.amount, type: t.expenseType });
    }
  });

  const fixedExpenses = byType.Fixed;
  const essentialExpenses = byType.Essential;
  const variableExpenses = byType.Variable;
  const luxuryExpenses = byType.Luxury;

  const immutableSpend = fixedExpenses + essentialExpenses;
  const flexibleSpend = variableExpenses + luxuryExpenses;
  const isFeasible = immutableSpend <= totalSpend - savingsGoal;

  // Maximum we can spend on variable/luxury after accounting for savings goal
  const allowedFlexible = Math.max(
    0,
    totalSpend - savingsGoal - immutableSpend
  );
  const surplusNeeded = Math.max(0, flexibleSpend - allowedFlexible);

  const recommendations: OptimizationRecommendation[] = [];

  if (surplusNeeded > 0 && isFeasible) {
    let remainingCut = surplusNeeded;

    // Step 1: Cut Luxury categories first (highest-to-lowest spend)
    const luxuryEntries = Array.from(byCategory.entries())
      .filter(([, v]) => v.type === "Luxury")
      .sort((a, b) => b[1].amount - a[1].amount);

    for (const [cat, { amount }] of luxuryEntries) {
      if (remainingCut <= 0) break;
      const cut = Math.min(amount, remainingCut);
      recommendations.push({
        category: cat,
        expenseType: "Luxury",
        currentSpend: Math.round(amount),
        targetSpend: Math.round(amount - cut),
        reductionPercent: Math.round((cut / amount) * 100),
      });
      remainingCut -= cut;
    }

    // Step 2: Only cut Variable spending if Luxury cuts are insufficient
    if (remainingCut > 0) {
      const variableEntries = Array.from(byCategory.entries())
        .filter(([, v]) => v.type === "Variable")
        .sort((a, b) => b[1].amount - a[1].amount);

      for (const [cat, { amount }] of variableEntries) {
        if (remainingCut <= 0) break;
        const cut = Math.min(amount, remainingCut);
        recommendations.push({
          category: cat,
          expenseType: "Variable",
          currentSpend: Math.round(amount),
          targetSpend: Math.round(amount - cut),
          reductionPercent: Math.round((cut / amount) * 100),
        });
        remainingCut -= cut;
      }
    }
  }

  return {
    savingsGoal: Math.round(savingsGoal),
    totalSpend: Math.round(totalSpend),
    fixedExpenses: Math.round(fixedExpenses),
    essentialExpenses: Math.round(essentialExpenses),
    variableExpenses: Math.round(variableExpenses),
    luxuryExpenses: Math.round(luxuryExpenses),
    allowedVariableSpend: Math.round(allowedFlexible),
    surplusNeeded: Math.round(surplusNeeded),
    isFeasible,
    recommendations,
  };
}

// ── Chart Data Builder ─────────────────────────────────────────────────────────

function buildStackedChartData(plan: BudgetPlan) {
  const variableCuts = plan.recommendations
    .filter((r) => r.expenseType === "Variable")
    .reduce((s, r) => s + (r.currentSpend - r.targetSpend), 0);
  const luxuryCuts = plan.recommendations
    .filter((r) => r.expenseType === "Luxury")
    .reduce((s, r) => s + (r.currentSpend - r.targetSpend), 0);

  return [
    {
      name: "Current Spend",
      Fixed: plan.fixedExpenses,
      Essential: plan.essentialExpenses,
      Variable: plan.variableExpenses,
      Luxury: plan.luxuryExpenses,
    },
    {
      name: "Target Spend",
      Fixed: plan.fixedExpenses,
      Essential: plan.essentialExpenses,
      Variable: Math.max(0, plan.variableExpenses - variableCuts),
      Luxury: Math.max(0, plan.luxuryExpenses - luxuryCuts),
    },
  ];
}

// ── Sub-components ─────────────────────────────────────────────────────────────

interface SummaryCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  accentClass?: string;
}

function SummaryCard({
  icon,
  label,
  value,
  sub,
  accentClass = "bg-indigo-50",
}: SummaryCardProps) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex items-start gap-4">
      <div className={`${accentClass} p-3 rounded-xl`}>{icon}</div>
      <div>
        <p className="text-sm text-gray-500 font-medium">{label}</p>
        <p className="text-2xl font-bold text-gray-800 mt-0.5">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
      </div>
    </div>
  );
}

function ChatBubble({
  message,
  isUser,
}: {
  message: ChatMessage;
  isUser: boolean;
}) {
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-3`}>
      <div
        className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? "bg-indigo-600 text-white rounded-br-sm"
            : "bg-gray-100 text-gray-800 rounded-bl-sm"
        }`}
      >
        {message.content}
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function BudgetOptimizer() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [savingsGoal, setSavingsGoal] = useState(0);
  const [parseError, setParseError] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  // Transaction table filter
  const [filterType, setFilterType] = useState<ExpenseType | "All">("All");
  const [filterSearch, setFilterSearch] = useState("");

  // AI Chat
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  // ── Derived data ───────────────────────────────────────────────────────────

  const budgetPlan = useMemo(() => {
    if (transactions.length === 0) return null;
    return optimizeBudget(transactions, savingsGoal);
  }, [transactions, savingsGoal]);

  const chartData = useMemo(
    () => (budgetPlan ? buildStackedChartData(budgetPlan) : []),
    [budgetPlan]
  );

  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      const matchesType = filterType === "All" || t.expenseType === filterType;
      const matchesSearch =
        filterSearch === "" ||
        t.description.toLowerCase().includes(filterSearch.toLowerCase()) ||
        t.category.toLowerCase().includes(filterSearch.toLowerCase());
      return matchesType && matchesSearch;
    });
  }, [transactions, filterType, filterSearch]);

  const sliderMax = useMemo(
    () =>
      budgetPlan
        ? Math.ceil(
            (budgetPlan.totalSpend -
              budgetPlan.fixedExpenses -
              budgetPlan.essentialExpenses) /
              1000
          ) * 1000
        : 50000,
    [budgetPlan]
  );

  // ── Persistence ────────────────────────────────────────────────────────────

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const { savingsGoal: sg } = JSON.parse(saved) as { savingsGoal: number };
        if (typeof sg === "number" && sg >= 0) setSavingsGoal(sg);
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ savingsGoal }));
    } catch {
      // Ignore storage errors
    }
  }, [savingsGoal]);

  // ── Auto-scroll chat ───────────────────────────────────────────────────────

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  // ── File Handling ──────────────────────────────────────────────────────────

  const processFile = useCallback((file: File) => {
    setParseError("");

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
              "No valid transactions found. Ensure the file has Date, Description, Amount, and Category columns."
            );
            return;
          }
          setTransactions(parsed);
          setChatHistory([]);
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
              "No valid transactions found. Ensure the file has Date, Description, Amount, and Category columns."
            );
            return;
          }
          setTransactions(parsed);
          setChatHistory([]);
        })
        .catch(() => {
          setParseError(
            "Failed to parse file. Ensure it is a valid .xlsx spreadsheet."
          );
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

  // ── AI Chat ────────────────────────────────────────────────────────────────

  const sendMessage = async () => {
    const msg = chatInput.trim();
    if (!msg || chatLoading || !budgetPlan) return;

    const userMessage: ChatMessage = { role: "user", content: msg };
    const updatedHistory = [...chatHistory, userMessage];
    setChatHistory(updatedHistory);
    setChatInput("");
    setChatLoading(true);
    setChatError("");

    try {
      const byCategory: Record<string, number> = {};
      transactions.forEach((t) => {
        byCategory[t.category] = (byCategory[t.category] || 0) + t.amount;
      });

      const res = await fetch("/api/consultant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msg,
          history: chatHistory,
          summary: {
            totalSpend: budgetPlan.totalSpend,
            byCategory,
            byType: {
              Fixed: budgetPlan.fixedExpenses,
              Essential: budgetPlan.essentialExpenses,
              Variable: budgetPlan.variableExpenses,
              Luxury: budgetPlan.luxuryExpenses,
            },
            transactionCount: transactions.length,
          },
          budgetPlan,
        }),
      });

      const json = (await res.json()) as { reply?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Unknown error");

      setChatHistory([
        ...updatedHistory,
        { role: "assistant", content: json.reply ?? "" },
      ]);
    } catch (err) {
      setChatError(
        err instanceof Error ? err.message : "Failed to get a response."
      );
    } finally {
      setChatLoading(false);
    }
  };

  const handleChatKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      {/* Page header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-3">
        <PiggyBank className="text-indigo-600 w-6 h-6" />
        <div>
          <h1 className="text-xl font-bold text-gray-800">
            Smart Finance Optimizer
          </h1>
          <p className="text-xs text-gray-400">
            OR-powered savings planner · Gemini AI assistant
          </p>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {/* ── Upload ─────────────────────────────────────────────────────── */}
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
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => document.getElementById("file-input")?.click()}
          >
            <Upload className="mx-auto w-10 h-10 text-indigo-400 mb-3" />
            <p className="text-gray-600 font-medium">
              Drag &amp; drop your .xlsx or .csv statement here
            </p>
            <p className="text-sm text-gray-400 mt-1">
              Columns needed: Date · Description · Amount · Category (max 5 MB)
            </p>
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

        {transactions.length > 0 && budgetPlan && (
          <>
            {/* ── Savings Goal Slider ─────────────────────────────────────── */}
            <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center gap-2 mb-4">
                <Target className="text-indigo-500 w-5 h-5" />
                <h2 className="text-base font-semibold text-gray-700">
                  Monthly Savings Goal
                </h2>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min={0}
                    max={sliderMax}
                    step={500}
                    value={savingsGoal}
                    onChange={(e) => setSavingsGoal(Number(e.target.value))}
                    className="flex-1 accent-indigo-600"
                  />
                  <div className="flex items-center border border-gray-300 rounded-xl overflow-hidden">
                    <span className="px-3 py-2 bg-gray-50 text-gray-500 text-sm font-medium border-r border-gray-300">
                      ₹
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={sliderMax}
                      step={500}
                      value={savingsGoal}
                      onChange={(e) =>
                        setSavingsGoal(
                          Math.max(0, Math.min(sliderMax, Number(e.target.value)))
                        )
                      }
                      className="w-28 px-3 py-2 text-sm font-bold text-gray-800 focus:outline-none"
                    />
                  </div>
                </div>
                <div className="flex justify-between text-xs text-gray-400">
                  <span>₹0</span>
                  <span>
                    Max feasible: ₹
                    {sliderMax.toLocaleString("en-IN")}
                  </span>
                </div>
                {!budgetPlan.isFeasible && savingsGoal > 0 && (
                  <div className="flex items-center gap-2 text-orange-700 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 text-sm">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    This savings goal exceeds your total flexible spend.
                    Reduce the goal to stay feasible.
                  </div>
                )}
                {budgetPlan.surplusNeeded === 0 && savingsGoal > 0 && (
                  <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm">
                    <ShieldCheck className="w-4 h-4 shrink-0" />
                    Great news! Your current spending already meets this savings
                    goal with no cuts required.
                  </div>
                )}
              </div>
            </section>

            {/* ── Summary Cards ───────────────────────────────────────────── */}
            <section>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Spending Breakdown
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <SummaryCard
                  icon={<ShieldCheck className="text-red-500 w-5 h-5" />}
                  label="Fixed"
                  value={`₹${budgetPlan.fixedExpenses.toLocaleString("en-IN")}`}
                  sub="Cannot be reduced"
                  accentClass="bg-red-50"
                />
                <SummaryCard
                  icon={<Lightbulb className="text-green-500 w-5 h-5" />}
                  label="Essential"
                  value={`₹${budgetPlan.essentialExpenses.toLocaleString("en-IN")}`}
                  sub="Cannot be reduced"
                  accentClass="bg-green-50"
                />
                <SummaryCard
                  icon={<TrendingUp className="text-blue-500 w-5 h-5" />}
                  label="Variable"
                  value={`₹${budgetPlan.variableExpenses.toLocaleString("en-IN")}`}
                  sub="Can be optimised"
                  accentClass="bg-blue-50"
                />
                <SummaryCard
                  icon={<Wallet className="text-amber-500 w-5 h-5" />}
                  label="Luxury"
                  value={`₹${budgetPlan.luxuryExpenses.toLocaleString("en-IN")}`}
                  sub="Cut first when saving"
                  accentClass="bg-amber-50"
                />
              </div>
            </section>

            {/* ── Stacked Bar Chart ────────────────────────────────────────── */}
            <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-base font-semibold text-gray-700 mb-1">
                Fixed vs. Variable Spending Composition
              </h2>
              <p className="text-xs text-gray-400 mb-4">
                Current spend vs. optimised target for a ₹
                {savingsGoal.toLocaleString("en-IN")} savings goal
              </p>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={chartData}
                  margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    tickFormatter={(v: number) =>
                      `₹${(v / 1000).toFixed(0)}k`
                    }
                  />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      `₹${value.toLocaleString("en-IN")}`,
                      name,
                    ]}
                  />
                  <Legend />
                  <Bar
                    dataKey="Fixed"
                    stackId="a"
                    fill={TYPE_COLORS.Fixed}
                    radius={[0, 0, 0, 0]}
                  />
                  <Bar
                    dataKey="Essential"
                    stackId="a"
                    fill={TYPE_COLORS.Essential}
                  />
                  <Bar
                    dataKey="Variable"
                    stackId="a"
                    fill={TYPE_COLORS.Variable}
                  />
                  <Bar
                    dataKey="Luxury"
                    stackId="a"
                    fill={TYPE_COLORS.Luxury}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </section>

            {/* ── Optimizer Recommendations ────────────────────────────────── */}
            {savingsGoal > 0 && (
              <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingDown className="text-indigo-500 w-5 h-5" />
                  <h2 className="text-base font-semibold text-gray-700">
                    Optimisation Recommendations
                  </h2>
                </div>

                {budgetPlan.recommendations.length > 0 ? (
                  <>
                    <p className="text-sm text-gray-500 mb-4">
                      To save{" "}
                      <strong>
                        ₹{savingsGoal.toLocaleString("en-IN")}
                      </strong>
                      , reduce the following flexible expenses:
                    </p>
                    <div className="space-y-3">
                      {budgetPlan.recommendations.map((rec) => (
                        <div
                          key={rec.category}
                          className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3 border border-gray-100"
                        >
                          <div className="flex items-center gap-3">
                            <ArrowDownRight className="text-red-400 w-4 h-4 shrink-0" />
                            <div>
                              <p className="text-sm font-semibold text-gray-800">
                                {rec.category}
                              </p>
                              <p className="text-xs text-gray-500">
                                ₹{rec.currentSpend.toLocaleString("en-IN")}{" "}
                                → ₹
                                {rec.targetSpend.toLocaleString("en-IN")}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-xs font-medium px-2 py-1 rounded-full border ${TYPE_BG[rec.expenseType]}`}
                            >
                              {rec.expenseType}
                            </span>
                            <span className="text-sm font-bold text-red-600">
                              −{rec.reductionPercent}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* Shadow-price insight */}
                    {budgetPlan.surplusNeeded === 0 ? null : (
                      <p className="mt-4 text-xs text-gray-400 italic">
                        Shadow price insight: every ₹1,000 increase in your
                        savings goal requires approximately ₹
                        {Math.ceil(
                          (1000 /
                            (budgetPlan.variableExpenses +
                              budgetPlan.luxuryExpenses || 1)) *
                            100
                        )}
                        % more cuts from your flexible spending.
                      </p>
                    )}
                  </>
                ) : budgetPlan.isFeasible ? (
                  <p className="text-sm text-gray-500">
                    Your current spending already meets this savings goal —
                    no cuts needed!
                  </p>
                ) : (
                  <p className="text-sm text-orange-600">
                    This goal is infeasible: your Fixed + Essential expenses
                    alone exceed the allowed spend. Try a lower savings goal.
                  </p>
                )}
              </section>
            )}

            {/* ── Transaction Table ────────────────────────────────────────── */}
            <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
                <h2 className="text-base font-semibold text-gray-700">
                  Transactions{" "}
                  <span className="text-sm font-normal text-gray-400">
                    ({filteredTransactions.length} of {transactions.length})
                  </span>
                </h2>
                <div className="flex gap-2 flex-wrap">
                  <div className="relative">
                    <Filter className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search…"
                      value={filterSearch}
                      onChange={(e) => setFilterSearch(e.target.value)}
                      className="pl-7 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400 w-36"
                    />
                  </div>
                  <select
                    value={filterType}
                    onChange={(e) =>
                      setFilterType(e.target.value as ExpenseType | "All")
                    }
                    className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
                  >
                    <option value="All">All types</option>
                    <option value="Fixed">Fixed</option>
                    <option value="Essential">Essential</option>
                    <option value="Variable">Variable</option>
                    <option value="Luxury">Luxury</option>
                  </select>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      {["Date", "Description", "Category", "Type", "Amount"].map(
                        (h) => (
                          <th
                            key={h}
                            className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider"
                          >
                            {h}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredTransactions.map((t, i) => (
                      <tr key={i} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3 text-gray-500 whitespace-nowrap">
                          {t.date}
                        </td>
                        <td className="px-5 py-3 text-gray-700 max-w-xs truncate">
                          {t.description}
                        </td>
                        <td className="px-5 py-3 text-gray-600">{t.category}</td>
                        <td className="px-5 py-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium border ${TYPE_BG[t.expenseType]}`}
                          >
                            {t.expenseType}
                          </span>
                        </td>
                        <td className="px-5 py-3 font-medium text-gray-800">
                          ₹{t.amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                    {filteredTransactions.length === 0 && (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-5 py-8 text-center text-gray-400 text-sm"
                        >
                          No transactions match the current filter.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* ── AI Financial Strategist Chat ─────────────────────────────── */}
            <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
                <MessageSquare className="text-indigo-500 w-5 h-5" />
                <div>
                  <h2 className="text-base font-semibold text-gray-700">
                    AI Financial Strategist
                  </h2>
                  <p className="text-xs text-gray-400">
                    Ask the Pragmatic Financial Strategist anything about your
                    spending data and optimisation plan.
                  </p>
                </div>
              </div>

              {/* Chat messages */}
              <div className="px-6 py-4 h-72 overflow-y-auto">
                {chatHistory.length === 0 && (
                  <p className="text-sm text-gray-400 text-center mt-8">
                    Upload your statement and ask about your spending, savings
                    strategies, or trade-offs.
                  </p>
                )}
                {chatHistory.map((msg, i) => (
                  <ChatBubble
                    key={i}
                    message={msg}
                    isUser={msg.role === "user"}
                  />
                ))}
                {chatLoading && (
                  <div className="flex justify-start mb-3">
                    <div className="bg-gray-100 text-gray-500 px-4 py-3 rounded-2xl rounded-bl-sm text-sm flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Thinking…
                    </div>
                  </div>
                )}
                {chatError && (
                  <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm mb-3">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {chatError}
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Chat input */}
              <div className="px-6 py-4 border-t border-gray-100 flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={handleChatKeyDown}
                  placeholder="Ask about your finances…"
                  disabled={chatLoading}
                  className="flex-1 px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:bg-gray-50"
                />
                <button
                  onClick={sendMessage}
                  disabled={chatLoading || !chatInput.trim()}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white p-2.5 rounded-xl transition-colors"
                  aria-label="Send message"
                >
                  {chatLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </button>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
