import React, { useEffect, useState } from "react";
import ApexCharts from "apexcharts";

// ── Demo Data ─────────────────────────────────────────────────────────────────

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const revenueData   = [42000, 47500, 44800, 52300, 55100, 60400, 58200, 63800, 67000, 71200, 74500, 80000];
const expensesData  = [31000, 33200, 32100, 36500, 37800, 41000, 39400, 42600, 44100, 47300, 49200, 53100];
const savingsData   = revenueData.map((r, i) => r - expensesData[i]);

const categorySpend = [
  { name: "Housing",      amount: 18500 },
  { name: "Food",         amount: 9200  },
  { name: "Transport",    amount: 5600  },
  { name: "Healthcare",   amount: 3800  },
  { name: "Entertainment",amount: 4100  },
  { name: "Shopping",     amount: 6300  },
  { name: "Utilities",    amount: 2900  },
  { name: "Others",       amount: 2600  },
];

const weeklyTxn = [12, 19, 15, 22, 18, 25, 21];
const weekDays  = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const goalProgress = [
  { label: "Emergency Fund", current: 68000, target: 100000 },
  { label: "Vacation",       current: 24000, target: 40000  },
  { label: "New Laptop",     current: 55000, target: 60000  },
];

const recentTxns = [
  { date: "Apr 08", desc: "Salary Credit",      amount: 80000, type: "credit" },
  { date: "Apr 07", desc: "Rent Payment",        amount: -15000,type: "debit"  },
  { date: "Apr 06", desc: "Grocery Store",       amount: -2340, type: "debit"  },
  { date: "Apr 05", desc: "Freelance Income",    amount: 12000, type: "credit" },
  { date: "Apr 04", desc: "Netflix Subscription",amount: -649,  type: "debit"  },
  { date: "Apr 03", desc: "Petrol",              amount: -1800, type: "debit"  },
  { date: "Apr 02", desc: "Dividend Received",   amount: 3200,  type: "credit" },
];

// ── KPI Config ────────────────────────────────────────────────────────────────

