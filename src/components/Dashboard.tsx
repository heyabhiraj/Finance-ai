import React, { useCallback, useEffect, useRef, useState } from "react";
import ApexCharts from "apexcharts";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Entry {
  id: string;
  date: string;          // YYYY-MM-DD
  description: string;
  amount: number;        // positive
  type: "credit" | "debit";
  category: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = "pinance_entries";

const CATEGORIES = [
  "Salary", "Freelance", "Investment", "Housing", "Food",
  "Transport", "Healthcare", "Entertainment", "Shopping",
  "Utilities", "Others",
];

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const EMPTY_FORM: Omit<Entry, "id"> = {
  date: new Date().toISOString().split("T")[0],
  description: "",
  amount: 0,
  type: "debit",
  category: "Others",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function fmt(n: number) {
  return "₹" + Math.abs(n).toLocaleString("en-IN");
}

function loadEntries(): Entry[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as Entry[];
  } catch {
    return [];
  }
}

function saveEntries(entries: Entry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

/** RFC-4180-compliant CSV row parser */
function parseCsvRow(line: string): string[] {
  const fields: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { cur += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ",") { fields.push(cur.trim()); cur = ""; }
      else { cur += ch; }
    }
  }
  fields.push(cur.trim());
  return fields;
}

function findCol(map: Record<string, number>, keys: string[]): number {
  for (const key of keys) {
    if (map[key.toLowerCase()] !== undefined) return map[key.toLowerCase()];
  }
  return -1;
}

function inferCategory(description: string): string {
  const d = description.toLowerCase();
  if (/salary|payroll/.test(d)) return "Salary";
  if (/freelance|consulting/.test(d)) return "Freelance";
  if (/dividend|interest|invest/.test(d)) return "Investment";
  if (/rent|mortgage|housing/.test(d)) return "Housing";
  if (/zomato|swiggy|restaurant|food|cafe|grocer|supermar/.test(d)) return "Food";
  if (/uber|ola|metro|bus|train|fuel|petrol|transport|cab|auto|toll/.test(d)) return "Transport";
  if (/hospital|doctor|pharmacy|health|medical/.test(d)) return "Healthcare";
  if (/netflix|spotify|prime|movie|game|entertainment/.test(d)) return "Entertainment";
  if (/amazon|flipkart|myntra|shop|mall|cloth|fashion/.test(d)) return "Shopping";
  if (/electric|water|gas|internet|broadband|utility/.test(d)) return "Utilities";
  return "Others";
}

function parseCsvToEntries(text: string): Entry[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = parseCsvRow(lines[0]);
  const hMap: Record<string, number> = {};
  headers.forEach((h, i) => { hMap[h.toLowerCase()] = i; });

  const dateIdx  = findCol(hMap, ["date","transaction date","txn date","value date"]);
  const descIdx  = findCol(hMap, ["description","narration","details","particulars","memo"]);
  const amtIdx   = findCol(hMap, ["amount","amt","debit","credit"]);
  const typeIdx  = findCol(hMap, ["type","txn type","transaction type"]);
  const catIdx   = findCol(hMap, ["category","tag"]);

  const entries: Entry[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cols = parseCsvRow(lines[i]);
    const rawAmt = amtIdx >= 0 ? cols[amtIdx] ?? "" : "";
    const parsed = parseFloat(rawAmt.replace(/[^0-9.-]/g, ""));
    if (isNaN(parsed) || parsed === 0) continue;

    const rawType = typeIdx >= 0 ? (cols[typeIdx] ?? "").toLowerCase() : "";
    const type: "credit" | "debit" =
      rawType === "credit" || parsed > 0 ? "credit" : "debit";

    const rawCat = catIdx >= 0 ? (cols[catIdx] ?? "").trim() : "";
    const description = descIdx >= 0 ? (cols[descIdx] ?? "Unknown").trim() : "Unknown";
    const category = rawCat || inferCategory(description);

    entries.push({
      id: uid(),
      date: dateIdx >= 0 ? (cols[dateIdx] ?? "").trim() : "",
      description,
      amount: Math.abs(parsed),
      type,
      category,
    });
  }
  return entries;
}

