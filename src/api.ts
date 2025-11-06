// src/api.ts
import axios from "axios";

/**
 * BASE URL stratejisi:
 * - PROD (Vercel):    "/api"   --> vercel.json rewrites -> https://api.cakmak.widenox.com
 * - LOCAL (opsiyon):  import.meta.env.VITE_API_BASE varsa onu kullan (örn: http://localhost:5222/api)
 *
 * Not: VITE_API_BASE vermediğinde localde de "/api" çalışır; ama backend'i direkt localhost'tan
 * çağırmak istersen .env.local ile override etmen yeterli.
 */
const BASE =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_BASE) ||
  "/api";

export const api = axios.create({
  baseURL: BASE,
  withCredentials: false,
  timeout: 10000,
});

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
  date: string;        // "YYYY-MM-DD" / ISO
  title: string;
  amount: number;
  category?: string | null;
  payment?: string | null;
  note?: string | null;
};

export async function fetchExpensesByDate(date: string) {
  // Backend /Expenses endpoint’in zaten var: tek gün için from=to=date
  const { data } = await api.get<ExpenseItem[]>("/Expenses", {
    params: { from: date, to: date },
  });
  return Array.isArray(data) ? data : [];
}