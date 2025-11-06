// Kategori
export type Category = {
  id: number;
  name: string;
};

// Fiyat
export type Price = {
  id: number;
  productId?: number;
  value: number;
  // Backend bazen başlangıç zamanı döndürebilir; opsiyonel
  startsAt?: string; // ISO: YYYY-MM-DDTHH:mm:ss
};

// Ürün
export type Product = {
  id: number;
  name: string;
  unit?: string;
  isComposite?: boolean;
  categoryId?: number;
  category?: Category | null; // p.category?.name için güvenli
  prices?: Price[];
};

// Sipariş item DTO
export type OrderItemDto = {
  productId: number;
  qty: number;
  unitPrice: number;
  // Garnitür mantığı: “Çıkarılacaklar: Soğan, Domates” gibi tek string
  garnitures?: string | null;
  note?: string | null;
};

// Sipariş DTO
export type OrderDto = {
  payment: "Nakit" | "Kart";
  items: OrderItemDto[];
  tableId?: number | null;
  note?: string | null;
};

// Masa
export type Table = {
  id: number;
  name: string;
  isActive: boolean;
};

// Açık sipariş özet
export type OpenOrderInfo = {
  id: number;
  tableId: number;
  orderNo: string;
  total: number;
  count: number;
};


// ... (mevcut diğer tipler)

export type Expense = {
  id: number;
  date: string;        // ISO string
  title: string;
  amount: number;
  category: string | null;
  payment: string | null;
  note: string | null;
};


// Payment breakdown (opsiyonel)
export type PaymentBreakdown = { cash: number; card: number; credit: number };

// Dashboard summary genişletilmiş: mevcut alanları koruyoruz
export type Summary = {
  from: string;
  to: string;
  revenue: number;
  expense: number;
  net: number;
  breakdown?: PaymentBreakdown; // backend gönderiyorsa gelir
};
// Kapanmış adisyon satırı (raporlar için)
export type ClosedOrder = {
  id: number;
  orderNo: string;
  tableId: number | null;
  payment: "Nakit" | "Kart" | "Veresiye" | null;
  closedAt: string; // ISO
  total: number;
  count: number;
};

