// src/api.ts
import axios, { AxiosError } from "axios";

/**
 * BASE URL stratejisi
 * - PROD (Vercel):   "/api"  -> vercel.json rewrites -> https://api.cakmak.widenox.com/api
 * - LOCAL (override): VITE_API_BASE (örn: http://localhost:5222/api)
 * - LOCAL (otomatik): hostname === "localhost" ise http://localhost:5222/api
 *
 * Not: Vercel’de ENV vermesen de "/api" çalışır; çünkü vercel.json rewrite ediyoruz.
 */
function resolveBase(): string {
  const envBase = (import.meta as any)?.env?.VITE_API_BASE?.trim?.();
  if (envBase) return envBase;

  if (typeof window !== "undefined" && window.location.hostname === "localhost") {
    // Lokal geliştirmede otomatik backend varsayılanı
    return "http://localhost:5222/api";
  }

  // Vercel/Prod default: rewrite edilen relativ path
  return "/api";
}

export const BASE_URL = resolveBase();

export const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: false,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

// ---- Basit hata normalleştirme (log + okunabilir mesaj) ----
api.interceptors.response.use(
  (res) => res,
  (err: AxiosError<any>) => {
    // Güvenli URL birleştirme
    const url = `${err.config?.baseURL ?? ""}${err.config?.url ?? ""}`;

    // Geliştirici logu
    // eslint-disable-next-line no-console
    console.error("[API ERROR]", {
      url,
      status: err.response?.status,
      data: err.response?.data,
      message: err.message,
    });

    // Kullanıcıya gösterilecek mesajı iyileştir
    const msg =
      (err.response?.data as any)?.message ||
      err.response?.statusText ||
      err.message ||
      "Beklenmeyen bir hata oluştu.";

    // Mevcut AxiosError'u aynı tipte geri fırlat (yeni Error oluşturma!)
    err.message = msg;
    return Promise.reject(err);
  }
);

   

// ----------------- TİPLER & FONKSİYONLAR -----------------

/* --- VAR OLANLAR --- */
export type DailyRow = {
  date: string;
  label: string;
  revenue: number;
  expense: number;
  net: number;
  orders: number;
  avgTicket: number;
};

export async function fetchDaily(from: string, to: string) {
  const { data } = await api.get<DailyRow[]>("/Analytics/daily", {
    params: { fromDate: from, toDate: to },
  });
  return data;
}

export type TopProduct = {
  productId: number;
  name: string;
  qty: number;
  revenue: number;
};

export async function fetchTopByDate(date: string, limit = 10) {
  const { data } = await api.get<TopProduct[]>("/Analytics/top-products-by-date", {
    params: { date, limit },
  });
  return data;
}

/* --- YENİ: Seçili güne giderler --- */
export type ExpenseItem = {
  id: number;
  date: string; // "YYYY-MM-DD" / ISO
  title: string;
  amount: number;
  category?: string | null;
  payment?: string | null;
  note?: string | null;
};

export async function fetchExpensesByDate(date: string) {
  const { data } = await api.get<ExpenseItem[]>("/Expenses", {
    params: { from: date, to: date },
  });
  return Array.isArray(data) ? data : [];
}

/* Opsiyonel: API sağlık kontrolü (debug) */
export async function ping() {
  try {
    const { status } = await api.get("/health"); // backend’de varsa
    return status === 200;
  } catch {
    return false;
  }
}