const kpis = [
  {
    title: "Total Revenue",
    value: "₹80,000",
    change: "+7.4%",
    positive: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="kpi-icon">
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
        <polyline points="17 6 23 6 23 12" />
      </svg>
    ),
    color: "#22c55e",
    bg: "#052e16",
  },
  {
    title: "Total Expenses",
    value: "₹53,100",
    change: "+8.0%",
    positive: false,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="kpi-icon">
        <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
        <polyline points="17 18 23 18 23 12" />
      </svg>
    ),
    color: "#ef4444",
    bg: "#2d0707",
  },
  {
    title: "Net Savings",
    value: "₹26,900",
    change: "+5.9%",
    positive: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="kpi-icon">
        <path d="M12 2a10 10 0 1 0 10 10" />
        <path d="M12 6v6l4 2" />
      </svg>
    ),
    color: "#38bdf8",
    bg: "#082f49",
  },
  {
    title: "Savings Rate",
    value: "33.6%",
    change: "+0.8 pp",
    positive: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="kpi-icon">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4l3 3" />
      </svg>
    ),
    color: "#a78bfa",
    bg: "#1e1b4b",
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return "₹" + Math.abs(n).toLocaleString("en-IN");
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const charts: ApexCharts[] = [];

    // 1. Area chart — Revenue vs Expenses vs Savings
    const areaChart = new ApexCharts(document.querySelector("#chart-area"), {
      chart: { type: "area", height: 280, toolbar: { show: false }, background: "transparent",
        animations: { enabled: true, easing: "easeinout", speed: 600 } },
      theme: { mode: "dark" },
      colors: ["#22c55e", "#ef4444", "#38bdf8"],
      series: [
        { name: "Revenue",  data: revenueData  },
        { name: "Expenses", data: expensesData },
        { name: "Savings",  data: savingsData  },
      ],
      xaxis: { categories: MONTHS, labels: { style: { colors: "#94a3b8" } } },
      yaxis: { labels: { formatter: (v: number) => "₹" + (v / 1000).toFixed(0) + "k", style: { colors: "#94a3b8" } } },
      fill: { type: "gradient", gradient: { shadeIntensity: 1, opacityFrom: 0.45, opacityTo: 0.05 } },
      stroke: { curve: "smooth", width: 2 },
      grid: { borderColor: "#1e293b" },
      legend: { labels: { colors: "#94a3b8" } },
      tooltip: { theme: "dark" },
    });
    areaChart.render();
    charts.push(areaChart);

    // 2. Donut chart — Spending by Category
    const donutChart = new ApexCharts(document.querySelector("#chart-donut"), {
      chart: { type: "donut", height: 280, background: "transparent",
        animations: { enabled: true, speed: 600 } },
      theme: { mode: "dark" },
      colors: ["#38bdf8","#22c55e","#f59e0b","#ef4444","#a78bfa","#fb7185","#34d399","#94a3b8"],
      series: categorySpend.map(c => c.amount),
      labels: categorySpend.map(c => c.name),
      legend: { position: "bottom", labels: { colors: "#94a3b8" } },
      plotOptions: { pie: { donut: { size: "65%", labels: { show: true,
        total: { show: true, label: "Total Spend", color: "#94a3b8",
          formatter: () => "₹" + (categorySpend.reduce((a, b) => a + b.amount, 0) / 1000).toFixed(0) + "k" } } } } },
      tooltip: { theme: "dark" },
    });
    donutChart.render();
    charts.push(donutChart);

    // 3. Bar chart — Weekly Transactions
    const barChart = new ApexCharts(document.querySelector("#chart-bar"), {
      chart: { type: "bar", height: 220, toolbar: { show: false }, background: "transparent",
        animations: { enabled: true, speed: 500 } },
      theme: { mode: "dark" },
      colors: ["#a78bfa"],
      series: [{ name: "Transactions", data: weeklyTxn }],
      xaxis: { categories: weekDays, labels: { style: { colors: "#94a3b8" } } },
      yaxis: { labels: { style: { colors: "#94a3b8" } } },
      plotOptions: { bar: { borderRadius: 4, columnWidth: "50%" } },
      grid: { borderColor: "#1e293b" },
      tooltip: { theme: "dark" },
    });
    barChart.render();
    charts.push(barChart);

    // 4. Radial bar chart — Goal Progress
    const radialChart = new ApexCharts(document.querySelector("#chart-radial"), {
      chart: { type: "radialBar", height: 280, background: "transparent" },
      theme: { mode: "dark" },
      colors: ["#22c55e", "#38bdf8", "#a78bfa"],
      series: goalProgress.map(g => Math.round((g.current / g.target) * 100)),
      labels: goalProgress.map(g => g.label),
      plotOptions: {
        radialBar: {
          hollow: { size: "30%" },
          dataLabels: {
            name: { color: "#94a3b8" },
            value: { color: "#f1f5f9", formatter: (v: number) => v + "%" },
          },
        },
      },
      legend: { show: true, position: "bottom", labels: { colors: "#94a3b8" } },
      tooltip: { theme: "dark" },
    });
    radialChart.render();
    charts.push(radialChart);

    return () => charts.forEach(c => c.destroy());
  }, [mounted]);

  return (
    <div className="dashboard">
      {/* Page Title */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Financial Dashboard</h1>
          <p className="page-sub">April 2026 · Demo Data</p>
        </div>
        <div className="badge-live">● LIVE</div>
      </div>

      {/* KPI Row */}
      <div className="kpi-grid">
        {kpis.map((k) => (
          <div key={k.title} className="kpi-card" style={{ "--kpi-color": k.color, "--kpi-bg": k.bg } as React.CSSProperties}>
            <div className="kpi-icon-wrap">{k.icon}</div>
            <div className="kpi-body">
              <span className="kpi-title">{k.title}</span>
              <span className="kpi-value">{k.value}</span>
              <span className={`kpi-change ${k.positive ? "pos" : "neg"}`}>{k.positive ? "▲" : "▼"} {k.change} vs last month</span>
            </div>
          </div>
        ))}
      </div>

      {/* Charts Row 1 */}
      <div className="chart-row">
        <div className="chart-card wide">
          <div className="chart-header">
            <span className="chart-title">Revenue · Expenses · Savings</span>
            <span className="chart-sub">12-month trend</span>
          </div>
          <div id="chart-area" />
        </div>

        <div className="chart-card">
          <div className="chart-header">
            <span className="chart-title">Spend by Category</span>
            <span className="chart-sub">Current month</span>
          </div>
          <div id="chart-donut" />
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="chart-row">
        <div className="chart-card">
          <div className="chart-header">
            <span className="chart-title">Weekly Transactions</span>
            <span className="chart-sub">Count this week</span>
          </div>
          <div id="chart-bar" />
        </div>

        <div className="chart-card">
          <div className="chart-header">
            <span className="chart-title">Savings Goals</span>
            <span className="chart-sub">Progress to target</span>
          </div>
          <div id="chart-radial" />
          <div className="goal-legend">
            {goalProgress.map((g) => (
              <div key={g.label} className="goal-item">
                <span className="goal-label">{g.label}</span>
                <span className="goal-amounts">{fmt(g.current)} / {fmt(g.target)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="chart-card txn-card">
        <div className="chart-header">
          <span className="chart-title">Recent Transactions</span>
          <span className="chart-sub">Last 7 entries</span>
        </div>
        <table className="txn-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th className="right">Amount</th>
              <th className="right">Type</th>
            </tr>
          </thead>
          <tbody>
            {recentTxns.map((t, i) => (
              <tr key={i}>
                <td className="muted">{t.date}</td>
                <td>{t.desc}</td>
                <td className={`right bold ${t.type === "credit" ? "green" : "red"}`}>
                  {t.type === "credit" ? "+" : "-"}{fmt(t.amount)}
                </td>
                <td className="right">
                  <span className={`badge ${t.type}`}>{t.type}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
          margin-bottom: 1.5rem;
        }
        .page-title {
          font-size: 1.6rem;
          font-weight: 700;
          color: #f1f5f9;
          margin: 0 0 .2rem;
        }
        .page-sub { margin:0; font-size:.85rem; color:#64748b; }
        .badge-live {
          font-size:.75rem; font-weight:600; color:#22c55e;
          background:#052e16; border:1px solid #166534;
          border-radius:999px; padding:.2rem .75rem;
          letter-spacing:.05em;
        }

        /* KPI */
        .kpi-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px,1fr));
          gap: 1rem;
          margin-bottom: 1.5rem;
        }
        .kpi-card {
          background: #1e293b;
          border-radius: 12px;
          padding: 1.1rem 1.25rem;
          display: flex;
          gap: 1rem;
          align-items: center;
          border-left: 3px solid var(--kpi-color);
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          transition: transform .15s;
        }
        .kpi-card:hover { transform: translateY(-2px); }
        .kpi-icon-wrap {
          width: 42px; height: 42px; border-radius: 10px;
          background: var(--kpi-bg);
          display: flex; align-items:center; justify-content:center;
          flex-shrink:0;
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
        @media (max-width: 860px) {
          .chart-row { grid-template-columns: 1fr; }
        }
        .chart-card {
          background: #1e293b;
          border-radius: 12px;
          padding: 1.25rem;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        }
        .chart-card.wide { /* already wider from grid */ }
        .chart-header {
          display:flex; align-items:baseline; justify-content:space-between;
          margin-bottom:.75rem;
        }
        .chart-title { font-size:.95rem; font-weight:600; color:#e2e8f0; }
        .chart-sub { font-size:.75rem; color:#64748b; }

        /* Goal legend */
        .goal-legend { margin-top:.5rem; display:flex; flex-direction:column; gap:.35rem; }
        .goal-item { display:flex; justify-content:space-between; font-size:.78rem; }
        .goal-label { color:#94a3b8; }
        .goal-amounts { color:#e2e8f0; font-weight:500; }

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
      `}</style>
    </div>
  );
}