// ── Derived stats helpers ─────────────────────────────────────────────────────

interface Stats {
  totalIncome: number;
  totalExpenses: number;
  netSavings: number;
  savingsRate: number;
  byCategory: { name: string; amount: number }[];
  byMonth: { month: string; income: number; expenses: number; savings: number }[];
  weeklyCount: number[];
}

function computeStats(entries: Entry[]): Stats {
  let totalIncome = 0;
  let totalExpenses = 0;
  const catMap: Record<string, number> = {};
  const monthIncome: number[] = Array(12).fill(0);
  const monthExpenses: number[] = Array(12).fill(0);
  const weeklyCount: number[] = Array(7).fill(0);
  const now = new Date();

  entries.forEach((e) => {
    if (e.type === "credit") totalIncome += e.amount;
    else totalExpenses += e.amount;

    if (e.type === "debit") {
      catMap[e.category] = (catMap[e.category] || 0) + e.amount;
    }

    const d = new Date(e.date);
    if (!isNaN(d.getTime()) && d.getFullYear() === now.getFullYear()) {
      const m = d.getMonth();
      if (e.type === "credit") monthIncome[m] += e.amount;
      else monthExpenses[m] += e.amount;
    }

    // Weekly count for last 7 days
    const diff = Math.floor((now.getTime() - new Date(e.date).getTime()) / MS_PER_DAY);
    if (diff >= 0 && diff < 7) {
      const dayOfWeek = new Date(e.date).getDay(); // 0=Sun
      const idx = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Mon=0..Sun=6
      weeklyCount[idx]++;
    }
  });

  const netSavings = totalIncome - totalExpenses;
  const savingsRate = totalIncome > 0 ? (netSavings / totalIncome) * 100 : 0;

  const byCategory = Object.entries(catMap)
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount);

  const byMonth = MONTHS.map((month, i) => ({
    month,
    income: monthIncome[i],
    expenses: monthExpenses[i],
    savings: monthIncome[i] - monthExpenses[i],
  }));

  return { totalIncome, totalExpenses, netSavings, savingsRate, byCategory, byMonth, weeklyCount };
}

// ── Entry Form Component ───────────────────────────────────────────────────────

interface EntryFormProps {
  initial?: Entry;
  onSave: (entry: Omit<Entry, "id">) => void;
  onCancel: () => void;
}

