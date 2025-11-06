import { useEffect, useMemo, useState } from "react";
import type { Product } from "../../types";

type Props = {
  product: Product;
  onClose: () => void;
  onConfirm: (data: { garnitures?: string; note?: string }) => void;
};

// Varsayılan (sandviç tarzı) çıkarılacaklar
const DEFAULT_REMOVALS = [
  "Soğan",
  "Domates",
  "Marul",
  "Turşu",
  "Biber",
  "Ketçap",
  "Mayonez",
];

// Ürün bazlı presetler
const PRESET_MAP: Record<string, string[]> = {
  // Döner ve tüm döner menüleri aynı garnitürü kullanır
  "DÖNER": ["Soğan", "Domates", "Marul", "Turşu", "Biber", "Ketçap", "Mayonez"],

  // Köfte / Sucuk / Satır: tipik sandviç çıkarılacaklar
  "KÖFTE": ["Soğan", "Domates", "Marul", "Turşu", "Ketçap", "Mayonez"],
  "SUCUK": ["Domates", "Turşu", "Ketçap", "Mayonez"],
  "SATIR": ["Soğan", "Domates", "Marul", "Turşu", "Ketçap", "Mayonez"],

  // Tost için özel: kaşar-sucuk-çeşniler
  "TOST": ["Kaşar", "Sucuk", "Ketçap", "Mayonez"],

  // Tabak/sulu yemekler: burada modal açmıyoruz ama yine de boş bırakıyoruz
  "KURU": [],
  "NOHUT": [],
  "PİLAV": [],
  "ÇORBA": [],
  "CİĞER": [],
  "KARNIYARIK": [],
  "ET YEMEĞİ": [],
  "TATLI": [],
  "PATATES": [],
};

// Ürün adından anahtar türet (Yarım/Tam ve menü içeceklerini at)
function normalizeKey(name: string) {
  let n = (name || "")
    .replace(/\((Yarım|Tam)\)\s*$/i, "")   // sonda (Yarım)/(Tam)
    .replace(/\s*\+\s*Ayran/i, "")         // "+ Ayran"
    .replace(/\s*\+\s*Kola/i, "")          // "+ Kola"
    .trim()
    .toUpperCase();

  // İçerikte geçen ana kelimelere indir
  if (/DÖNER/.test(n)) n = "DÖNER";
  else if (/KÖFTE/.test(n)) n = "KÖFTE";
  else if (/SUCUK/.test(n)) n = "SUCUK";
  else if (/SATIR/.test(n)) n = "SATIR";
  else if (/TOST/.test(n)) n = "TOST";
  else if (/KURU/.test(n)) n = "KURU";
  else if (/NOHUT/.test(n)) n = "NOHUT";
  else if (/PİLAV/.test(n)) n = "PİLAV";
  else if (/ÇORBA/.test(n)) n = "ÇORBA";
  else if (/CİĞER/.test(n)) n = "CİĞER";
  else if (/KARNIYARIK/.test(n)) n = "KARNIYARIK";
  else if (/ET YEMEĞİ/.test(n)) n = "ET YEMEĞİ";
  else if (/TATLI/.test(n)) n = "TATLI";
  else if (/PATATES/.test(n)) n = "PATATES";

  return n;
}

export default function GarnitureModal({ product, onClose, onConfirm }: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState("");

  // Ürün adına göre opsiyonları belirle
  const options = useMemo(() => {
    const key = normalizeKey(product?.name ?? "");
    const preset = PRESET_MAP[key];
    // Tanımlı değilse sandviç default’una düş (ör. yeni eklenen sandviç ürünleri)
    return Array.isArray(preset) ? preset : DEFAULT_REMOVALS;
  }, [product?.name]);

  function toggle(item: string) {
    setSelected((prev) =>
      prev.includes(item) ? prev.filter((x) => x !== item) : [...prev, item]
    );
  }

  function submit() {
    const g = selected.length ? `Çıkarılacaklar: ${selected.join(", ")}` : undefined;
    onConfirm({ garnitures: g, note: note || undefined });
  }

  // ⌨️ Kısayollar: Esc = iptal, Ctrl/⌘+Enter = ekle
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        submit();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, selected, note]); // submit bağımlılıkları

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <div className="modal-title">
          {product.name}
        </div>

        {/* Çıkarılacaklar */}
        <div className="mb-3">
          <div className="title mb-2">Çıkarılacaklar</div>
          {options.length === 0 ? (
            <div className="muted text-sm">Bu ürün için çıkarılacak seçenek bulunmuyor.</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {options.map((opt) => {
                const active = selected.includes(opt);
                return (
                  <button
                    type="button"
                    key={opt}
                    onClick={() => toggle(opt)}
                    className={`btn btn-sm ${active ? "btn-primary" : "btn-ghost"}`}
                    title={active ? "Kaldır" : "Ekle"}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Not */}
        <div>
          <div className="title mb-2">Not (opsiyonel)</div>
          <textarea
            className="textarea"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Örn: az yağlı, iyi pişsin…"
            autoFocus
          />
          <div className="mt-1 text-[11px] text-zinc-400">
            Kısayollar: <span className="kbd">Esc</span> iptal,{" "}
            <span className="kbd">Ctrl</span>/<span className="kbd">⌘</span>+
            <span className="kbd">Enter</span> ekle
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            İptal (Esc)
          </button>
          <button type="button" className="btn btn-primary" onClick={submit}>
            Ekle (Ctrl/⌘+Enter)
          </button>
        </div>
      </div>
    </div>
  );
}
