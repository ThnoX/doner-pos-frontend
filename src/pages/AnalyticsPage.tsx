// src/pages/AnalyticsPage.tsx
import { useEffect, useMemo, useRef, useState } from "react";
// Fonksiyonlar
import { fetchDaily, fetchTopByDate, api } from "../api";
// Tipler (yalnızca type import)
import type { DailyRow, TopProduct } from "../api";

/* ---------------- helpers ---------------- */
function toYmdLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function fmt(n: number) {
  return `${(Number(n) || 0).toFixed(2)} ₺`;
}

/* Gider tipi (Expenses API’den) */
type ExpenseItem = {
  id: number;
  date: string;          // ISO/Date
  title: string;
  amount: number;
  category?: string | null;
  payment?: string | null;
  note?: string | null;
};

export default function AnalyticsPage() {
  const today = toYmdLocal(new Date());
  const [from, setFrom] = useState<string>(today);
  const [to, setTo] = useState<string>(today);

  const [dailyRows, setDailyRows] = useState<DailyRow[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Top ürünler
  const [top, setTop] = useState<TopProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingTop, setLoadingTop] = useState(false);

  // Giderler
  const [expenseRows, setExpenseRows] = useState<ExpenseItem[]>([]);
  const [expenseSum, setExpenseSum] = useState<number>(0);
  const [loadingExp, setLoadingExp] = useState(false);

  // Alta kaydırma
  const bottomRef = useRef<HTMLDivElement>(null);
  const selectDayAndScroll = (date: string) => {
    setSelectedDate(date);
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    void Promise.all([loadTop(date), loadExpenses(date)]);
  };

  // En iyi / en zayıf gün (NET’e göre)
  const bestDate = useMemo(() => {
    if (!dailyRows.length) return null;
    return dailyRows.reduce((a, b) => (b.net > a.net ? b : a)).date;
  }, [dailyRows]);

  const worstDate = useMemo(() => {
    if (!dailyRows.length) return null;
    return dailyRows.reduce((a, b) => (b.net < a.net ? b : a)).date;
  }, [dailyRows]);

  /* -------- loaders -------- */
  async function load() {
    setLoading(true);
    try {
      const rows = await fetchDaily(from, to);
      setDailyRows(rows);

      const best = rows.length ? rows.reduce((a, b) => (b.net > a.net ? b : a)) : null;
      const initial = best?.date ?? rows[0]?.date ?? null;

      setSelectedDate(initial);
      setTop([]);
      setExpenseRows([]);
      setExpenseSum(0);

      if (initial) {
        await Promise.all([loadTop(initial), loadExpenses(initial)]);
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadTop(date: string) {
    setLoadingTop(true);
    try {
      const data = await fetchTopByDate(date, 10);
      setTop(data ?? []);
    } finally {
      setLoadingTop(false);
    }
  }

  async function loadExpenses(date: string) {
    setLoadingExp(true);
    try {
      const r = await api.get<ExpenseItem[]>("/Expenses", { params: { from: date, to: date } });
      const list = Array.isArray(r.data) ? r.data : [];
      setExpenseRows(list);
      setExpenseSum(list.reduce((s, x) => s + Number(x.amount ?? 0), 0));
    } catch {
      setExpenseRows([]);
      setExpenseSum(0);
    } finally {
      setLoadingExp(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* --------------- render --------------- */
  return (
    <div className="w-full max-w-none px-4 md:px-6 py-4 space-y-4">
      <div className="title">Analiz</div>

      {/* Tarih filtreleri */}
      <div className="card p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 items-end gap-3">
          <div>
            <div className="muted text-sm mb-1">Başlangıç</div>
            <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <div className="muted text-sm mb-1">Bitiş</div>
            <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex md:justify-end">
            <button className="btn" onClick={load} disabled={loading}>
              {loading ? "Yükleniyor…" : "Getir"}
            </button>
          </div>
        </div>
      </div>

      {/* Günlük Analiz (tam genişlik) */}
      <div className="card p-4 overflow-x-auto">
        <div className="font-medium mb-3">Günlük Analiz ({from} → {to})</div>

        {loading && <div className="muted">Yükleniyor…</div>}
        {!loading && dailyRows.length === 0 && <div className="muted">Kayıt yok.</div>}

        {dailyRows.length > 0 && (
          <table className="w-full text-sm">
            <thead className="text-zinc-400 border-b border-neutral-800">
              <tr>
                <th className="py-2 w-8"></th>
                <th className="py-2 text-left">Tarih</th>
                <th className="py-2 text-right">Ciro</th>
                <th className="py-2 text-right">Gider</th>
                <th className="py-2 text-right">Net</th>
                <th className="py-2 text-right">Sipariş</th>
                <th className="py-2 text-right">Ort. Fiş</th>
                <th className="py-2 w-28 text-left">Rozet</th>
                <th className="py-2 w-40"></th>
              </tr>
            </thead>
            <tbody>
              {dailyRows.map((r) => {
                const isSelected = r.date === selectedDate;
                const isBest = r.date === bestDate;
                const isWorst = r.date === worstDate;

                return (
                  <tr
                    key={r.date}
                    className={`border-b border-neutral-900 hover:bg-white/5 cursor-pointer ${
                      isSelected ? "bg-white/10" : ""
                    }`}
                    onClick={() => selectDayAndScroll(r.date)}
                  >
                    <td className="text-center">{isSelected ? "➜" : ""}</td>
                    <td className="py-2">{r.label}</td>
                    <td className="py-2 text-right">{fmt(r.revenue)}</td>
                    <td className="py-2 text-right">{fmt(r.expense)}</td>
                    <td className={`py-2 text-right ${r.net >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmt(r.net)}</td>
                    <td className="py-2 text-right">{r.orders}</td>
                    <td className="py-2 text-right">{fmt(r.avgTicket)}</td>
                    <td className="py-2">
                      {isBest && <span className="px-2 py-1 rounded bg-emerald-500/20 text-emerald-300">En iyi</span>}
                      {isWorst && <span className="px-2 py-1 rounded bg-red-500/20 text-red-300">Zayıf</span>}
                    </td>
                    <td className="py-2">
                      <button
                        className="btn btn-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          selectDayAndScroll(r.date);
                        }}
                      >
                        O günün Top Ürünleri
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Alt: Top Ürünler + Giderler yan yana */}
      <div ref={bottomRef} className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Sol: Top Ürünler */}
        <div className="card p-4">
          <div className="font-medium mb-3">
            Top Ürünler — {selectedDate ? dailyRows.find((x) => x.date === selectedDate)?.label : "-"}
          </div>

          {loadingTop && <div className="muted">Yükleniyor…</div>}
          {!loadingTop && top.length === 0 && <div className="muted">Kayıt yok.</div>}

          {!loadingTop && top.length > 0 && (
            <ul className="divide-y divide-neutral-800">
              {top.map((p) => (
                <li key={p.productId} className="py-2 flex items-center justify-between">
                  <div>{p.name}</div>
                  <div className="text-right">
                    <div className="opacity-80">{p.qty} adet</div>
                    <div className="opacity-60">{fmt(p.revenue)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Sağ: Giderler */}
        <div className="card p-4 overflow-x-auto">
          <div className="font-medium mb-3">
            Giderler — {selectedDate ? dailyRows.find((x) => x.date === selectedDate)?.label : "-"}
          </div>

          {loadingExp && <div className="muted">Yükleniyor…</div>}
          {!loadingExp && expenseRows.length === 0 && <div className="muted">Kayıt yok.</div>}

          {!loadingExp && expenseRows.length > 0 && (
            <table className="w-full text-sm">
              <thead className="text-zinc-400 border-b border-neutral-800">
                <tr>
                  <th className="py-2 text-left">Kategori</th>
                  <th className="py-2 text-left">Başlık</th>
                  <th className="py-2 text-left">Ödeme</th>
                  <th className="py-2 text-right">Tutar</th>
                </tr>
              </thead>
              <tbody>
                {expenseRows.map((e) => (
                  <tr key={e.id} className="border-b border-neutral-900">
                    <td className="py-2">{e.category || "-"}</td>
                    <td className="py-2">{e.title}</td>
                    <td className="py-2">{e.payment || "-"}</td>
                    <td className="py-2 text-right">{fmt(e.amount)}</td>
                  </tr>
                ))}
                <tr>
                  <td className="py-2 font-medium" colSpan={3}>
                    Toplam
                  </td>
                  <td className="py-2 text-right font-semibold">{fmt(expenseSum)}</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
