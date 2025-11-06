import { useEffect, useMemo, useState } from "react";
import { api } from "../api"; // summary/closed/detail için
import {
  fetchDaily,
  fetchTopByDate,
  type DailyRow,
  type TopProduct,
} from "../api";

/* ----------------------- EXISTING ENDPOINTS ----------------------- */
const ENDPOINTS = {
  summary: "/Dashboard/summary",
  closed: "/Orders/closed",
  orderDetail: (id: number) => `/Orders/${id}/detail`,
};

/* -------------------------- EXISTING TYPES ------------------------ */
type Summary = {
  from: string;
  to: string;
  revenue: number;
  expense: number;
  net: number;
};

type ClosedOrder = {
  id: number;
  orderNo: string;
  tableId: number | null;
  payment: string | null;
  closedAt: string; // ISO
  total: number;
  count: number;
};

type OrderDetailItem = {
  productId?: number;
  productName: string;
  qty: number;
  unitPrice: number;
  total: number;
  note?: string | null;
  garnitures?: string | null;
};

type OrderDetailDto = {
  id: number;
  orderNo?: string;
  tableId: number | null;
  payment: string | null;
  closedAt: string | null;
  items: OrderDetailItem[];
};

/* --------------------------- HELPERS ------------------------------ */
function toYmdLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function fmt(n: number) {
  return `${(n ?? 0).toFixed(2)} ₺`;
}

