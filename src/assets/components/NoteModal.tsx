import { useEffect, useRef, useState } from "react";
import type { Product } from "../../types";

type Props = {
  product: Product;
  onClose: () => void;
  onConfirm: (data: { note?: string }) => void;
};

export default function NoteModal({ product, onClose, onConfirm }: Props) {
  const [note, setNote] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  function submit() {
    onConfirm({ note: note.trim() || undefined });
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit();
    if (e.key === "Escape") onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">{product.name}</div>

        <label className="title mb-1 block">Not (opsiyonel)</label>
        <textarea
          ref={textareaRef}
          className="textarea"
          rows={4}
          placeholder="Örn: buzsuz, az tuzlu…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={onKey}
        />

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>İptal (Esc)</button>
          <button className="btn btn-primary" onClick={submit}>
            Ekle (Ctrl/⌘+Enter)
          </button>
        </div>
      </div>
    </div>
  );
}