function EntryForm({ initial, onSave, onCancel }: EntryFormProps) {
  const [form, setForm] = useState<Omit<Entry, "id">>(
    initial ? { date: initial.date, description: initial.description, amount: initial.amount, type: initial.type, category: initial.category }
            : { ...EMPTY_FORM }
  );
  const [error, setError] = useState("");

  const set = (k: keyof typeof form, v: string | number) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.description.trim()) { setError("Description is required."); return; }
    if (!form.amount || form.amount <= 0) { setError("Amount must be positive."); return; }
    if (!form.date) { setError("Date is required."); return; }
    setError("");
    onSave(form);
  };

  return (
    <form onSubmit={handleSubmit} className="ef-form">
      {error && <div className="ef-error">{error}</div>}
      <div className="ef-row">
        <label htmlFor="ef-date" className="ef-label">Date
          <input id="ef-date" className="ef-input" type="date" value={form.date}
            onChange={(e) => set("date", e.target.value)} required />
        </label>
        <label htmlFor="ef-type" className="ef-label">Type
          <select id="ef-type" className="ef-input" value={form.type}
            onChange={(e) => set("type", e.target.value as "credit" | "debit")}>
            <option value="credit">Credit (Income)</option>
            <option value="debit">Debit (Expense)</option>
          </select>
        </label>
        <label htmlFor="ef-category" className="ef-label">Category
          <select id="ef-category" className="ef-input" value={form.category}
            onChange={(e) => set("category", e.target.value)}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      </div>
      <div className="ef-row">
        <label htmlFor="ef-desc" className="ef-label ef-desc">Description
          <input id="ef-desc" className="ef-input" type="text" placeholder="e.g. Salary Credit"
            value={form.description}
            onChange={(e) => set("description", e.target.value)} required />
        </label>
        <label htmlFor="ef-amount" className="ef-label">Amount (₹)
          <input id="ef-amount" className="ef-input" type="number" min="0.01" step="0.01"
            placeholder="0.00"
            value={form.amount || ""}
            onChange={(e) => set("amount", parseFloat(e.target.value) || 0)} required />
        </label>
      </div>
      <div className="ef-actions">
        <button type="submit" className="btn-primary">{initial ? "Update Entry" : "Add Entry"}</button>
        <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
      <style>{`
        .ef-form { display:flex; flex-direction:column; gap:.75rem; }
        .ef-error { background:#2d0707; color:#ef4444; border:1px solid #7f1d1d; border-radius:8px; padding:.5rem .85rem; font-size:.82rem; }
        .ef-row { display:flex; gap:.75rem; flex-wrap:wrap; }
        .ef-label { display:flex; flex-direction:column; gap:.3rem; font-size:.78rem; color:#94a3b8; flex:1; min-width:140px; }
        .ef-desc { flex:2; }
        .ef-input {
          background:#0f172a; border:1px solid #334155; border-radius:8px;
          color:#f1f5f9; padding:.45rem .7rem; font-size:.88rem;
          outline:none; transition:border .15s;
        }
        .ef-input:focus { border-color:#38bdf8; }
        .ef-actions { display:flex; gap:.6rem; padding-top:.25rem; }
        .btn-primary {
          background:#0ea5e9; color:#fff; border:none; border-radius:8px;
          padding:.5rem 1.1rem; font-size:.85rem; font-weight:600; cursor:pointer;
          transition:background .15s;
        }
        .btn-primary:hover { background:#0284c7; }
        .btn-ghost {
          background:transparent; color:#94a3b8; border:1px solid #334155;
          border-radius:8px; padding:.5rem 1.1rem; font-size:.85rem; cursor:pointer;
          transition:color .15s;
        }
        .btn-ghost:hover { color:#f1f5f9; }
      `}</style>
    </form>
  );
}

// ── Main Dashboard Component ──────────────────────────────────────────────────