/* --------------------------- PAGE -------------------------------- */
export default function ReportsPage() {
  const today = toYmdLocal(new Date());

  // Tarih aralığı
  const [from, setFrom] = useState<string>(today);
  const [to, setTo] = useState<string>(today);

  // Üst kart özet
  const [summary, setSummary] = useState<Summary | null>(null);

  // Kapalı adisyonlar
  const [list, setList] = useState<ClosedOrder[]>([]);
  const [loading, setLoading] = useState(false);

  // Detay modal state
  const [detailModal, setDetailModal] = useState<OrderDetailDto | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Günlük Analiz state’leri
  const [dailyRows, setDailyRows] = useState<DailyRow[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [loadingTop, setLoadingTop] = useState(false);

  // Kırılım kartları (mevcut)
  const selectedTotals = useMemo(() => {
    const revenue = list.reduce((s, o) => s + (o.total ?? 0), 0);
    const cash = list
      .filter((o) => (o.payment ?? "").toLowerCase() === "nakit")
      .reduce((s, o) => s + (o.total ?? 0), 0);
    const card = list
      .filter((o) => (o.payment ?? "").toLowerCase() === "kart")
      .reduce((s, o) => s + (o.total ?? 0), 0);
    const credit = list
      .filter((o) => (o.payment ?? "").toLowerCase() === "veresiye")
      .reduce((s, o) => s + (o.total ?? 0), 0);
    return { revenue, cash, card, credit };
  }, [list]);

  // En iyi / en zayıf günler
  const bestDate = useMemo(() => {
    if (!dailyRows.length) return null;
    return dailyRows.reduce((a, b) => (b.net > a.net ? b : a)).date;
  }, [dailyRows]);

  const worstDate = useMemo(() => {
    if (!dailyRows.length) return null;
    return dailyRows.reduce((a, b) => (b.net < a.net ? b : a)).date;
  }, [dailyRows]);

  // Toolbar'da mini çipler için toplamlar
  const totalStats = useMemo(() => {
    const revenue = dailyRows.reduce((s, r) => s + (Number(r.revenue) || 0), 0);
    const expense = dailyRows.reduce((s, r) => s + (Number(r.expense) || 0), 0);
    const orders = dailyRows.reduce((s, r) => s + (Number(r.orders) || 0), 0);
    const net = revenue - expense;
    const avgTicket = orders > 0 ? revenue / orders : 0;
    return { revenue, expense, net, orders, avgTicket };
  }, [dailyRows]);

  /* ------------------- LOADERS ------------------- */
  async function loadAll() {
    setLoading(true);
    try {
      // 1) Özet
      const s = await api.get<Summary>(ENDPOINTS.summary, { params: { from, to } });
      setSummary(s.data);

      // 2) Kapalı adisyonlar
      const r = await api.get<ClosedOrder[]>(ENDPOINTS.closed, { params: { from, to } });
      setList(r.data ?? []);

      // 3) Günlük analiz
      const d = await fetchDaily(from, to);
      setDailyRows(d ?? []);

      // Varsayılan seçili gün: en iyi gün
      if (d && d.length) {
        const best = d.reduce((a, b) => (b.net > a.net ? b : a));
        setSelectedDate(best.date);
      } else {
        setSelectedDate(null);
      }
      setTopProducts([]);
    } finally {
      setLoading(false);
    }
  }

  async function openDetail(id: number) {
    setLoadingDetail(true);
    try {
      const r = await api.get<OrderDetailDto>(ENDPOINTS.orderDetail(id));
      setDetailModal(r.data);
    } catch {
      alert("Adisyon detayları alınamadı.");
      setDetailModal(null);
    } finally {
      setLoadingDetail(false);
    }
  }

  // Seçili gün değişince Top Ürünleri çek
  useEffect(() => {
    (async () => {
      if (!selectedDate) return;
      setLoadingTop(true);
      try {
        const tops = await fetchTopByDate(selectedDate, 10);
        setTopProducts(tops ?? []);
      } finally {
        setLoadingTop(false);
      }
    })();
  }, [selectedDate]);

  useEffect(() => {
    loadAll();
  }, []);

  /* ----------------- Quick range helpers ----------------- */
  function setToday() {
    const d = toYmdLocal(new Date());
    setFrom(d);
    setTo(d);
    // İstersen otomatik yükle:
    // setTimeout(loadAll, 0);
  }
  function setLastDays(n: number) {
    const toD = new Date();
    const fromD = new Date();
    fromD.setDate(toD.getDate() - (n - 1));
    const ymd = (x: Date) => toYmdLocal(x);
    setFrom(ymd(fromD));
    setTo(ymd(toD));
    // setTimeout(loadAll, 0);
  }

  // CSV export (günlük analiz)
  function exportCsv() {
    const rows = dailyRows;
    const header = ["date", "label", "revenue", "expense", "net", "orders", "avgTicket"];
    const csv = [
      header.join(","),
      ...rows.map((r) =>
        [
          r.date,
          `"${(r as any).label ?? ""}"`,
          r.revenue,
          r.expense,
          r.net,
          r.orders,
          r.avgTicket,
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rapor_gunluk_${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ------------------- RENDER -------------------- */
  return (
    <div className="mx-auto max-w-7xl p-4 space-y-4">
      <div className="title">Raporlar</div>

      {/* Üst kartlar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="card p-4">
          <div className="muted">Toplam Gelir</div>
          <div className="text-2xl font-semibold">{fmt(summary?.revenue ?? 0)}</div>
        </div>
        <div className="card p-4">
          <div className="muted">Toplam Gider</div>
          <div className="text-2xl font-semibold">{fmt(summary?.expense ?? 0)}</div>
        </div>
        <div className="card p-4">
          <div className="muted">Net Kâr</div>
          <div className="text-2xl font-semibold">{fmt(summary?.net ?? 0)}</div>
        </div>
      </div>

      {/* 🔧 Kompakt tarih toolbar */}
      <div className="card p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-zinc-400">Başlangıç</span>
          <input
            type="date"
            className="input h-8 w-[140px]"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />

          <span className="text-xs text-zinc-400 ml-1">Bitiş</span>
          <input
            type="date"
            className="input h-8 w-[140px]"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />

          {/* dikey ayraç */}
          <div className="h-6 w-px bg-neutral-800 mx-1" />

          {/* hızlı aralıklar */}
          <div className="flex items-center gap-1">
            <button className="btn btn-xs" onClick={setToday} title="Bugünün verileri">
              Bugün
            </button>
            <button className="btn btn-xs" onClick={() => setLastDays(7)} title="Son 7 gün">
              Son 7
            </button>
            <button className="btn btn-xs" onClick={() => setLastDays(30)} title="Son 30 gün">
              Son 30
            </button>
          </div>

          <div className="grow" />

          {/* mini özet çipleri */}
          <div className="hidden md:flex items-center gap-2 mr-2">
            <span className="px-2 py-1 rounded bg-neutral-900 text-xs">
              Ciro: {fmt(totalStats.revenue)}
            </span>
            <span className="px-2 py-1 rounded bg-neutral-900 text-xs">
              Sipariş: {totalStats.orders}
            </span>
            <span className="px-2 py-1 rounded bg-neutral-900 text-xs">
              Ort. Fiş: {fmt(totalStats.avgTicket)}
            </span>
          </div>

          <button className="btn btn-sm" onClick={loadAll} disabled={loading}>
            {loading ? "Yükleniyor…" : "Getir"}
          </button>
          <button className="btn btn-sm btn-ghost" onClick={exportCsv} title="CSV indir">
            CSV
          </button>
        </div>
      </div>

      {/* Günlük Analiz + Top Ürünler */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* SOL: Günlük Analiz Tablosu */}
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
                      className={`border-b border-neutral-900 hover:bg-white/5 cursor-pointer ${isSelected ? "bg-white/10" : ""}`}
                      onClick={() => setSelectedDate(r.date)}
                    >
                      <td className="text-center">{isSelected ? "➜" : ""}</td>
                      <td className="py-2">{(r as any).label ?? r.date}</td>
                      <td className="py-2 text-right">{fmt(r.revenue)}</td>
                      <td className="py-2 text-right">{fmt(r.expense)}</td>
                      <td className={`py-2 text-right ${r.net >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmt(r.net)}</td>
                      <td className="py-2 text-right">{r.orders}</td>
                      <td className="py-2 text-right">{fmt(r.avgTicket)}</td>
                      <td className="py-2">
                        {isBest && <span className="px-2 py-1 rounded bg-emerald-500/20 text-emerald-300">En iyi</span>}
                        {isWorst && <span className="px-2 py-1 rounded bg-red-500/20 text-red-300">En zayıf</span>}
                      </td>
                      <td className="py-2">
                        <button
                          className="btn btn-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedDate(r.date);
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

        {/* SAĞ: Top Ürünler */}
        <div className="card p-4">
          <div className="font-medium mb-3">
            Top Ürünler — {selectedDate ? (dailyRows.find((x) => x.date === selectedDate) as any)?.label ?? selectedDate : "-"}
          </div>

          {loadingTop && <div className="muted">Yükleniyor…</div>}
          {!loadingTop && topProducts.length === 0 && <div className="muted">Kayıt yok.</div>}

          {!loadingTop && topProducts.length > 0 && (
            <ul className="divide-y divide-neutral-800">
              {topProducts.map((p) => (
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
      </div>

      {/* Kapalı adisyonlar tablosu (MEVCUT) */}
      <div className="card p-4 overflow-x-auto">
        <div className="font-medium mb-3">Kapatılan adisyonlar ({from} → {to})</div>

        {loading && <div className="muted">Yükleniyor…</div>}
        {!loading && list.length === 0 && <div className="muted">Kayıt yok.</div>}

        {list.length > 0 && (
          <table className="w-full text-sm">
            <thead className="text-zinc-400 border-b border-neutral-800">
              <tr>
                <th className="py-2 text-left">Tarih</th>
                <th className="py-2 text-left">Adisyon No</th>
                <th className="py-2 text-left">Masa</th>
                <th className="py-2 text-left">Ödeme</th>
                <th className="py-2 text-left">Ürün</th>
                <th className="py-2 text-right">Tutar</th>
                <th className="py-2 text-right"> </th>
              </tr>
            </thead>
            <tbody>
              {list.map((o) => (
                <tr key={o.id} className="border-b border-neutral-900">
                  <td className="py-2">{new Date(o.closedAt).toLocaleString()}</td>
                  <td className="py-2">{o.orderNo}</td>
                  <td className="py-2">{o.tableId ?? "-"}</td>
                  <td className="py-2">{o.payment ?? "-"}</td>
                  <td className="py-2">{o.count}</td>
                  <td className="py-2 text-right">{fmt(o.total)}</td>
                  <td className="py-2 text-right">
                    <button className="btn btn-sm" onClick={() => openDetail(o.id)}>Detay</button>
                  </td>
                </tr>
              ))}
              <tr>
                <td className="py-2 font-medium" colSpan={5}>Toplam</td>
                <td className="py-2 text-right font-semibold">{fmt(selectedTotals.revenue)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        )}
      </div>

      {/* Detay Modal (MEVCUT) */}
      {detailModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-neutral-900 p-5 rounded-xl max-w-2xl w-full shadow-lg">
            <div className="flex justify-between items-center mb-3">
              <div className="font-semibold text-lg">Adisyon #{detailModal.orderNo ?? detailModal.id}</div>
              <button className="btn btn-sm btn-ghost" onClick={() => setDetailModal(null)}>✕</button>
            </div>

            <div className="text-sm mb-2 text-zinc-400">
              Masa: {detailModal.tableId ?? "-"} • {detailModal.payment ?? "-"} •{" "}
              {detailModal.closedAt ? new Date(detailModal.closedAt).toLocaleString() : "-"}
            </div>

            <div className="overflow-y-auto max-h-96 border-t border-neutral-800 mt-2 pt-2">
              {loadingDetail ? (
                <div className="muted">Yükleniyor…</div>
              ) : detailModal.items?.length ? (
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-zinc-400 text-left border-b border-neutral-800">
                      <th className="py-1">Ürün</th>
                      <th className="py-1 text-right">Adet</th>
                      <th className="py-1 text-right">Birim ₺</th>
                      <th className="py-1 text-right">Toplam ₺</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailModal.items.map((i, idx) => (
                      <tr key={idx} className="border-b border-neutral-900">
                        <td className="py-1">
                          <div>{i.productName}</div>
                          {i.garnitures && <div className="text-xs text-zinc-500">Çıkarılacaklar: {i.garnitures}</div>}
                          {i.note && <div className="text-xs text-zinc-500">Not: {i.note}</div>}
                        </td>
                        <td className="py-1 text-right">{i.qty}</td>
                        <td className="py-1 text-right">{i.unitPrice.toFixed(2)}</td>
                        <td className="py-1 text-right">{i.total.toFixed(2)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td className="py-2 font-medium" colSpan={3}>Genel Toplam</td>
                      <td className="py-2 text-right font-semibold">
                        {fmt(detailModal.items.reduce((s, x) => s + x.total, 0))}
                      </td>
                    </tr>
                  </tbody>
                </table>
              ) : (
                <div className="muted">Ürün bulunamadı.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
