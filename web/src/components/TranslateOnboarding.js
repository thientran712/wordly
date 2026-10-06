"use client";

import { useState, useEffect } from "react";
import { Languages, BookmarkCheck, Sparkles, Search } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";

const STORAGE_KEY = "wordly-seen-translate-onboarding";

const STEPS = [
  {
    icon: BookmarkCheck,
    title: "Lưu",
    desc: "Lưu từ để được nhắc ôn tập qua email theo lịch trình học của bạn.",
  },
  {
    icon: Sparkles,
    title: "Hỏi AI",
    desc: "Hỏi AI để trò chuyện và luyện dùng từ đó trong ngữ cảnh thực tế cùng Alex.",
  },
  {
    icon: Search,
    title: "Xem nghĩa chi tiết",
    desc: "Bấm vào gợi ý khớp chính xác trong danh sách gợi ý để xem đầy đủ loại từ, phiên âm US/UK, và nhiều nghĩa hơn của từ.",
  },
];

export default function TranslateOnboarding() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setOpen(true);
    } catch { /* localStorage unavailable — skip onboarding */ }
  }, []);

  const close = () => {
    try { localStorage.setItem(STORAGE_KEY, "1"); } catch { /* ignore */ }
    setOpen(false);
  };

  if (!open) return null;

  return (
    <Modal onClose={close} maxWidth="26rem">
      <div className="text-center mb-5">
        <div
          className="w-12 h-12 mx-auto mb-3 rounded-2xl flex items-center justify-center"
          style={{ background: "var(--green-subtle)", border: "1px solid var(--green-subtle-border)" }}
        >
          <Languages size={22} style={{ color: "var(--electric)" }} />
        </div>
        <h2 className="text-lg font-bold" style={{ color: "var(--ink)" }}>
          Chào mừng đến với Wordly!
        </h2>
        <p className="text-sm mt-1" style={{ color: "var(--ink-soft)" }}>
          Vài mẹo nhỏ để học từ vựng hiệu quả hơn
        </p>
      </div>

      <div className="flex flex-col gap-3.5">
        {STEPS.map(({ icon: Icon, title, desc }) => (
          <div key={title} className="flex items-start gap-3">
            <div
              className="w-9 h-9 flex-shrink-0 rounded-xl flex items-center justify-center"
              style={{ background: "var(--hover-bg)", border: "1px solid var(--card-border)" }}
            >
              <Icon size={16} style={{ color: "var(--electric)" }} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold" style={{ color: "var(--ink)" }}>{title}</p>
              <p className="text-xs leading-relaxed mt-0.5" style={{ color: "var(--ink-soft)" }}>{desc}</p>
            </div>
          </div>
        ))}
      </div>

      <Button variant="primary" fullWidth className="mt-6" onClick={close}>
        Đã hiểu
      </Button>
    </Modal>
  );
}
