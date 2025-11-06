// App.tsx (tam güncel sürüm)

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";

import type {
  Product,
  Summary,
  Table,
  OpenOrderInfo,
  OrderItemDto,
} from "./types";
import { useCart } from "./store";
import GarnitureModal from "./assets/components/GarnitureModal";
import NoteModal from "./assets/components/NoteModal";
import AnalyticsPage from "./pages/AnalyticsPage";

// ---------------- Mini Router ----------------
type Page = "DASHBOARD" | "REPORTS" | "STOCK" | "EXPENSES" | "EOD" | "ANALYTICS";

// ---------------- Backend Endpoints ----------------
const ENDPOINTS = {
  openSummary: "/Orders/open",
  openDetail: "/Orders/open/detail",
  openCreate: "/Orders/open",
  closeById: (id: number) => `/Orders/${id}/close`,

  // adisyonda satır düzenleme
  itemDelta: (orderId: number, itemId: number) => `/Orders/${orderId}/items/${itemId}`, // PATCH { delta }
  itemDelete: (orderId: number, itemId: number) => `/Orders/${orderId}/items/${itemId}`, // DELETE

  closedOrders: "/Orders/closed", // GET ?from=YYYY-MM-DD&to=YYYY-MM-DD
  summary: "/Dashboard/summary",
  tables: "/Tables",
  products: "/Products",

  // giderler
  expenses: "/Expenses", // GET ?from=YYYY-MM-DD&to=YYYY-MM-DD | POST | PUT/{id} | DELETE/{id}

  // rapor & analiz
  orderDetail: (id: number) => `/Orders/${id}/detail`,
  analyticsWeekday: "/Analytics/weekday",
  analyticsTopProducts: "/Analytics/top-products",
  analyticsWeekdayFull: "/Analytics/weekday-full",
  analyticsTopProductsByWeekday: "/Analytics/top-products-by-weekday",
};

// ---------------- Tipler ----------------
type OpenItem = {
  id?: number;
  productId: number;
  name: string;
  qty: number;
  unitPrice?: number;
  price?: number;
  garnitures?: string | null;
  note?: string | null;
};
type OpenDetail = { orderId?: number; items: OpenItem[]; total: number; count: number };
type Tab = "ALL" | "DRINKS" | "SOUPS" | "FOODS" | "DONER" | "MENUS";

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
  productName?: string; // backend ProductName
  name?: string;
  qty: number;
  unitPrice: number;
  total?: number; // yoksa qty*unitPrice
  note?: string | null;
  garnitures?: string | null;
};

type OrderDetailDto = {
  id: number;
  orderNo: string;
  tableId: number | null;
  payment: string | null;
  closedAt: string; // ISO
  items: OrderDetailItem[];
  total?: number; // backend gönderiyorsa
};

// ---- Backend Expense tipleri ----
type ExpenseListItemDto = {
  id: number;
  date: string; // ISO/Date
  title: string;
  amount: number;
  category?: string | null;
  payment?: string | null;
  note?: string | null;
};

// UI üzerinde düzenleme için hafif model
type UiExpense = {
  id?: number;
  _tmpId?: string; // yeni satırlar için
  date: string; // YYYY-MM-DD
  title: string;
  amount: number;
  category?: string;
  payment?: string;
  note?: string;
  _isNew?: boolean;
  _isDirty?: boolean;
  _saving?: boolean;
};

// Detaydan özet üret (masa kartında Açık/Boş göstermek için)
function infoFromDetail(tableId: number, d?: OpenDetail | null): OpenOrderInfo | null {
  if (!d || !d.items?.length) return null;
  return {
    id: d.orderId ?? 0,
    tableId,
    orderNo: "",
    total: d.total ?? 0,
    count: d.count ?? d.items.length,
  };
}

// >>> Yerel tarih üret (UTC kaymasını engeller)
function ymdToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function fmt(n: number) {
  return `${(Number(n) || 0).toFixed(2)} ₺`;
}
function fmtDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function rid() {
  try {
    const buf = new Uint32Array(2);
    crypto.getRandomValues(buf);
    return `x${buf[0].toString(16)}${buf[1].toString(16)}`;
  } catch {
    return Math.random().toString(36).slice(2);
  }
}