export default function Dashboard() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [mounted, setMounted] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editEntry, setEditEntry] = useState<Entry | null>(null);
  const [csvError, setCsvError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<"all" | "credit" | "debit">("all");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const csvRef = useRef<HTMLInputElement>(null);
  const chartsRef = useRef<ApexCharts[]>([]);

  // Load from localStorage on mount
  useEffect(() => {
    setEntries(loadEntries());
    setMounted(true);
  }, []);

  // Persist on change
  useEffect(() => {
    if (mounted) saveEntries(entries);
  }, [entries, mounted]);

  // ── CRUD ────────────────────────────────────────────────────────────────────

  const addEntry = (data: Omit<Entry, "id">) => {
    setEntries((prev) => [{ id: uid(), ...data }, ...prev]);
    setShowForm(false);
  };

  const updateEntry = (data: Omit<Entry, "id">) => {
    if (!editEntry) return;
    setEntries((prev) => prev.map((e) => e.id === editEntry.id ? { ...e, ...data } : e));
    setEditEntry(null);
  };

  const deleteEntry = (id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
    setDeleteConfirm(null);
  };

  // ── CSV Import ───────────────────────────────────────────────────────────────

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCsvError("");
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.match(/\.csv$/i)) { setCsvError("Please upload a .csv file."); return; }
    if (file.size > MAX_FILE_SIZE_BYTES) { setCsvError("File size must be under 5 MB."); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = String(ev.target?.result ?? "");
      const imported = parseCsvToEntries(text);
      if (imported.length === 0) {
        setCsvError("No valid rows found. CSV must have Date, Description, Amount columns.");
        return;
      }
      setEntries((prev) => [...imported, ...prev]);
    };
    reader.readAsText(file);
    // reset input so same file can be re-uploaded
    if (csvRef.current) csvRef.current.value = "";
  };

  // ── Charts ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!mounted) return;
    chartsRef.current.forEach((c) => c.destroy());
    chartsRef.current = [];

    const stats = computeStats(entries);

    const areaEl = document.querySelector("#chart-area") as HTMLElement | null;
    const donutEl = document.querySelector("#chart-donut") as HTMLElement | null;
    const barEl = document.querySelector("#chart-bar") as HTMLElement | null;

    if (areaEl) {
      const area = new ApexCharts(areaEl, {
        chart: { type: "area", height: 280, toolbar: { show: false }, background: "transparent",
          animations: { enabled: true, speed: 600 } },
        theme: { mode: "dark" },
        colors: ["#22c55e", "#ef4444", "#38bdf8"],
        series: [
          { name: "Income",   data: stats.byMonth.map((m) => m.income)   },
          { name: "Expenses", data: stats.byMonth.map((m) => m.expenses) },
          { name: "Savings",  data: stats.byMonth.map((m) => m.savings)  },
        ],
        xaxis: { categories: MONTHS, labels: { style: { colors: "#94a3b8" } } },
        yaxis: { labels: { formatter: (v: number) => "₹" + (v / 1000).toFixed(0) + "k", style: { colors: "#94a3b8" } } },
        fill: { type: "gradient", gradient: { shadeIntensity: 1, opacityFrom: 0.45, opacityTo: 0.05 } },
        stroke: { curve: "smooth", width: 2 },
        grid: { borderColor: "#1e293b" },
        legend: { labels: { colors: "#94a3b8" } },
        tooltip: { theme: "dark" },
        noData: { text: "Add entries to see trends", style: { color: "#64748b" } },
      });
      area.render();
      chartsRef.current.push(area);
    }

    if (donutEl) {
      const hasCategories = stats.byCategory.length > 0;
      const donut = new ApexCharts(donutEl, {
        chart: { type: "donut", height: 280, background: "transparent", animations: { enabled: true, speed: 600 } },
        theme: { mode: "dark" },
        colors: ["#38bdf8","#22c55e","#f59e0b","#ef4444","#a78bfa","#fb7185","#34d399","#94a3b8"],
        series: hasCategories ? stats.byCategory.map((c) => c.amount) : [1],
        labels: hasCategories ? stats.byCategory.map((c) => c.name) : ["No data"],
        legend: { position: "bottom", labels: { colors: "#94a3b8" } },
        plotOptions: { pie: { donut: { size: "65%", labels: { show: hasCategories,
          total: { show: hasCategories, label: "Total Spend", color: "#94a3b8",
            formatter: () => "₹" + (stats.totalExpenses / 1000).toFixed(0) + "k" } } } } },
        tooltip: { theme: "dark" },
        noData: { text: "Add debit entries to see spending", style: { color: "#64748b" } },
      });
      donut.render();
      chartsRef.current.push(donut);
    }

    if (barEl) {
      const bar = new ApexCharts(barEl, {
        chart: { type: "bar", height: 200, toolbar: { show: false }, background: "transparent",
          animations: { enabled: true, speed: 500 } },
        theme: { mode: "dark" },
        colors: ["#a78bfa"],
        series: [{ name: "Transactions", data: stats.weeklyCount }],
        xaxis: { categories: ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"], labels: { style: { colors: "#94a3b8" } } },
        yaxis: { labels: { style: { colors: "#94a3b8" } } },
        plotOptions: { bar: { borderRadius: 4, columnWidth: "50%" } },
        grid: { borderColor: "#1e293b" },
        tooltip: { theme: "dark" },
        noData: { text: "No recent transactions", style: { color: "#64748b" } },
      });
      bar.render();
      chartsRef.current.push(bar);
    }

    return () => { chartsRef.current.forEach((c) => c.destroy()); chartsRef.current = []; };
  }, [mounted, entries]);

  // ── Derived state ────────────────────────────────────────────────────────────

  const stats = mounted ? computeStats(entries) : { totalIncome: 0, totalExpenses: 0, netSavings: 0, savingsRate: 0, byCategory: [], byMonth: [], weeklyCount: [] };

  const filteredEntries = entries
    .filter((e) => filterType === "all" || e.type === filterType)
    .filter((e) => !searchTerm || e.description.toLowerCase().includes(searchTerm.toLowerCase()) || e.category.toLowerCase().includes(searchTerm.toLowerCase()));

  const kpis = [
    {
      title: "Total Income", value: fmt(stats.totalIncome),
      positive: true, color: "#22c55e", bg: "#052e16",
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="kpi-icon"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
    },
    {
      title: "Total Expenses", value: fmt(stats.totalExpenses),
      positive: false, color: "#ef4444", bg: "#2d0707",
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="kpi-icon"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>,
    },
    {
      title: "Net Savings", value: fmt(stats.netSavings),
      positive: stats.netSavings >= 0, color: "#38bdf8", bg: "#082f49",
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="kpi-icon"><path d="M12 2a10 10 0 1 0 10 10"/><path d="M12 6v6l4 2"/></svg>,
    },
    {
      title: "Savings Rate", value: stats.savingsRate.toFixed(1) + "%",
      positive: stats.savingsRate >= 20, color: "#a78bfa", bg: "#1e1b4b",
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="kpi-icon"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>,
    },
  ];

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="dashboard">
      {/* Page Title */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Pinance Ai – Dashboard</h1>
          <p className="page-sub">{entries.length} entries · {new Date().toLocaleString("en-IN", { month: "long", year: "numeric" })}</p>
        </div>
        <div className="header-actions">
          <label htmlFor="csv-import" className="btn-import" title="Import CSV">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Import CSV
            <input ref={csvRef} id="csv-import" type="file" accept=".csv" className="hidden" aria-label="Import CSV file" onChange={handleCsvUpload} />
          </label>
          <button className="btn-add" onClick={() => { setShowForm(true); setEditEntry(null); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Entry
          </button>
        </div>
      </div>

      {/* CSV Error */}
      {csvError && (
        <div className="csv-error">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          {csvError}
          <button onClick={() => setCsvError("")} className="err-close">×</button>
        </div>
      )}

      {/* CSV format hint */}
      <div className="csv-hint">
        💡 CSV format: <code>Date, Description, Amount, Type (credit/debit), Category</code>
      </div>

      {/* Add / Edit Form */}
      {(showForm || editEntry) && (
        <div className="form-panel">
          <div className="form-panel-header">
            <span>{editEntry ? "Edit Entry" : "New Entry"}</span>
          </div>
          <EntryForm
            initial={editEntry ?? undefined}
            onSave={editEntry ? updateEntry : addEntry}
            onCancel={() => { setShowForm(false); setEditEntry(null); }}
          />
        </div>
      )}

      {/* KPI Row */}
      <div className="kpi-grid">
        {kpis.map((k) => (
          <div key={k.title} className="kpi-card" style={{ "--kpi-color": k.color, "--kpi-bg": k.bg } as React.CSSProperties}>
            <div className="kpi-icon-wrap">{k.icon}</div>
            <div className="kpi-body">
              <span className="kpi-title">{k.title}</span>
              <span className="kpi-value">{k.value}</span>
              <span className={`kpi-change ${k.positive ? "pos" : "neg"}`}>{k.positive ? "▲" : "▼"} from all entries</span>
            </div>
          </div>
        ))}
      </div>

      {/* Charts Row 1 */}
      <div className="chart-row">
        <div className="chart-card wide">
          <div className="chart-header">
            <span className="chart-title">Income · Expenses · Savings</span>
            <span className="chart-sub">Monthly trend (current year)</span>
          </div>
          <div id="chart-area" />
        </div>
        <div className="chart-card">
          <div className="chart-header">
            <span className="chart-title">Spend by Category</span>
            <span className="chart-sub">All debit entries</span>
          </div>
          <div id="chart-donut" />
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="chart-row-single">
        <div className="chart-card">
          <div className="chart-header">
            <span className="chart-title">Weekly Transactions</span>
            <span className="chart-sub">Last 7 days count</span>
          </div>
          <div id="chart-bar" />
        </div>
      </div>

      {/* Entries Table */}
      <div className="chart-card txn-card">
        <div className="chart-header">
          <span className="chart-title">Statement Entries</span>
          <div className="tbl-controls">
            <input
              className="tbl-search"
              type="text"
              placeholder="Search…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <select className="tbl-filter" value={filterType} onChange={(e) => setFilterType(e.target.value as "all"|"credit"|"debit")}>
              <option value="all">All</option>
              <option value="credit">Income</option>
              <option value="debit">Expenses</option>
            </select>
          </div>
        </div>

        {filteredEntries.length === 0 ? (
          <div className="empty-state">
            {entries.length === 0
              ? "No entries yet. Add your first entry or import a CSV to get started."
              : "No entries match your filters."}
          </div>
        ) : (
          <table className="txn-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Category</th>
                <th className="right">Amount</th>
                <th className="right">Type</th>
                <th className="right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.map((e) => (
                <tr key={e.id}>
                  <td className="muted">{e.date}</td>
                  <td>{e.description}</td>
                  <td><span className="cat-badge">{e.category}</span></td>
                  <td className={`right bold ${e.type === "credit" ? "green" : "red"}`}>
                    {e.type === "credit" ? "+" : "-"}{fmt(e.amount)}
                  </td>
                  <td className="right"><span className={`badge ${e.type}`}>{e.type}</span></td>
                  <td className="right">
                    <button className="act-btn edit" title="Edit" aria-label="Edit entry" onClick={() => { setEditEntry(e); setShowForm(false); }}>✏️</button>
                    {deleteConfirm === e.id ? (
                      <>
                        <button className="act-btn confirm-del" onClick={() => deleteEntry(e.id)}>Confirm</button>
                        <button className="act-btn cancel-del" onClick={() => setDeleteConfirm(null)}>Cancel</button>
                      </>
                    ) : (
                      <button className="act-btn del" title="Delete" aria-label="Delete entry" onClick={() => setDeleteConfirm(e.id)}>🗑️</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <style>{`
        .dashboard {
          min-height: 100vh;
          background: #0f172a;
          color: #f1f5f9;
          padding: 1.5rem 2rem 3rem;
          font-family: "Inter", "Segoe UI", sans-serif;
        }
        .page-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: .75rem;
          flex-wrap: wrap;
          gap: .75rem;
        }
        .page-title { font-size: 1.6rem; font-weight: 700; color: #f1f5f9; margin: 0 0 .2rem; }
        .page-sub { margin:0; font-size:.85rem; color:#64748b; }
        .header-actions { display:flex; gap:.6rem; align-items:center; }
        .btn-add {
          display:flex; align-items:center; gap:.4rem;
          background:#0ea5e9; color:#fff; border:none; border-radius:8px;
          padding:.45rem .9rem; font-size:.85rem; font-weight:600; cursor:pointer;
          transition:background .15s;
        }
        .btn-add:hover { background:#0284c7; }
        .btn-import {
          display:flex; align-items:center; gap:.4rem;
          background:#1e293b; color:#94a3b8; border:1px solid #334155; border-radius:8px;
          padding:.45rem .9rem; font-size:.85rem; font-weight:600; cursor:pointer;
          transition:all .15s;
        }
        .btn-import:hover { color:#f1f5f9; border-color:#94a3b8; }
        .hidden { display:none; }
        .csv-error {
          display:flex; align-items:center; gap:.5rem;
          background:#2d0707; color:#ef4444; border:1px solid #7f1d1d;
          border-radius:8px; padding:.5rem .85rem; font-size:.82rem;
          margin-bottom:.6rem;
        }
        .err-close { margin-left:auto; background:none; border:none; color:#ef4444; cursor:pointer; font-size:1rem; }
        .csv-hint {
          font-size:.75rem; color:#475569; margin-bottom:1rem;
        }
        .csv-hint code { background:#1e293b; padding:.1rem .4rem; border-radius:4px; color:#94a3b8; }
        .form-panel {
          background:#1e293b; border:1px solid #334155; border-radius:12px;
          padding:1.25rem; margin-bottom:1.25rem;
        }
        .form-panel-header {
          font-size:.9rem; font-weight:600; color:#e2e8f0; margin-bottom:.85rem;
        }

        /* KPI */
        .kpi-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px,1fr));
          gap: 1rem;
          margin-bottom: 1.5rem;
        }
        .kpi-card {
          background: #1e293b; border-radius: 12px; padding: 1.1rem 1.25rem;
          display: flex; gap: 1rem; align-items: center;
          border-left: 3px solid var(--kpi-color);
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          transition: transform .15s;
        }
        .kpi-card:hover { transform: translateY(-2px); }
        .kpi-icon-wrap {
          width: 42px; height: 42px; border-radius: 10px;
          background: var(--kpi-bg);
          display: flex; align-items:center; justify-content:center; flex-shrink:0;
        }
        .kpi-icon { width:20px; height:20px; color: var(--kpi-color); }
        .kpi-body { display:flex; flex-direction:column; gap:.1rem; }
        .kpi-title { font-size:.72rem; text-transform:uppercase; letter-spacing:.08em; color:#64748b; }
        .kpi-value { font-size:1.45rem; font-weight:700; color:#f1f5f9; line-height:1.2; }
        .kpi-change { font-size:.72rem; color:#64748b; }
        .kpi-change.pos { color:#22c55e; }
        .kpi-change.neg { color:#ef4444; }

        /* Charts */
        .chart-row {
          display: grid;
          grid-template-columns: 2fr 1fr;
          gap: 1rem;
          margin-bottom: 1rem;
        }
        .chart-row-single { margin-bottom:1rem; }
        @media (max-width: 860px) {
          .chart-row { grid-template-columns: 1fr; }
        }
        .chart-card {
          background: #1e293b; border-radius: 12px; padding: 1.25rem;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        }
        .chart-header {
          display:flex; align-items:baseline; justify-content:space-between;
          margin-bottom:.75rem; flex-wrap:wrap; gap:.5rem;
        }
        .chart-title { font-size:.95rem; font-weight:600; color:#e2e8f0; }
        .chart-sub { font-size:.75rem; color:#64748b; }

        /* Table controls */
        .tbl-controls { display:flex; gap:.5rem; align-items:center; }
        .tbl-search {
          background:#0f172a; border:1px solid #334155; border-radius:8px;
          color:#f1f5f9; padding:.35rem .7rem; font-size:.82rem; outline:none;
        }
        .tbl-search:focus { border-color:#38bdf8; }
        .tbl-filter {
          background:#0f172a; border:1px solid #334155; border-radius:8px;
          color:#f1f5f9; padding:.35rem .7rem; font-size:.82rem; outline:none; cursor:pointer;
        }

        /* Transactions */
        .txn-card { margin-top:1rem; }
        .txn-table { width:100%; border-collapse:collapse; font-size:.82rem; }
        .txn-table th { text-align:left; color:#64748b; font-weight:500; padding:.5rem .75rem; border-bottom:1px solid #334155; }
        .txn-table td { padding:.6rem .75rem; border-bottom:1px solid #1e293b; color:#cbd5e1; }
        .txn-table tr:last-child td { border-bottom:none; }
        .txn-table tr:hover td { background:#263348; }
        .muted { color:#64748b; }
        .right { text-align:right; }
        .bold { font-weight:600; }
        .green { color:#22c55e; }
        .red   { color:#ef4444; }
        .badge {
          display:inline-block; padding:.15rem .55rem; border-radius:999px;
          font-size:.7rem; font-weight:600; text-transform:uppercase; letter-spacing:.04em;
        }
        .badge.credit { background:#052e16; color:#22c55e; }
        .badge.debit  { background:#2d0707; color:#ef4444; }
        .cat-badge {
          display:inline-block; background:#0f172a; color:#94a3b8; border:1px solid #334155;
          border-radius:6px; padding:.1rem .5rem; font-size:.72rem;
        }
        .act-btn {
          background:none; border:none; cursor:pointer; padding:.2rem .35rem;
          font-size:.85rem; border-radius:6px; transition:background .15s;
        }
        .act-btn:hover { background:#334155; }
        .confirm-del { color:#ef4444; font-size:.72rem; font-weight:600; border:1px solid #7f1d1d; border-radius:6px; padding:.15rem .45rem; }
        .cancel-del  { color:#94a3b8; font-size:.72rem; border:1px solid #334155; border-radius:6px; padding:.15rem .45rem; margin-left:.25rem; }
        .empty-state {
          text-align:center; color:#64748b; padding:2rem 1rem; font-size:.88rem;
        }
      `}</style>
    </div>
  );
}

