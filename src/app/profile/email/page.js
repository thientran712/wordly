"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bell, Loader2, Check } from "lucide-react";

const TIME_SLOTS = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2);
  const m = i % 2 === 0 ? "00" : "30";
  const value = `${String(h).padStart(2, "0")}:${m}`;
  const period = h < 12 ? "SA" : "CH";
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return { value, label: `${displayH}:${m} ${period}` };
});

function TimeDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const listRef = useRef(null);
  const selected = TIME_SLOTS.find(s => s.value === value) || TIME_SLOTS[0];

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (open && listRef.current) {
      const idx = TIME_SLOTS.findIndex(s => s.value === value);
      const item = listRef.current.children[idx];
      if (item) item.scrollIntoView({ block: "center" });
    }
  }, [open, value]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 16px", borderRadius: "14px", cursor: "pointer",
          fontWeight: 700, fontSize: "15px",
          background: "var(--input-bg)",
          border: `1.5px solid ${open ? "rgba(34,197,94,0.5)" : "var(--input-border)"}`,
          color: "var(--ink)",
          transition: "border-color 0.15s",
        }}
      >
        <span>🕐 {selected.label}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="var(--electric)" strokeWidth="2.5"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 50,
          background: "var(--card-bg)", borderRadius: "14px",
          border: "1.5px solid var(--green-subtle-border)",
          boxShadow: "0 16px 40px rgba(0,0,0,0.3)",
          overflow: "hidden",
        }}>
          <div ref={listRef} style={{ maxHeight: "220px", overflowY: "auto", padding: "6px" }}>
            {TIME_SLOTS.map(slot => {
              const isSel = slot.value === value;
              return (
                <button
                  key={slot.value} type="button"
                  onClick={() => { onChange(slot.value); setOpen(false); }}
                  style={{
                    width: "100%", textAlign: "left", padding: "8px 14px",
                    borderRadius: "10px", border: "none", cursor: "pointer",
                    fontWeight: isSel ? 700 : 500, fontSize: "14px",
                    background: isSel ? "var(--green-subtle)" : "transparent",
                    color: isSel ? "var(--electric)" : "var(--ink-soft)",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
                  onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = "transparent"; }}
                >
                  {isSel && <span style={{ marginRight: 8, color: "var(--electric)" }}>✓</span>}
                  {slot.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function snapToHalfHour(time) {
  const [h, m] = time.split(":").map(Number);
  const snapped = m < 15 ? 0 : m < 45 ? 30 : 0;
  const snappedH = m >= 45 ? (h + 1) % 24 : h;
  return `${String(snappedH).padStart(2, "0")}:${snapped === 0 ? "00" : "30"}`;
}

export default function EmailSettingsPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [sendTime, setSendTime] = useState("08:00");
  const [frequency, setFrequency] = useState("daily");
  const [customDays, setCustomDays] = useState([1, 2, 3, 4, 5]);

  useEffect(() => {
    fetch("/api/email-preferences")
      .then(r => r.json())
      .then(data => {
        if (data.preferences) {
          const p = data.preferences;
          setEmailEnabled(p.enabled ?? false);
          setSendTime(snapToHalfHour(p.send_time || "08:00"));
          setFrequency(p.frequency || "daily");
          setCustomDays(p.custom_days || [1, 2, 3, 4, 5]);
        }
      })
      .catch(e => console.error(e))
      .finally(() => setIsLoading(false));
  }, []);

  const handleSave = async () => {
    setIsSaving(true); setError(null); setSuccess(false);
    try {
      const res = await fetch("/api/email-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: emailEnabled, send_time: sendTime, frequency, custom_days: customDays }),
      });
      if (res.ok) { setSuccess(true); setTimeout(() => setSuccess(false), 3000); }
      else { const d = await res.json(); setError(d.error || "Failed to save"); }
    } catch (e) { setError(e.message); }
    finally { setIsSaving(false); }
  };

  const toggleCustomDay = (day) => {
    setCustomDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  };

  if (isLoading) {
    return (
      <>
        <div className="bg-blobs"><div className="blob blob-1"></div><div className="blob blob-2"></div></div>
        <main className="relative z-10 min-h-screen flex items-center justify-center">
          <div className="text-center">
            <div className="text-6xl mb-4">✉️</div>
            <p className="text-xl font-semibold" style={{ color: "var(--electric)" }}>Loading settings...</p>
          </div>
        </main>
      </>
    );
  }

  const cardStyle = { background: "var(--card-bg)", border: "1px solid var(--card-border)", boxShadow: "0 4px 24px rgba(0,0,0,0.15)" };

  return (
    <>
      <div className="bg-blobs">
        <div className="blob blob-1"></div><div className="blob blob-2"></div>
        <div className="blob blob-3"></div><div className="blob blob-4"></div>
      </div>

      <main className="relative z-10 max-w-xl mx-auto px-4 sm:px-8 py-6 sm:py-8 pb-16">
        {error && (
          <div
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] w-[90vw] max-w-xl px-5 py-4 rounded-2xl shadow-xl text-sm font-semibold"
            style={{ background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.3)", color: "#F87171" }}
          >
            ⚠️ {error}
            <button type="button" onClick={() => setError(null)} className="ml-3 underline opacity-70">Dismiss</button>
          </div>
        )}

        {/* Page header */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={() => router.push("/profile")}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full hover:-translate-y-0.5 transition-all"
            style={{ color: "var(--ink-soft)", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <ArrowLeft size={18} />
            <span className="font-semibold">Back</span>
          </button>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: "var(--ink)" }}>✉️ Email</h1>
          <div className="w-20" />
        </div>

        {/* Settings card */}
        <div className="rounded-3xl p-6 sm:p-8 mb-6" style={cardStyle}>
          <h2 className="font-serif text-xl font-bold mb-5 flex items-center gap-2" style={{ color: "var(--ink)" }}>
            <Bell size={20} style={{ color: "var(--electric)" }} />
            Email Notifications
          </h2>

          {/* Toggle */}
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="font-bold text-sm" style={{ color: "var(--ink)" }}>Daily word email</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--ink-soft)" }}>Nhận 1 từ vựng mỗi ngày qua email</p>
            </div>
            <button
              type="button"
              onClick={() => setEmailEnabled(prev => !prev)}
              className="relative w-12 h-6 rounded-full transition-all"
              style={{ background: emailEnabled ? "var(--electric)" : "var(--input-border)" }}
            >
              <span
                className="absolute top-0.5 w-5 h-5 rounded-full shadow transition-all"
                style={{
                  left: emailEnabled ? "26px" : "2px",
                  background: emailEnabled ? "#0A0A0A" : "rgba(255,255,255,0.5)",
                }}
              />
            </button>
          </div>

          {emailEnabled && (
            <div className="space-y-5 pt-5" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              {/* Send time */}
              <div>
                <label className="font-bold text-sm mb-2 block" style={{ color: "var(--ink)" }}>Giờ nhận email</label>
                <TimeDropdown value={sendTime} onChange={setSendTime} />
              </div>

              {/* Frequency */}
              <div>
                <label className="font-bold text-sm mb-2 block" style={{ color: "var(--ink)" }}>Tần suất</label>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { value: "daily",    label: "📅 Mỗi ngày" },
                    { value: "weekdays", label: "💼 Thứ 2–6" },
                    { value: "custom",   label: "⚙️ Tuỳ chỉnh" },
                  ].map(f => (
                    <button
                      type="button" key={f.value}
                      onClick={() => setFrequency(f.value)}
                      className="px-4 py-2 rounded-xl font-semibold text-sm hover:-translate-y-0.5 transition-all"
                      style={{
                        background: frequency === f.value ? "var(--electric)" : "var(--hover-bg)",
                        border: frequency === f.value ? "none" : "1.5px solid var(--input-border)",
                        color: frequency === f.value ? "#0A0A0A" : "var(--ink-soft)",
                        boxShadow: frequency === f.value ? "0 4px 12px rgba(34,197,94,0.25)" : "none",
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom days */}
              {frequency === "custom" && (
                <div>
                  <label className="font-bold text-sm mb-2 block" style={{ color: "var(--ink)" }}>Chọn ngày</label>
                  <div className="flex gap-2 flex-wrap">
                    {["CN", "T2", "T3", "T4", "T5", "T6", "T7"].map((day, i) => (
                      <button
                        type="button" key={i}
                        onClick={() => toggleCustomDay(i)}
                        className="w-10 h-10 rounded-xl font-bold text-xs hover:-translate-y-0.5 transition-all"
                        style={{
                          background: customDays.includes(i) ? "var(--electric)" : "var(--hover-bg)",
                          border: customDays.includes(i) ? "none" : "1.5px solid var(--input-border)",
                          color: customDays.includes(i) ? "#0A0A0A" : "var(--ink-soft)",
                          boxShadow: customDays.includes(i) ? "0 4px 12px rgba(34,197,94,0.25)" : "none",
                        }}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Save button */}
        <button
          type="button" onClick={handleSave} disabled={isSaving}
          className="w-full py-4 rounded-2xl font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2 hover:-translate-y-0.5 transition-all"
          style={{
            background: success ? "rgba(34,197,94,0.15)" : "var(--electric)",
            color: success ? "var(--electric)" : "#0A0A0A",
            border: success ? "1.5px solid rgba(34,197,94,0.4)" : "none",
            boxShadow: success ? "none" : "0 8px 24px rgba(34,197,94,0.3)",
          }}
        >
          {isSaving ? <><Loader2 size={18} className="animate-spin" /> Đang lưu...</> :
           success ? <><Check size={18} /> Đã lưu!</> :
           <><Bell size={18} /> Lưu cài đặt email</>}
        </button>
      </main>
    </>
  );
}
