// src/store.ts
import { create } from "zustand";
import type { Product } from "./types";

type CartItem = {
  productId: number;
  name: string;
  price: number;
  qty: number;
  garnitures?: string; // örn: "Soğan, Domates"
  note?: string;       // örn: "Acısız"
};

type Extra = { garnitures?: string; note?: string };

type CartState = {
  items: CartItem[];

  // Product tipini doğrudan kullanıyoruz
  add: (p: Product, extra?: Extra) => void;

  // Basit artır/azalt: productId’yi baz alır
  inc: (id: number) => void;
  dec: (id: number) => void;

  clear: () => void;

  // Toplamı hesaplar
  total: () => number;
};

export const useCart = create<CartState>((set, get) => ({
  items: [],

  add: (p, extra) =>
    set((state) => {
      const price = p.prices?.[0]?.value ?? 0;

      // Aynı ürün + aynı garnitür/not varsa birleştir
      const key = (x: CartItem) =>
        `${x.productId}|${x.garnitures ?? ""}|${x.note ?? ""}`;
      const tmpItem: CartItem = {
        productId: p.id,
        name: p.name,
        price,
        qty: 1,
        garnitures: extra?.garnitures,
        note: extra?.note,
      };

      const exist = state.items.find((x) => key(x) === key(tmpItem));
      if (exist) {
        exist.qty += 1;
        return { ...state };
      }

      return { ...state, items: [...state.items, tmpItem] };
    }),

  inc: (id) =>
    set((state) => {
      const it = state.items.find((x) => x.productId === id);
      if (it) it.qty += 1;
      return { ...state };
    }),

  dec: (id) =>
    set((state) => {
      const it = state.items.find((x) => x.productId === id);
      if (!it) return state;
      it.qty -= 1;
      const items =
        it.qty <= 0 ? state.items.filter((x) => x !== it) : state.items;
      return { ...state, items };
    }),

  clear: () => set({ items: [] }),

  total: () => get().items.reduce((sum, i) => sum + i.qty * i.price, 0),
}));