// ===================================================
//                       APP
// ===================================================
export default function App() {
  // ---- mini router ----
  const [page, setPage] = useState<Page>("DASHBOARD");

  // ---- POS state’leri ----
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);

  const [tab, setTab] = useState<Tab>("ALL");

  const [tables, setTables] = useState<Table[]>([]);
  const [activeTableId, setActiveTableId] = useState<number | null>(null);
  const [openInfo, setOpenInfo] = useState<Record<number, OpenOrderInfo | null>>({});
  const [openDetail, setOpenDetail] = useState<Record<number, OpenDetail | null>>({});

  const [modalProduct, setModalProduct] = useState<Product | null>(null);
  const [noteModal, setNoteModal] = useState<{ show: boolean; product: Product | null }>({
    show: false,
    product: null,
  });

  // Sepet
  const cart = useCart();
  const total = cart.items.reduce((s, i) => s + i.price * i.qty, 0);

  // Ürün listesi (kategori filtresi)
  const filtered = useMemo(() => {
    if (tab === "ALL") return products;
    return products.filter((p) => {
      const cat = p.category?.name ?? "";
      if (tab === "DRINKS") return cat === "İçecekler";
      if (tab === "SOUPS") return cat === "Sulu Yemekler";
      if (tab === "FOODS") return cat === "Yemekler";
      if (tab === "DONER") return cat === "Döner";
      if (tab === "MENUS") return cat === "Menüler";
      return true;
    });
  }, [products, tab]);

  // ==== İlk yükler ====
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const [prods, tbls] = await Promise.all([
          api.get<Product[]>(ENDPOINTS.products),
          api.get<Table[]>(ENDPOINTS.tables),
        ]);
        setProducts(
          (Array.isArray(prods.data) ? prods.data : [])
            .slice()
            .sort((a, b) => (a?.name ?? "").localeCompare(b?.name ?? ""))
        );
        setTables(tbls.data);
        if (tbls.data.length) setActiveTableId(tbls.data[0].id);
      } catch (e) {
        console.error(e);
        alert("Veriler yüklenemedi. Backend çalışıyor mu?");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // --------- ÖZET (Gelir/Gider/Kâr) — Backend tabanlı -----------
  async function refreshSummary() {
    const d = ymdToday();
    let rev = 0,
      exp: number = Number.NaN,
      net: number = Number.NaN,
      fromStr = d,
      toStr = d;

    // 1) Summary endpoint'i dene (varsa kullan)
    try {
      const r = await api.get<Summary>(ENDPOINTS.summary, { params: { from: d, to: d } });
      const any = r.data as any;
      rev = Number(any.revenue ?? any.Revenue ?? 0);
      exp = Number(any.expense ?? any.Expense ?? Number.NaN);
      net = Number(any.net ?? any.Net ?? Number.NaN);
      fromStr = String(any.from ?? any.From ?? d);
      toStr = String(any.to ?? any.To ?? d);
    } catch {
      // 2) Fallback: kapatılan adisyonlardan ciro
      try {
        const c = await api.get<ClosedOrder[]>(ENDPOINTS.closedOrders, { params: { from: d, to: d } });
        const rows = Array.isArray(c.data) ? c.data : [];
        rev = rows.reduce((s, r) => s + Number(r.total ?? 0), 0);
      } catch {
        rev = 0;
      }
    }

    // 3) Hangi durum olursa olsun gideri /Expenses’tan topla
    try {
      const er = await api.get<ExpenseListItemDto[]>(ENDPOINTS.expenses, { params: { from: fromStr, to: toStr } });
      const list = Array.isArray(er.data) ? er.data : [];
      const sumExp = list.reduce((s, x) => s + Number(x.amount ?? 0), 0);
      exp = sumExp; // summary dönse bile en güncel gider bu
    } catch {
      if (!Number.isFinite(exp)) exp = 0;
    }

    // 4) Net’i güvenle hesapla
    if (!Number.isFinite(net)) net = rev - exp;

    setSummary({ from: fromStr, to: toStr, revenue: rev, expense: exp, net });
  }

  useEffect(() => {
    refreshSummary();
  }, []);
  useEffect(() => {
    if (page === "DASHBOARD") refreshSummary();
  }, [page]);

  // ---- Açık adisyon özetini getir (id/total/count) ----
  async function refreshOpenSummary(tableId?: number) {
    try {
      if (tableId) {
        const r = await api.get(ENDPOINTS.openSummary, { params: { tableId } });
        const data = Array.isArray(r.data) ? r.data?.[0] : r.data;
        setOpenInfo((s) => ({ ...s, [tableId]: data ?? null }));
      } else {
        await Promise.all(
          tables.map(async (t) => {
            try {
              const r = await api.get(ENDPOINTS.openSummary, { params: { tableId: t.id } });
              const data = Array.isArray(r.data) ? r.data?.[0] : r.data;
              setOpenInfo((s) => ({ ...s, [t.id]: data ?? null }));
            } catch {}
          })
        );
      }
    } catch {}
  }

  // ---- Açık adisyon detayını getir ----
  async function refreshOpenDetail(tableId: number) {
    try {
      try {
        const r = await api.get(ENDPOINTS.openDetail, { params: { tableId } });
        if (r.data) {
          const detail: OpenDetail = {
            orderId: Number(r.data.id ?? r.data.Id ?? 0) || undefined,
            items: Array.isArray(r.data.items) ? (r.data.items as OpenItem[]) : [],
            total: Number(r.data.total ?? 0),
            count: Number(r.data.count ?? (Array.isArray(r.data.items) ? r.data.items.length : 0)),
          };
          setOpenDetail((s) => ({ ...s, [tableId]: detail }));
          setOpenInfo((s) => ({ ...s, [tableId]: s[tableId] ?? infoFromDetail(tableId, detail) }));
          return;
        }
      } catch {}

      const f = await api.get(ENDPOINTS.openSummary, { params: { tableId } });
      const entry = Array.isArray(f.data) ? f.data[0] : f.data;
      const detail: OpenDetail | null =
        entry && Array.isArray(entry.items)
          ? {
              items: entry.items as OpenItem[],
              total: Number(entry.total ?? 0),
              count: Number(entry.count ?? entry.items.length),
            }
          : { items: [], total: Number(entry?.total ?? 0), count: Number(entry?.count ?? 0) };
      setOpenDetail((s) => ({ ...s, [tableId]: detail }));
      setOpenInfo((s) => ({ ...s, [tableId]: s[tableId] ?? infoFromDetail(tableId, detail) }));
    } catch {
      setOpenDetail((s) => ({ ...s, [tableId]: null }));
    }
  }

  // Tüm masaların özetlerini çek
  useEffect(() => {
    if (tables.length) refreshOpenSummary();
  }, [tables]);

  // Masa değişince hem özet hem detay çek
  useEffect(() => {
    if (!activeTableId) return;
    refreshOpenSummary(activeTableId);
    refreshOpenDetail(activeTableId);
  }, [activeTableId]);

  // ---- Ürün ekleme / modallar ----
  function handleAdd(p: Product) {
    const cat = p.category?.name ?? "";
    const name = p.name ?? "";

    // Menülerde sadece "Döner + ..." kombinleri garnitür ister
    const isDonerComboInMenu = cat === "Menüler" && /döner/i.test(name);

    const shouldOpenGarniture =
      cat === "Döner" || // Döner kategorisi
      cat === "Yemekler" || // Yemekler kategorisi
      isDonerComboInMenu; // Menülerde döner kombinleri

    if (shouldOpenGarniture) {
      setModalProduct(p);
    } else {
      setNoteModal({ show: true, product: p });
    }
  }

  function handleGarnitureConfirm(data: { garnitures?: string; note?: string }) {
    const p = modalProduct!;
    useCart.getState().add(p, data);
    setModalProduct(null);
  }

  function handleNoteConfirm(note?: string) {
    const p = noteModal.product!;
    useCart.getState().add(p, { note });
    setNoteModal({ show: false, product: null });
  }

  // ---- Sepeti aktif masanın adisyonuna ekle ----
  async function addToTab() {
    if (!activeTableId || cart.items.length === 0) return;
    const items: OrderItemDto[] = cart.items.map((i) => ({
      productId: i.productId,
      qty: i.qty,
      unitPrice: i.price,
      garnitures: i.garnitures ?? null,
      note: i.note ?? null,
    }));
    try {
      await api.post(ENDPOINTS.openCreate, { tableId: activeTableId, note: null, items });
      cart.clear();
      await Promise.all([refreshOpenDetail(activeTableId), refreshOpenSummary(activeTableId)]);
    } catch (e) {
      console.error(e);
      alert("Adisyona eklenemedi. Backend endpoint'ini kontrol et.");
    }
  }

  // ---- Açık adisyon ID’sini güvenle bul ----
  async function getOpenId(tableId: number): Promise<number | null> {
    const fromState = openInfo[tableId];
    if (fromState?.id && fromState.id > 0) return fromState.id;
    try {
      const r = await api.get(ENDPOINTS.openSummary, { params: { tableId } });
      const payload = r.data;
      const candidate = (Array.isArray(payload) ? payload[0] : payload) ?? (payload as any)?.data ?? null;
      const id = candidate?.id ?? candidate?.Id ?? null;
      return id ? Number(id) : null;
    } catch {
      return null;
    }
  }

  // ---- Masayı kapat (Nakit / Kart) ----
  async function closeTab(payment: "Nakit" | "Kart") {
    if (!activeTableId) return;

    const id = await getOpenId(activeTableId);
    if (!id) {
      alert("Bu masada açık adisyon yok.");
      return;
    }

    try {
      await api.post(ENDPOINTS.closeById(id), { payment, note: null });

      setOpenDetail((s) => ({ ...s, [activeTableId]: null }));
      setOpenInfo((s) => ({ ...s, [activeTableId]: null }));

      await refreshSummary();
      await refreshOpenSummary(activeTableId);

      alert(`Masa kapatıldı (${payment}) ✔`);
    } catch (e) {
      console.error(e);
      alert("Adisyon kapatılamadı.");
    }
  }

  // ---- Adisyonda –1 / +1 / Sil ----
  async function changeQty(item: OpenItem, delta: number) {
    if (!activeTableId || !item.id) return alert("Bu satırı düzenlemek için backend item Id gerekli.");
    const detail = openDetail[activeTableId];
    const orderId = detail?.orderId;
    if (!orderId) return alert("Açık adisyon ID bulunamadı.");
    try {
      await api.patch(ENDPOINTS.itemDelta(orderId, item.id), { delta });
      await Promise.all([refreshOpenDetail(activeTableId), refreshOpenSummary(activeTableId)]);
    } catch (e) {
      console.error(e);
      alert("Miktar güncellenemedi.");
    }
  }
  async function removeOpenItem(item: OpenItem) {
    if (!activeTableId || !item.id) return alert("Bu satırı silmek için backend item Id gerekli.");
    const detail = openDetail[activeTableId];
    const orderId = detail?.orderId;
    if (!orderId) return alert("Açık adisyon ID bulunamadı.");
    try {
      await api.delete(ENDPOINTS.itemDelete(orderId, item.id));
      await Promise.all([refreshOpenDetail(activeTableId), refreshOpenSummary(activeTableId)]);
    } catch (e) {
      console.error(e);
      alert("Satır silinemedi.");
    }
  }

  // “Çıkarılacaklar:” önekini tekille
  function prettyGarn(g?: string | null) {
    const raw = (g ?? "").trim();
    const clean = raw.replace(/^Çıkarılacaklar:\s*/i, "");
    return clean ? `Çıkarılacaklar: ${clean}` : "";
  }

  // ---- IMG & print yardımcıları ----

  // public içindeki görseli Data URL'e çevir (termal için daha stabil)
  async function loadAsDataURL(src: string): Promise<string | null> {
    try {
      const res = await fetch(src, { cache: "no-cache" });
      const blob = await res.blob();
      return await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = reject;
        fr.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  }

  

 // --- İFRAME İLE YAZDIRMA (popup yok) ---
async function printHtmlInIframe(html: string) {
  // görünmez iframe oluştur
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.left = "-10000px";
  iframe.style.top = "-10000px";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.opacity = "0";
  document.body.appendChild(iframe);
  const win = iframe.contentWindow!;
  const doc = win.document;
  doc.open();
  doc.write(html);
  doc.close();
  // görseller yüklensin (decode destekliyse onu kullan)
  const imgs = Array.from(doc.images || []);
  if (imgs.length) {
    await Promise.race([
      Promise.all(
        imgs.map((img: any) =>
          img.decode
            ? img.decode().catch(() => {})
            : img.complete
            ? Promise.resolve()
            : new Promise((res) => (img.onload = img.onerror = res))
        )
      ),
      new Promise((res) => setTimeout(res, 1500)),
    ]);
  }

  // yazdır ve temizle
  try { win.focus(); } catch {}
  try { win.print(); } catch {}
  setTimeout(() => { try { iframe.remove(); } catch {} }, 500);
}

  // ---- 60mm rulo için fiş HTML'i ----
  function buildReceiptHtml(args: {
  storeName: string;
  tableName: string;
  orderNo?: string | number;
  items: Array<{ name: string; qty: number; total: number; garnitures?: string; note?: string }>;
  total: number;
  payment?: "Nakit" | "Kart";
  closedAt?: Date;
  logoDataUrl?: string | null;
  instagram?: { handle: string; url: string };
  qrUrl?: string | null;
}) {
  const d = args.closedAt ?? new Date();
  const dt = `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;

  // logo olarak ss1.png kullan
  const logoImg = args.logoDataUrl
    ? `<img src="${args.logoDataUrl}" alt="Logo" style="width:80px;height:auto;object-fit:contain;display:block;" />`
    : "";

  const qrImg = args.qrUrl
    ? `<img src="${args.qrUrl}" alt="QR" style="width:65px;height:65px;object-fit:contain;margin-bottom:3px;" />`
    : "";

  // --- OUTLINE INSTAGRAM LOGO ---
  const instaIcon = `
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" stroke="#000" stroke-width="1.6" viewBox="0 0 24 24">
      <rect x="2.5" y="2.5" width="19" height="19" rx="5" ry="5"/>
      <circle cx="12" cy="12" r="3.5"/>
      <circle cx="17.5" cy="6.5" r="1"/>
    </svg>`;

  const lines = args.items
    .map((i) => {
      const extra1 = i.garnitures ? `<div class="sub">• ${i.garnitures}</div>` : "";
      const extra2 = i.note ? `<div class="sub">• Not: ${i.note}</div>` : "";
      return `
        <tr class="line">
          <td class="col-name">
            <div class="nm">${i.name}</div>
            ${extra1}${extra2}
          </td>
          <td class="col-qty">${i.qty}</td>
          <td class="col-amt">${(Number(i.total) || 0).toFixed(2)} ₺</td>
        </tr>`;
    })
    .join("");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<title>Fiş</title>
<style>
  @page { size: 60mm auto; margin: 4mm 3mm; }
  html,body{margin:0;padding:0;background:#fff;color:#000;font:13px/1.35 system-ui,Segoe UI,Roboto,Arial}
  .w{width:60mm;max-width:60mm;padding:6px 4px 10px 4px}

  .hdr{display:flex;align-items:center;gap:10px;margin-bottom:6px}
  .store{font-weight:800;font-size:15px}
  .meta{font-size:11px;color:#444;line-height:1.4;margin-top:2px}
  .meta div{margin-top:1px}

  table{width:100%;border-collapse:collapse;margin-top:6px}
  thead th{
    font-size:11px;
    color:#000;
    text-align:left;
    padding-bottom:4px;
    border-bottom:2px solid #000; /* BAŞLIK ALTINA KALIN ÇİZGİ */
  }
  .line td{border-bottom:1px dashed #ccc;vertical-align:top;padding:5px 0}
  .nm{font-weight:600}
  .sub{font-size:11px;color:#555;margin-top:2px}
  .col-qty{width:14%;text-align:center;white-space:nowrap}
  .col-amt{width:20%;text-align:right;font-weight:700;white-space:nowrap}

  .sum{display:flex;justify-content:space-between;margin-top:8px;padding-top:5px;border-top:1px solid #000;font-weight:800}

  .bottom{margin-top:10px;border-top:1px solid #e5e5e5;padding-top:6px;text-align:center}
  .insta{display:flex;flex-direction:column;align-items:center;gap:3px}
  .thanks{font-size:11px;margin-top:6px;color:#111;text-align:center}
</style>
</head>
<body>
  <div class="w">
    <div class="hdr">
      ${logoImg}
      <div>
        <div class="store">${args.storeName}</div>
        <div class="meta">
          <div>Masa: ${args.tableName}${args.orderNo ? " • #" + args.orderNo : ""}</div>
          <div>${dt}</div>
          ${args.payment ? `<div>Ödeme: <strong>${args.payment}</strong></div>` : ""}
        </div>
      </div>
    </div>

    <table>
      <thead><tr><th>Ürün</th><th>Adet</th><th style="text-align:right">Tutar</th></tr></thead>
      <tbody>${lines}</tbody>
    </table>

    <div class="sum">
      <div>GENEL TOPLAM</div>
      <div>${(Number(args.total) || 0).toFixed(2)} ₺</div>
    </div>

    <div class="bottom">
      <div class="insta">
        ${qrImg}
        ${instaIcon}
        <div style="font-size:11px;">${args.instagram?.handle ?? "@cakmakfastfood"}</div>
      </div>
      <div class="thanks">
        Afiyet olsun! Bizi tercih ettiğiniz için teşekkür ederiz 💛
      </div>
    </div>
  </div>
</body>
</html>`;
}



  // ---- Yazdır (mevcut açık adisyonu) ----
  // DİKKAT: Açılır pencereyi en başta açıyoruz (await'ten ÖNCE)
  // ---- Yazdır (mevcut açık adisyonu) ----
async function printOpenReceipt(payment?: "Nakit" | "Kart") {
  if (!activeTableId) { alert("Masa seçin."); return; }
  const detail = openDetail[activeTableId];
  if (!detail || !detail.items?.length) { alert("Adisyon boş."); return; }

  // Instagram + QR
  const ig = { handle: "@cakmakfastfood", url: "https://instagram.com/cakmakfastfood" };
  const qrDataUrl =
    (await loadAsDataURL(
      `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(ig.url)}`
    )) ?? null;

  // LOGO (public/logo.png)
  const logoDataUrl = await loadAsDataURL("/ss1.png");

  // Ürünleri 3 kolona göre hazırla (Ürün, Adet, Tutar)
  const items = detail.items.map((it) => {
    const unit = Number(it.unitPrice ?? it.price ?? 0);
    const qty = Number(it.qty) || 1;
    return {
      name: it.name ?? "Ürün",
      qty,
      total: unit * qty,
      garnitures: prettyGarn(it.garnitures) || undefined,
      note: it.note || undefined,
    };
  });

  const html = buildReceiptHtml({
    storeName: "Çakmak Fast&Food",
    tableName: tables.find((t) => t.id === activeTableId)?.name ?? String(activeTableId),
    orderNo: detail.orderId,
    items,
    total: Number(detail.total) || items.reduce((s, x) => s + x.total, 0),
    payment,
    closedAt: new Date(),
    logoDataUrl,
    instagram: ig,
    qrUrl: qrDataUrl,
  });

  // popupsız yazdırma
  await printHtmlInIframe(html);
}

  // ---------------- UI Parçaları ----------------
  function Topbar() {
  const link = (id: Page, label: string) => (
    <button
      className={`px-2 py-1 rounded ${
        page === id ? "text-white" : "text-zinc-400 hover:text-zinc-200"
      }`}
      onClick={() => setPage(id)}
    >
      {label}
    </button>
  );

  return (
    <div className="sticky top-0 z-10 bg-[#0b0d12]/80 backdrop-blur border-b border-neutral-800">
      <div className="mx-auto max-w-7xl px-4 py-0.1 flex items-center justify-between">
        <div
          className="flex items-center gap-3 font-semibold tracking-wide cursor-pointer"
          onClick={() => setPage("DASHBOARD")}
        >
          <img
            src="/logo.png"
            alt="Çakmak Fast&Food Logo"
            className="w-[150px] h-[150px] object-contain"
          />
          <span className="text-[20px] font-semibold text-white">
            Çakmak Fast&Food
          </span>
        </div>

        <div className="flex gap-2 text-sm">
          {link("DASHBOARD", "Dashboard")}
          {link("REPORTS", "Raporlar")}
          {/* {link("STOCK", "Stok")} */}
          {link("EXPENSES", "Giderler")}
          {/* {link("EOD", "Gün Kapanışı")} */}
          {link("ANALYTICS", "Analiz")}
        </div>
      </div>
    </div>
  );
}

  // ---------------- Sayfalar ----------------
  function SummaryCards(props?: { revenue?: number; expense?: number; net?: number }) {
    const rev = props?.revenue ?? (summary?.revenue ?? 0);
    const exp = props?.expense ?? (summary?.expense ?? 0);
    const net = props?.net ?? (summary?.net ?? 0);
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card p-4">
          <div className="muted">Toplam Gelir</div>
          <div className="text-2xl font-semibold">{fmt(rev)}</div>
        </div>
        <div className="card p-4">
          <div className="muted">Toplam Gider</div>
          <div className="text-2xl font-semibold">{fmt(exp)}</div>
        </div>
        <div className="card p-4">
          <div className="muted">Net Kâr</div>
          <div className="text-2xl font-semibold">{fmt(net)}</div>
        </div>
      </div>
    );
  }

  function PageDashboardPOS() {
    const activeDetail = activeTableId ? openDetail[activeTableId] : null;

    return (
      <div className="mx-auto max-w-7xl grid grid-cols-12 gap-4 p-4">
        {/* Sol: Masalar + Ürünler */}
        <div className="col-span-12 lg:col-span-8 space-y-6">
          {/* Masalar */}
          <div>
            <div className="title mb-2">Masalar</div>
            {/* 2 satır x 5 kolon */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {tables.slice(0, 10).map((t) => {
                const info = openInfo[t.id] ?? infoFromDetail(t.id, openDetail[t.id]);
                const active = t.id === activeTableId;
                return (
                  <button
                    key={t.id}
                    className={`card p-3 text-left hover:bg-neutral-900 ${active ? "ring-1 ring-indigo-500" : ""}`}
                    onClick={() => setActiveTableId(t.id)}
                  >
                    <div className="font-medium">{t.name}</div>
                    <div className="mt-1 text-xs text-zinc-400">
                      {info ? `Açık • ${info.count} ürün • ${fmt(info.total)}` : "Boş"}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Ürünler */}
          <div>
            <div className="title mb-2">Ürünler</div>
            <div className="segmented mb-3">
              <button className={`seg ${tab === "ALL" ? "active" : ""}`} onClick={() => setTab("ALL")}>
                Tümü
              </button>
              <button className={`seg ${tab === "DRINKS" ? "active" : ""}`} onClick={() => setTab("DRINKS")}>
                İçecekler
              </button>
              <button className={`seg ${tab === "SOUPS" ? "active" : ""}`} onClick={() => setTab("SOUPS")}>
                Sulu Yemekler
              </button>
              <button className={`seg ${tab === "FOODS" ? "active" : ""}`} onClick={() => setTab("FOODS")}>
                Yemekler
              </button>
              <button className={`seg ${tab === "DONER" ? "active" : ""}`} onClick={() => setTab("DONER")}>
                Döner
              </button>
              <button className={`seg ${tab === "MENUS" ? "active" : ""}`} onClick={() => setTab("MENUS")}>
                Menüler
              </button>
            </div>

            {loading ? (
              <div className="muted">Yükleniyor…</div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {filtered.map((p) => (
                  <button key={p.id} className="card p-4 hover:bg-neutral-900 text-left" onClick={() => handleAdd(p)}>
                    <div className="muted">{p.name}</div>
                    <div className="text-lg font-semibold">{fmt(p.prices?.[0]?.value ?? 0)}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Özet kartları */}
          <SummaryCards />
        </div>

        {/* Sağ: Açık Adisyon + Sepet */}
        <div className="col-span-12 lg:col-span-4 space-y-3">
          {/* Açık adisyon paneli */}
          <div className="card p-4">
            <div className="title mb-2">
              {activeTableId
                ? `Açık Adisyon • ${tables.find((t) => t.id === activeTableId)?.name ?? ""}`
                : "Açık Adisyon"}
            </div>

            {!activeTableId && <div className="muted">Bir masa seçin.</div>}

            {activeTableId && (
              <>
                {activeDetail ? (
                  activeDetail.items.length > 0 ? (
                    <div className="space-y-2">
                      {activeDetail.items.map((it, idx) => {
                        const unit = it.unitPrice ?? it.price ?? 0;
                        const canEdit = !!(it as any).id && !!activeDetail.orderId;
                        return (
                          <div key={idx} className="py-2 border-b border-neutral-800">
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span>{it.name}</span>
                                  {!canEdit && <span className="badge muted text-[10px]">id yok</span>}
                                </div>
                                <div className="muted text-xs">
                                  {fmt(unit)} x {it.qty}
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                {canEdit ? (
                                  <>
                                    <button className="btn btn-sm" onClick={() => changeQty(it as any, -1)}>
                                      -
                                    </button>
                                    <div className="w-8 text-center text-sm">{it.qty}</div>
                                    <button className="btn btn-sm" onClick={() => changeQty(it as any, +1)}>
                                      +
                                    </button>
                                    <button className="btn btn-sm btn-danger" onClick={() => removeOpenItem(it as any)}>
                                      Sil
                                    </button>
                                  </>
                                ) : (
                                  <div className="muted text-xs">Düzenleme için backend itemId döndürmeli</div>
                                )}
                                <div className="text-sm font-medium w-24 text-right">{fmt(unit * it.qty)}</div>
                              </div>
                            </div>

                            {prettyGarn(it.garnitures) && (
                              <div className="text-xs text-zinc-400 mt-1">{prettyGarn(it.garnitures)}</div>
                            )}
                            {it.note && <div className="text-xs italic text-zinc-400">Not: {it.note}</div>}
                          </div>
                        );
                      })}

                      <div className="flex items-center justify-between pt-2">
                        <div className="muted">Adisyon Toplam</div>
                        <div className="text-lg font-semibold">{fmt(activeDetail.total)}</div>
                      </div>

                      {/* Yazdırma */}
                      <div className="mt-2 grid grid-cols-1 gap-2">
                        <button className="btn w-full" onClick={() => printOpenReceipt()}>
                          Yazdır
                        </button>
                       
                      </div>

                      {/* Ödeme */}
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button className="btn w-full" onClick={() => closeTab("Nakit")}>
                          Nakit
                        </button>
                        <button className="btn w-full" onClick={() => closeTab("Kart")}>
                          Kart
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="muted">Adisyon boş.</div>
                  )
                ) : (
                  <div className="muted">Bu masada açık adisyon yok.</div>
                )}
              </>
            )}
          </div>

          {/* Sepet paneli */}
          <div className="card p-4">
            <div className="title mb-1">
              {activeTableId ? `Sepet • ${tables.find((t) => t.id === activeTableId)?.name ?? ""}` : "Sepet"}
            </div>
            <div className="muted mb-3 text-xs">Buradakiler seçili masanın adisyonuna eklenecek.</div>

            <div className="space-y-2">
              {cart.items.length === 0 && <div className="muted">Sepet boş</div>}
              {cart.items.map((i) => (
                <div key={`${i.productId}-${i.garnitures ?? ""}-${i.note ?? ""}`} className="py-2 border-b border-neutral-800">
                  <div className="flex items-center justify-between">
                    <div>
                      <div>{i.name}</div>
                      <div className="muted text-xs">
                        {fmt(i.price)} x {i.qty}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="btn" onClick={() => useCart.getState().dec(i.productId)}>
                        -
                      </button>
                      <div className="w-8 text-center">{i.qty}</div>
                      <button className="btn" onClick={() => useCart.getState().inc(i.productId)}>
                        +
                      </button>
                    </div>
                  </div>
                  {prettyGarn(i.garnitures) && <div className="text-xs text-zinc-400 mt-1">{prettyGarn(i.garnitures)}</div>}
                  {i.note && <div className="text-xs italic text-zinc-400">Not: {i.note}</div>}
                </div>
              ))}
            </div>

            <div className="border-t border-neutral-800 my-3" />
            <div className="flex items-center justify-between">
              <div className="muted">Sepet Toplam</div>
              <div className="text-xl font-semibold">{fmt(total)}</div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button className="btn" disabled={!activeTableId || cart.items.length === 0} onClick={addToTab}>
                Adisyona Ekle
              </button>
              <button className="btn btn-ghost" disabled={cart.items.length === 0} onClick={() => cart.clear()}>
                Sepeti Temizle
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---------------- Raporlar Sayfası ----------------
  function PageReports() {
    const [from, setFrom] = useState<string>(ymdToday());
    const [to, setTo] = useState<string>(ymdToday());
    const [rows, setRows] = useState<ClosedOrder[]>([]);
    const [loadingRows, setLoadingRows] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    // Filtreler
    const [payFilter, setPayFilter] = useState<"ALL" | "Nakit" | "Kart">("ALL");
    const [tableFilter, setTableFilter] = useState<"ALL" | number>("ALL");

    // Gider toplamı (SQL'den)
    const [expenseTotal, setExpenseTotal] = useState<number>(0);

    // Detay modal state
    const [detailModal, setDetailModal] = useState<OrderDetailDto | null>(null);
    const [loadingDetail, setLoadingDetail] = useState(false);

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

    // ESC ile modal kapat
    useEffect(() => {
      function onKey(e: KeyboardEvent) {
        if (e.key === "Escape") setDetailModal(null);
      }
      if (detailModal) window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, [detailModal]);

    async function loadExpenseTotal(rangeFrom: string, rangeTo: string) {
      try {
        const r = await api.get<ExpenseListItemDto[]>(ENDPOINTS.expenses, { params: { from: rangeFrom, to: rangeTo } });
        const list = Array.isArray(r.data) ? r.data : [];
        const sum = list.reduce((s, x) => s + Number(x.amount ?? 0), 0);
        setExpenseTotal(sum);
      } catch {
        setExpenseTotal(0);
      }
    }

    async function loadClosed() {
      setLoadingRows(true);
      setErr(null);
      try {
        const r = await api.get<ClosedOrder[]>(ENDPOINTS.closedOrders, { params: { from, to } });
        setRows(Array.isArray(r.data) ? r.data : []);
      } catch (e) {
        console.error(e);
        setErr("Kapatılan adisyonlar yüklenemedi.");
        setRows([]);
      } finally {
        setLoadingRows(false);
      }
      await loadExpenseTotal(from, to);
    }

    useEffect(() => {
      loadClosed();
    }, []); // ilk açılış

    // Filtrelenmiş satırlar
    const filteredRows = useMemo(() => {
      return rows.filter((r) => {
        const payOk = payFilter === "ALL" || (r.payment ?? "").toLowerCase() === payFilter.toLowerCase();
        const tableOk = tableFilter === "ALL" || r.tableId === tableFilter;
        return payOk && tableOk;
      });
    }, [rows, payFilter, tableFilter]);

    const totals = useMemo(() => {
      const totalRevenue = filteredRows.reduce((s, x) => s + (x.total ?? 0), 0);
      const byPay: Record<string, number> = {};
      filteredRows.forEach((r) => {
        const key = (r.payment ?? "Diğer").toLowerCase();
        byPay[key] = (byPay[key] ?? 0) + (r.total ?? 0);
      });
      const net = totalRevenue - expenseTotal; // gider SQL'den
      return { totalRevenue, byPay, net };
    }, [filteredRows, expenseTotal]);

    // modal içinde toplam
    function detailGrandTotal(d: OrderDetailDto | null) {
      if (!d?.items?.length) return 0;
      return d.items.reduce((s, it) => s + (Number(it.total) || it.qty * it.unitPrice), 0);
    }

    return (
      <div className="mx-auto max-w-7xl p-4 space-y-4">
        <div className="title">Raporlar</div>

        {/* özet (seçim: from-to) */}
        <SummaryCards revenue={totals.totalRevenue} expense={expenseTotal} net={totals.net} />

        {/* filtreler */}
        <div className="card p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div>
              <div className="muted text-sm mb-1">Başlangıç</div>
              <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <div className="muted text-sm mb-1">Bitiş</div>
              <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>

            {/* Ödeme filtresi */}
            <div>
              <div className="muted text-sm mb-1">Ödeme</div>
              <select className="input" value={payFilter} onChange={(e) => setPayFilter(e.target.value as any)}>
                <option value="ALL">Hepsi</option>
                <option value="Nakit">Nakit</option>
                <option value="Kart">Kart</option>
              </select>
            </div>

            {/* Masa filtresi */}
            <div>
              <div className="muted text-sm mb-1">Masa</div>
              <select
                className="input"
                value={tableFilter === "ALL" ? "ALL" : String(tableFilter)}
                onChange={(e) => {
                  const v = e.target.value;
                  setTableFilter(v === "ALL" ? "ALL" : Number(v));
                }}
              >
                <option value="ALL">Hepsi</option>
                {tables.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grow" />
            <button className="btn" onClick={loadClosed} disabled={loadingRows}>
              {loadingRows ? "Yükleniyor…" : "Listeyi Getir"}
            </button>
          </div>
        </div>

        {/* kırılımlar */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="card p-4">
            <div className="muted">Toplam Gelir (seçim)</div>
            <div className="text-2xl font-semibold">{fmt(totals.totalRevenue)}</div>
          </div>
          <div className="card p-4">
            <div className="muted">Gider (seçim)</div>
            <div className="text-2xl font-semibold">{fmt(expenseTotal)}</div>
          </div>
          <div className="card p-4">
            <div className="muted">Nakit</div>
            <div className="text-2xl font-semibold">{fmt(totals.byPay["nakit"] ?? 0)}</div>
          </div>
          <div className="card p-4">
            <div className="muted">Kart</div>
            <div className="text-2xl font-semibold">{fmt(totals.byPay["kart"] ?? 0)}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-1 gap-3">
          <div className="card p-4">
            <div className="muted">Net (Gelir - Gider)</div>
            <div className="text-2xl font-semibold">{fmt(totals.net)}</div>
          </div>
        </div>

        {/* liste */}
        <div className="card p-4">
          <div className="font-medium mb-3">
            Kapatılan adisyonlar ({from} → {to})
          </div>
          {err && <div className="text-red-400 text-sm mb-2">{err}</div>}
          {loadingRows ? (
            <div className="muted">Yükleniyor…</div>
          ) : filteredRows.length === 0 ? (
            <div className="muted">Kayıt yok.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-zinc-400 border-b border-neutral-800">
                    <th className="py-2 pr-3">Tarih</th>
                    <th className="py-2 pr-3">Adisyon No</th>
                    <th className="py-2 pr-3">Masa</th>
                    <th className="py-2 pr-3">Ödeme</th>
                    <th className="py-2 pr-3">Ürün</th>
                    <th className="py-2 pr-3 text-right">Tutar</th>
                    <th className="py-2 pr-0 text-right"> </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((r) => {
                    const d = new Date(r.closedAt);
                    const ds = `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
                    return (
                      <tr key={r.id} className="border-b border-neutral-900">
                        <td className="py-2 pr-3">{ds}</td>
                        <td className="py-2 pr-3">{r.orderNo}</td>
                        <td className="py-2 pr-3">{r.tableId ?? "-"}</td>
                        <td className="py-2 pr-3">{r.payment ?? "-"}</td>
                        <td className="py-2 pr-3">{r.count}</td>
                        <td className="py-2 pr-3 text-right">{fmt(r.total)}</td>
                        <td className="py-2 pr-0 text-right">
                          <button className="btn btn-sm" onClick={() => openDetail(r.id)}>
                            Detay
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  <tr>
                    <td className="py-2 pr-3 font-medium" colSpan={5}>
                      Toplam
                    </td>
                    <td className="py-2 pr-3 text-right font-semibold">{fmt(totals.totalRevenue)}</td>
                    <td className="py-2 pr-0" />
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Detay Modal */}
        {detailModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setDetailModal(null)}>
            <div className="bg-neutral-900 p-5 rounded-xl max-w-2xl w-full shadow-lg" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-3">
                <div className="font-semibold text-lg">Adisyon #{detailModal.orderNo ?? detailModal.id}</div>
                <button className="btn btn-sm btn-ghost" onClick={() => setDetailModal(null)}>
                  ✕
                </button>
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
                      {detailModal.items.map((i, idx) => {
                        const name = i.productName ?? i.name ?? "Ürün";
                        const unit = Number(i.unitPrice) || 0;
                        const lineTotal = Number(i.total) || i.qty * unit;
                        return (
                          <tr key={idx} className="border-b border-neutral-900">
                            <td className="py-1">
                              <div>{name}</div>
                              {i.garnitures && <div className="text-xs text-zinc-500">{prettyGarn(i.garnitures)}</div>}
                              {i.note && <div className="text-xs text-zinc-500">Not: {i.note}</div>}
                            </td>
                            <td className="py-1 text-right">{i.qty}</td>
                            <td className="py-1 text-right">{unit.toFixed(2)}</td>
                            <td className="py-1 text-right">{lineTotal.toFixed(2)}</td>
                          </tr>
                        );
                      })}
                      <tr>
                        <td className="py-2 font-medium" colSpan={3}>
                          Genel Toplam
                        </td>
                        <td className="py-2 text-right font-semibold">{fmt(detailGrandTotal(detailModal))}</td>
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

  function PageStock() {
    return (
      <div className="mx-auto max-w-7xl p-4 space-y-4">
        <div className="title">Stok</div>
        <div className="card p-4">Stok giriş/çıkış ekranı burada olacak.</div>
      </div>
    );
  }

  // ---------------- Giderler Sayfası (SQL bağlı) ----------------
  function PageExpenses() {
    const today = ymdToday();
    const [date, setDate] = useState<string>(today);
    const [rows, setRows] = useState<UiExpense[]>([]);
    const [loadingList, setLoadingList] = useState(false);
    const lastReq = useRef<number>(0);
    // üst özetler
    const totalDay = useMemo(() => rows.reduce((s, x) => s + (Number(x.amount) || 0), 0), [rows]);
    const [sum7, setSum7] = useState(0);
    const [sum30, setSum30] = useState(0);

    async function fetchRangeSum(from: string, to: string) {
      try {
        const r = await api.get<ExpenseListItemDto[]>(ENDPOINTS.expenses, {
          params: { from, to, _: Date.now() }, // cache kırıcı
          headers: { "Cache-Control": "no-cache" }, // (opsiyonel)
        });
        const list = Array.isArray(r.data) ? r.data : [];
        return list.reduce((s, x) => s + Number(x.amount ?? 0), 0);
      } catch {
        return 0;
      }
    }

    async function loadDay(d: string) {
      setLoadingList(true);

      // Bu isteğe benzersiz bir id ver ve "en son istek" olarak işaretle
      const reqId = Date.now();
      lastReq.current = reqId;

      // Önce ekrandaki eski satırları temizleyelim ki yanlış gün görünmesin
      setRows([]);

      try {
        const r = await api.get<ExpenseListItemDto[]>(ENDPOINTS.expenses, {
          params: { from: d, to: d, _: reqId }, // cache kırıcı
          headers: { "Cache-Control": "no-cache" }, // (opsiyonel)
        });

        // Bu cevap hâlâ en son istek mi? Değilse YOK SAY.
        if (lastReq.current !== reqId) return;

        const list = (Array.isArray(r.data) ? r.data : []).map<UiExpense>((e) => ({
          id: e.id,
          date: d,
          title: e.title,
          amount: Number(e.amount) || 0,
          category: e.category ?? undefined,
          payment: e.payment ?? undefined,
          note: e.note ?? undefined,
          _isNew: false,
          _isDirty: false,
          _saving: false,
        }));
        setRows(list);

        // Son 7 / 30 gün özetleri
        const toD = new Date(d + "T00:00:00");
        const from7 = new Date(toD);
        from7.setDate(toD.getDate() - 6);
        const from30 = new Date(toD);
        from30.setDate(toD.getDate() - 29);

        const [s7, s30] = await Promise.all([fetchRangeSum(fmtDate(from7), d), fetchRangeSum(fmtDate(from30), d)]);

        // Kullanıcı bu arada tarihi değiştirdiyse bu sonuçları da uygulama
        if (lastReq.current !== reqId) return;

        setSum7(s7);
        setSum30(s30);
      } finally {
        // Yalnızca bu istek hâlâ en son istekse loading'i kapat
        if (lastReq.current === reqId) setLoadingList(false);
      }
    }

    // 🔧 Tek effect: ilk mount + tarih değişiminde yükle
    useEffect(() => {
      lastReq.current = 0;
      loadDay(date);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [date]);

    function addRow(pref?: Partial<UiExpense>) {
      setRows((s) => [
        ...s,
        {
          _tmpId: rid(),
          date,
          title: pref?.title ?? "",
          amount: Number(pref?.amount) || 0,
          category: pref?.category ?? "",
          payment: pref?.payment ?? "",
          note: pref?.note ?? "",
          _isNew: true,
          _isDirty: true,
        },
      ]);
    }
    function patchRow(key: { id?: number; _tmpId?: string }, patch: Partial<UiExpense>) {
      setRows((s) =>
        s.map((e) =>
          (e.id === key.id && key.id !== undefined) || (e._tmpId && e._tmpId === key._tmpId) ? { ...e, ...patch, _isDirty: true } : e
        )
      );
    }
    function removeRow(key: { id?: number; _tmpId?: string }) {
      setRows((s) =>
        s.filter((e) => {
          if (key.id !== undefined) return e.id !== key.id;
          if (key._tmpId) return e._tmpId !== key._tmpId;
          return true;
        })
      );
    }

    async function saveRow(e: UiExpense) {
      if (!e.title?.trim()) return alert("Başlık (Title) zorunlu.");
      if ((Number(e.amount) || 0) <= 0) return alert("Tutar 0’dan büyük olmalı.");

      patchRow(e, { _saving: true });
      try {
        // Boş alanları null yerine "" gönder (DB kolonları NOT NULL olabilir)
        const payload = {
          date: e.date, // "YYYY-MM-DD"
          title: e.title.trim(),
          amount: Number(e.amount),
          category: (e.category ?? "").trim(), // "" gönder
          payment: (e.payment ?? "").trim(), // "" gönder
          note: (e.note ?? "").trim(), // "" gönder
        };

        if (e._isNew || !e.id) {
          const r = await api.post<number>(ENDPOINTS.expenses, payload);
          const newId = Number((r as any).data ?? 0);
          setRows((s) =>
            s.map((x) => (x._tmpId && x._tmpId === e._tmpId ? { ...x, id: newId, _tmpId: undefined, _isNew: false, _isDirty: false, _saving: false } : x))
          );
        } else {
          await api.put(`${ENDPOINTS.expenses}/${e.id}`, payload);
          patchRow(e, { _isDirty: false, _saving: false });
        }
      } catch (err: any) {
        console.error(err);
        const msg = err?.response?.data ?? err?.response?.statusText ?? "Kayıt işlemi başarısız.";
        alert(msg);
        patchRow(e, { _saving: false });
      } finally {
        // Özetleri tazele
        const toD = new Date(date + "T00:00:00");
        const from7 = new Date(toD);
        from7.setDate(toD.getDate() - 6);
        const from30 = new Date(toD);
        from30.setDate(toD.getDate() - 29);

        const [s7, s30] = await Promise.all([fetchRangeSum(fmtDate(from7), date), fetchRangeSum(fmtDate(from30), date)]);
        setSum7(s7);
        setSum30(s30);

        // *** En önemlisi: DB'deki normalize değerleri yeniden getir ***
        await loadDay(date);
      }
    }

    async function deleteRow(e: UiExpense) {
      if (e._isNew || !e.id) {
        removeRow(e);
        return;
      }
      if (!confirm("Bu gider satırını silmek istiyor musunuz?")) return;
      try {
        await api.delete(`${ENDPOINTS.expenses}/${e.id}`);
        removeRow(e);
      } catch (err) {
        console.error(err);
        alert("Silme işlemi başarısız.");
      } finally {
        const toD = new Date(date + "T00:00:00");
        const from7 = new Date(toD);
        from7.setDate(toD.getDate() - 6);
        const from30 = new Date(toD);
        from30.setDate(toD.getDate() - 29);

        const [s7, s30] = await Promise.all([fetchRangeSum(fmtDate(from7), date), fetchRangeSum(fmtDate(from30), date)]);
        setSum7(s7);
        setSum30(s30);

        // *** Listeyi DB'den tekrar çek ***
        await loadDay(date);
      }
    }

    const quicks = [
      { label: "Et", data: { category: "Et", title: "Et (kg)" } },
      { label: "Ekmek/Lavaş", data: { category: "Ekmek/Lavaş", title: "Ekmek-Lavaş" } },
      { label: "İçecek", data: { category: "İçecek", title: "İçecek Alımları" } },
      { label: "Kira", data: { category: "Kira", title: "Kira" } },
      { label: "Personel", data: { category: "Personel", title: "Maaşlar (Toplam)" } },
      { label: "Elektrik/Su/Doğalgaz", data: { category: "Elektrik/Su/Doğalgaz", title: "Faturalar" } },
      { label: "Vergi & Sigorta", data: { category: "Vergi & Sigorta", title: "Bağ-Kur/SGK/Stopaj/KDV" } },
      { label: "Malzeme Sarf", data: { category: "Malzeme Sarf", title: "Sarf & Yan Ürünler" } },
      { label: "Bakım/Temizlik/Ekipman", data: { category: "Bakım/Temizlik/Ekipman", title: "Bakım & Temizlik" } },
    ];

    return (
      <div className="mx-auto max-w-7xl p-4 space-y-4">
        <div className="title">Giderler</div>

        {/* Üst özet */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="card p-4">
            <div className="muted">Günlük Toplam</div>
            <div className="text-2xl font-semibold">{fmt(totalDay)}</div>
          </div>
          <div className="card p-4">
            <div className="muted">Son 7 Gün</div>
            <div className="text-2xl font-semibold">{fmt(sum7)}</div>
          </div>
          <div className="card p-4">
            <div className="muted">Son 30 Gün</div>
            <div className="text-2xl font-semibold">{fmt(sum30)}</div>
          </div>
        </div>

        {/* Tarih + hızlı ekle */}
        <div className="card p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div>
              <div className="muted text-sm mb-1">Tarih</div>
              <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="grow" />
            <div>
              <div className="muted text-sm mb-1">Hızlı Ekle</div>
              <div className="flex flex-wrap gap-2">
                {quicks.map((q) => (
                  <button key={q.label} className="btn btn-sm" onClick={() => addRow(q.data)}>
                    + {q.label}
                  </button>
                ))}
                <button className="btn btn-sm btn-ghost" onClick={() => addRow()}>
                  + Boş Satır
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Günlük tablo */}
        <div className="card p-4 overflow-x-auto">
          <div className="font-medium mb-3">{date} gününe ait giderler</div>
          {loadingList ? (
            <div className="muted">Yükleniyor…</div>
          ) : (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-zinc-400 border-b border-neutral-800">
                  <th className="py-2 pr-3">Kategori</th>
                  <th className="py-2 pr-3">Başlık</th>
                  <th className="py-2 pr-3">Not</th>
                  <th className="py-2 pr-3">Ödeme</th>
                  <th className="py-2 pr-3 text-right">Tutar</th>
                  <th className="py-2 pr-0 text-right"> </th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td className="py-3 text-zinc-400" colSpan={6}>
                      Bu güne kayıt yok.
                    </td>
                  </tr>
                )}
                {rows.map((it) => (
                  <tr key={it.id ?? it._tmpId} className="border-b border-neutral-900">
                    <td className="py-2 pr-3">
                      <input
                        className="input"
                        value={it.category ?? ""}
                        onChange={(e) => patchRow(it, { category: e.target.value })}
                        placeholder="Kategori"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        className="input"
                        value={it.title}
                        onChange={(e) => patchRow(it, { title: e.target.value })}
                        placeholder="Başlık"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        className="input"
                        value={it.note ?? ""}
                        onChange={(e) => patchRow(it, { note: e.target.value })}
                        placeholder="Not"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        className="input"
                        value={it.payment ?? ""}
                        onChange={(e) => patchRow(it, { payment: e.target.value })}
                        placeholder="Ödeme (opsiyonel)"
                      />
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <input
                        className="input text-right"
                        type="number"
                        step="0.01"
                        value={String(it.amount)}
                        onChange={(e) => patchRow(it, { amount: Number(e.target.value) })}
                        placeholder="0"
                      />
                    </td>
                    <td className="py-2 pr-0 text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <button className="btn btn-sm" disabled={it._saving || !it._isDirty} onClick={() => saveRow(it)}>
                          {it._saving ? "Kaydediliyor…" : "Kaydet"}
                        </button>
                        <button className="btn btn-sm btn-danger" disabled={it._saving} onClick={() => deleteRow(it)}>
                          Sil
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {rows.length > 0 && (
                  <tr>
                    <td className="py-2 pr-3 font-medium" colSpan={4}>
                      Gün Toplam
                    </td>
                    <td className="py-2 pr-3 text-right font-semibold">{fmt(totalDay)}</td>
                    <td className="py-2 pr-0" />
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        <div className="muted text-xs">Not: Bu sayfa /Expenses API’si ile SQL’e yazar/okur. (POST/PUT/DELETE).</div>
      </div>
    );
  }

  function PageEOD() {
    return (
      <div className="mx-auto max-w-7xl p-4 space-y-4">
        <div className="title">Gün Kapanışı</div>
        <SummaryCards />
        <div className="card p-4">Kasa sayımı / kapanış çıktısı burada olacak.</div>
      </div>
    );
  }

  // ---------------- Render ----------------
  return (
    <div className="relative min-h-screen bg-black text-zinc-200 overflow-hidden">
      {/* Arka plan logosu — tam ortada, soluk görünüm */}
      <img
        src="/logo.png"
        alt="Logo"
        className="pointer-events-none select-none
                 absolute inset-0 m-auto
                 w-[900px] opacity-[0.04]
                 object-contain"
      />

      {/* İçerik */}
      <div className="relative z-10">
        <Topbar />

        {page === "DASHBOARD" && <PageDashboardPOS />}
        {page === "REPORTS" && <PageReports />}
        {page === "STOCK" && <PageStock />}
        {page === "EXPENSES" && <PageExpenses />}
        {page === "EOD" && <PageEOD />}
        {page === "ANALYTICS" && <AnalyticsPage />}

        {/* Modallar */}
        {modalProduct && (
          <GarnitureModal product={modalProduct} onClose={() => setModalProduct(null)} onConfirm={handleGarnitureConfirm} />
        )}
        {noteModal.show && noteModal.product && (
          <NoteModal product={noteModal.product} onClose={() => setNoteModal({ show: false, product: null })} onConfirm={(data) => handleNoteConfirm(data.note)} />
        )}
      </div>
    </div>
  );
}
