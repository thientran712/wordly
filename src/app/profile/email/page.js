"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bell, Loader2, Check, Plus, Trash2, Clock, Send, Globe } from "lucide-react";

const TIME_SLOTS = Array.from({ length: 96 }, (_, i) => {
  const h = Math.floor(i / 4);
  const m = (i % 4) * 15;
  const value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  return { value, label: value };
});

function normalizeTime(time) {
  if (!time) return "08:00";
  const parts = time.split(":");
  const h = Math.min(23, Math.max(0, parseInt(parts[0]) || 0));
  const m = Math.min(59, Math.max(0, parseInt(parts[1]) || 0));
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function TimeDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [inputVal, setInputVal] = useState(value);
  const ref = useRef(null);
  const listRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { setInputVal(value); }, [value]);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
      if (listRef.current) {
        const idx = TIME_SLOTS.findIndex(s => s.value === value);
        const item = listRef.current.children[idx];
        if (item) item.scrollIntoView({ block: "center" });
      }
    }
  }, [open, value]);

  const handleInputChange = (e) => {
    setInputVal(e.target.value);
  };

  const handleInputBlur = () => {
    const normalized = normalizeTime(inputVal);
    setInputVal(normalized);
    onChange(normalized);
  };

  const handleInputKeyDown = (e) => {
    if (e.key === "Enter") { e.target.blur(); setOpen(false); }
    if (e.key === "Escape") setOpen(false);
  };

  const filteredSlots = inputVal
    ? TIME_SLOTS.filter(s => s.value.startsWith(inputVal.replace("h", ":").replace("H", ":")))
    : TIME_SLOTS;

  return (
    <div ref={ref} style={{ position: "relative", flex: 1 }}>
      <div
        onClick={() => setOpen(true)}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "9px 14px", borderRadius: "12px", cursor: "text",
          background: "var(--input-bg)",
          border: `1.5px solid ${open ? "rgba(34,197,94,0.5)" : "var(--input-border)"}`,
          transition: "border-color 0.15s",
        }}
      >
        <span style={{ fontSize: 14, color: "var(--ink-soft)" }}>⏰</span>
        <input
          ref={inputRef}
          type="text"
          value={inputVal}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          onKeyDown={handleInputKeyDown}
          onFocus={() => setOpen(true)}
          placeholder="HH:MM"
          style={{
            flex: 1, border: "none", outline: "none", background: "transparent",
            fontWeight: 700, fontSize: "14px", color: "var(--ink)",
            width: "100%", minWidth: 0,
          }}
        />
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="var(--electric)" strokeWidth="2.5"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s", flexShrink: 0 }}
          onMouseDown={e => { e.preventDefault(); setOpen(o => !o); }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 100,
          background: "var(--card-bg)", borderRadius: "14px",
          border: "1.5px solid var(--green-subtle-border)",
          boxShadow: "0 16px 40px rgba(0,0,0,0.3)", overflow: "hidden",
        }}>
          <div ref={listRef} style={{ maxHeight: "200px", overflowY: "auto", padding: "6px" }}>
            {(filteredSlots.length > 0 ? filteredSlots : TIME_SLOTS).map(slot => {
              const isSel = slot.value === value;
              return (
                <button key={slot.value} type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => { onChange(slot.value); setInputVal(slot.value); setOpen(false); }}
                  style={{
                    width: "100%", textAlign: "left", padding: "7px 12px",
                    borderRadius: "10px", border: "none", cursor: "pointer",
                    fontWeight: isSel ? 700 : 500, fontSize: "13px",
                    background: isSel ? "var(--green-subtle)" : "transparent",
                    color: isSel ? "var(--electric)" : "var(--ink-soft)",
                  }}
                  onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = "var(--hover-bg)"; }}
                  onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = "transparent"; }}
                >
                  {isSel && <span style={{ marginRight: 6, color: "var(--electric)" }}>✓</span>}
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

export default function EmailSettingsPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);

  // Global prefs
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [frequency, setFrequency] = useState("daily");
  const [customDays, setCustomDays] = useState([1, 2, 3, 4, 5]);

  // Slots
  const [slots, setSlots] = useState([]);
  const [addingSlot, setAddingSlot] = useState(false);
  const [newSlotTime, setNewSlotTime] = useState("12:00");
  const [showAddForm, setShowAddForm] = useState(false);

  // Timezone + test email
  const [timezone, setTimezone] = useState("Asia/Ho_Chi_Minh");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  // Refs for cleanup
  const successTimerRef = useRef(null);
  const testTimerRef = useRef(null);
  const slotDebounceRef = useRef({});
  const pendingTimeRef = useRef({});

  useEffect(() => {
    const browserTz = (() => {
      try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return null; }
    })();

    Promise.all([
      fetch("/api/email-preferences").then(r => r.json()),
      fetch("/api/email-slots").then(r => r.json()),
      fetch("/api/profile").then(r => r.json()),
    ]).then(([prefData, slotData, profileData]) => {
      if (prefData.preferences) {
        const p = prefData.preferences;
        setEmailEnabled(p.enabled ?? false);
        setFrequency(p.frequency || "daily");
        setCustomDays(p.custom_days || [1, 2, 3, 4, 5]);
      }
      if (slotData.slots) {
        setSlots(slotData.slots.map(s => ({ ...s, send_time: normalizeTime(s.send_time) })));
      }

      // Timezone: prefer saved profile tz; if missing or differs from browser,
      // adopt browser tz and persist it so emails arrive at the right local time.
      const savedTz = profileData?.profile?.timezone;
      if (savedTz) {
        setTimezone(savedTz);
        if (browserTz && browserTz !== savedTz) {
          // Browser moved (travel / wrong default) — update silently
          setTimezone(browserTz);
          fetch("/api/profile", {
            method: "PUT", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ timezone: browserTz }),
          }).catch(() => {});
        }
      } else if (browserTz) {
        setTimezone(browserTz);
        fetch("/api/profile", {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ timezone: browserTz }),
        }).catch(() => {});
      }
    }).catch(e => console.error(e))
      .finally(() => setIsLoading(false));
  }, []);

  // Cleanup all pending timers on unmount + flush any unsaved slot-time edits.
  useEffect(() => {
    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      if (testTimerRef.current) clearTimeout(testTimerRef.current);
      Object.values(slotDebounceRef.current).forEach(t => t && clearTimeout(t));
      // Flush unsaved edits with keepalive so they survive navigation
      const pending = pendingTimeRef.current;
      Object.entries(pending).forEach(([slotId, time]) => {
        fetch("/api/email-slots", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: slotId, send_time: time }),
          keepalive: true,
        }).catch(() => {});
      });
    };
  }, []);

  const handleSavePrefs = async () => {
    flushPendingEdits(); // ensure any unsaved slot-time edits land first
    setIsSaving(true); setError(null); setSuccess(false);
    try {
      const res = await fetch("/api/email-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: emailEnabled, frequency, custom_days: customDays }),
      });
      if (res.ok) {
        setSuccess(true);
        successTimerRef.current = setTimeout(() => setSuccess(false), 3000);
      }
      else { const d = await res.json(); setError(d.error || "Failed to save"); }
    } catch (e) { setError(e.message); }
    finally { setIsSaving(false); }
  };

  const handleTestEmail = async () => {
    setTesting(true); setTestResult(null); setError(null);
    try {
      const res = await fetch("/api/email/test", { method: "POST" });
      const d = await res.json();
      if (res.ok) {
        setTestResult({ ok: true, text: `Đã gửi thử từ "${d.word}" → check inbox!` });
      } else {
        setTestResult({ ok: false, text: d.error || "Gửi thử thất bại" });
      }
      testTimerRef.current = setTimeout(() => setTestResult(null), 5000);
    } catch (e) {
      setTestResult({ ok: false, text: e.message });
    } finally {
      setTesting(false);
    }
  };

  const persistSlotTime = useCallback(async (slotId, newTime) => {
    try {
      await fetch("/api/email-slots", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: slotId, send_time: newTime }),
      });
      delete pendingTimeRef.current[slotId];
    } catch {
      // fire-and-forget; keepalive flush handles edge cases
    }
  }, []);

  const handleUpdateSlotTime = useCallback((slot, newTime) => {
    // Optimistic UI update immediately
    setSlots(prev => prev.map(s => s.id === slot.id ? { ...s, send_time: newTime } : s));
    pendingTimeRef.current[slot.id] = newTime;

    // Debounce API call — only fires 1.5s after user stops changing
    if (slotDebounceRef.current[slot.id]) clearTimeout(slotDebounceRef.current[slot.id]);
    slotDebounceRef.current[slot.id] = setTimeout(() => {
      persistSlotTime(slot.id, newTime);
    }, 1500);
  }, [persistSlotTime]);

  // Flush any pending slot-time edits immediately (e.g. before navigating away)
  const flushPendingEdits = useCallback(() => {
    const pending = pendingTimeRef.current;
    Object.entries(pending).forEach(([slotId, time]) => {
      if (slotDebounceRef.current[slotId]) clearTimeout(slotDebounceRef.current[slotId]);
      // Fire-and-forget; keepalive lets it complete even during navigation
      fetch("/api/email-slots", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: slotId, send_time: time }),
        keepalive: true,
      }).catch(() => {});
    });
    pendingTimeRef.current = {};
  }, []);

  const handleDeleteSlot = async (slotId) => {
    if (slots.length <= 1) { setError("Phải có ít nhất 1 slot"); return; }
    const res = await fetch(`/api/email-slots?id=${slotId}`, { method: "DELETE" });
    if (res.ok) setSlots(prev => prev.filter(s => s.id !== slotId));
    else { const d = await res.json(); setError(d.error); }
  };

  const handleAddSlot = async () => {
    if (slots.length >= 10) { setError("Tối đa 10 slots"); return; }
    setAddingSlot(true);
    try {
      const res = await fetch("/api/email-slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ send_time: newSlotTime }),
      });
      if (res.ok) {
        const { slot } = await res.json();
        setSlots(prev => [...prev, { ...slot, send_time: normalizeTime(slot.send_time) }]);
        setShowAddForm(false);
        setNewSlotTime("12:00");
      } else {
        const d = await res.json(); setError(d.error);
      }
    } finally {
      setAddingSlot(false);
    }
  };

  const toggleCustomDay = (day) => {
    setCustomDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  };

  const cardStyle = { background: "var(--card-bg)", border: "1px solid var(--card-border)", boxShadow: "0 4px 24px rgba(0,0,0,0.15)" };

  return (
    <>
      <div className="bg-blobs">
        <div className="blob blob-1" /><div className="blob blob-2" />
        <div className="blob blob-3" /><div className="blob blob-4" />
      </div>

      <main className="relative z-10 max-w-xl mx-auto px-4 sm:px-8 py-6 sm:py-8 pb-16">
        {error && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] w-[90vw] max-w-xl px-5 py-4 rounded-2xl shadow-xl text-sm font-semibold"
            style={{ background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.3)", color: "#F87171" }}>
            ⚠️ {error}
            <button type="button" onClick={() => setError(null)} className="ml-3 underline opacity-70">Dismiss</button>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <button onClick={() => { flushPendingEdits(); router.push("/"); }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full hover:-translate-y-0.5 transition-all"
            style={{ color: "var(--ink-soft)", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <ArrowLeft size={18} />
            <span className="font-semibold">Back</span>
          </button>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: "var(--ink)" }}>✉️ Email</h1>
          <div className="w-20" />
        </div>

        {/* Enable toggle card */}
        <div className="rounded-3xl p-5 sm:p-6 mb-4" style={cardStyle}>
          {isLoading ? (
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <div className="h-4 w-40 rounded animate-pulse" style={{ background: "var(--hover-bg)" }} />
                <div className="h-3 w-56 rounded animate-pulse" style={{ background: "var(--hover-bg)" }} />
              </div>
              <div className="h-6 w-12 rounded-full animate-pulse" style={{ background: "var(--hover-bg)" }} />
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-sm" style={{ color: "var(--ink)" }}>Nhận email hàng ngày</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--ink-soft)" }}>Nhận từ vựng từ journal & lịch sử dịch</p>
              </div>
              <button type="button" onClick={() => setEmailEnabled(prev => !prev)}
                className="relative w-12 h-6 rounded-full transition-all"
                style={{ background: emailEnabled ? "var(--electric)" : "var(--input-border)" }}>
                <span className="absolute top-0.5 w-5 h-5 rounded-full shadow transition-all"
                  style={{ left: emailEnabled ? "26px" : "2px", background: emailEnabled ? "#0A0A0A" : "rgba(255,255,255,0.5)" }} />
              </button>
            </div>
          )}
        </div>

        {emailEnabled && (
          <>
            {/* Time slots card */}
            <div className="rounded-3xl p-5 sm:p-6 mb-4" style={cardStyle}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Clock size={16} style={{ color: "var(--electric)" }} />
                  <h2 className="font-bold text-sm" style={{ color: "var(--ink)" }}>
                    Khung giờ nhận email
                  </h2>
                </div>
                <span className="text-xs font-semibold px-2 py-1 rounded-full"
                  style={{ background: "var(--green-subtle)", color: "var(--electric)", border: "1px solid var(--green-subtle-border)" }}>
                  {slots.length}/10 slots
                </span>
              </div>

              {/* Timezone hint — so user knows which clock send_time follows */}
              <div className="flex items-center gap-1.5 mb-3 text-[11px]" style={{ color: "var(--ink-soft)" }}>
                <Globe size={12} style={{ color: "var(--ink-ghost)" }} />
                <span>Giờ gửi theo múi giờ: <strong style={{ color: "var(--ink)" }}>{timezone}</strong></span>
              </div>



              <div className="space-y-2.5 mb-3">
                {slots.map((slot, i) => {
                  return (
                  <div key={slot.id} className="p-3 rounded-2xl"
                    style={{ background: "var(--hover-bg)", border: "1px solid var(--card-border)" }}>
                    <div className="flex items-center gap-2.5">
                      <span className="text-xs font-bold w-5 text-center flex-shrink-0" style={{ color: "var(--ink-ghost)" }}>
                        {i + 1}
                      </span>

                      <TimeDropdown
                        value={slot.send_time}
                        onChange={time => handleUpdateSlotTime(slot, time)}
                      />

                      {/* Delete */}
                      <button type="button"
                        onClick={() => handleDeleteSlot(slot.id)}
                        disabled={slots.length <= 1}
                        className="no-min-h w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 active:scale-90 transition-all disabled:opacity-30"
                        style={{ background: "rgba(248,113,113,0.1)", color: "#F87171" }}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  );
                })}
              </div>

              {/* Add slot */}
              {slots.length < 10 && (
                showAddForm ? (
                  <div className="flex items-center gap-2 p-3 rounded-2xl"
                    style={{ background: "var(--green-subtle)", border: "1px solid var(--green-subtle-border)" }}>
                    <TimeDropdown value={newSlotTime} onChange={setNewSlotTime} />
                    <button type="button" onClick={handleAddSlot} disabled={addingSlot}
                      className="no-min-h px-3 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 flex-shrink-0 active:scale-95 disabled:opacity-50"
                      style={{ background: "var(--electric)", color: "#0A0A0A" }}>
                      {addingSlot ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                      Thêm
                    </button>
                    <button type="button" onClick={() => setShowAddForm(false)}
                      className="no-min-h px-3 py-2 rounded-xl font-bold text-xs flex-shrink-0 active:scale-95"
                      style={{ background: "var(--hover-bg)", color: "var(--ink-soft)" }}>
                      Huỷ
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setShowAddForm(true)}
                    className="w-full py-2.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all"
                    style={{ background: "var(--hover-bg)", border: "1.5px dashed var(--input-border)", color: "var(--ink-soft)" }}>
                    <Plus size={14} />
                    Thêm khung giờ
                  </button>
                )
              )}
            </div>

            {/* Frequency card */}
            <div className="rounded-3xl p-5 sm:p-6 mb-4" style={cardStyle}>
              <h2 className="font-bold text-sm mb-3 flex items-center gap-2" style={{ color: "var(--ink)" }}>
                <Bell size={15} style={{ color: "var(--electric)" }} />
                Tần suất
              </h2>
              <div className="flex gap-2 flex-wrap mb-3">
                {[
                  { value: "daily",    label: "📅 Mỗi ngày" },
                  { value: "weekdays", label: "💼 Thứ 2–6" },
                  { value: "custom",   label: "⚙️ Tuỳ chỉnh" },
                ].map(f => (
                  <button type="button" key={f.value} onClick={() => setFrequency(f.value)}
                    className="px-4 py-2 rounded-xl font-semibold text-sm transition-all active:scale-95"
                    style={{
                      background: frequency === f.value ? "var(--electric)" : "var(--hover-bg)",
                      border: frequency === f.value ? "none" : "1.5px solid var(--input-border)",
                      color: frequency === f.value ? "#0A0A0A" : "var(--ink-soft)",
                      boxShadow: frequency === f.value ? "0 4px 12px rgba(34,197,94,0.25)" : "none",
                    }}>
                    {f.label}
                  </button>
                ))}
              </div>

              {frequency === "custom" && (
                <div className="flex gap-2 flex-wrap">
                  {["CN", "T2", "T3", "T4", "T5", "T6", "T7"].map((day, i) => (
                    <button type="button" key={i} onClick={() => toggleCustomDay(i)}
                      className="w-10 h-10 rounded-xl font-bold text-xs active:scale-95 transition-all"
                      style={{
                        background: customDays.includes(i) ? "var(--electric)" : "var(--hover-bg)",
                        border: customDays.includes(i) ? "none" : "1.5px solid var(--input-border)",
                        color: customDays.includes(i) ? "#0A0A0A" : "var(--ink-soft)",
                        boxShadow: customDays.includes(i) ? "0 4px 12px rgba(34,197,94,0.25)" : "none",
                      }}>
                      {day}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Test email card */}
            <div className="rounded-3xl p-5 sm:p-6 mb-4" style={cardStyle}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-bold text-sm" style={{ color: "var(--ink)" }}>Gửi thử ngay</p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--ink-soft)" }}>Xem trước email từ vựng trong inbox của bạn</p>
                </div>
                <button type="button" onClick={handleTestEmail} disabled={testing}
                  className="no-min-h px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 flex-shrink-0 active:scale-95 transition-all disabled:opacity-50"
                  style={{ background: "var(--green-subtle)", color: "var(--electric)", border: "1px solid var(--green-subtle-border)" }}>
                  {testing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  Gửi thử
                </button>
              </div>
              {testResult && (
                <p className="text-xs font-semibold mt-3"
                  style={{ color: testResult.ok ? "var(--electric)" : "#F87171" }}>
                  {testResult.ok ? "✓ " : "⚠️ "}{testResult.text}
                </p>
              )}
            </div>
          </>
        )}

        {/* Save */}
        <button type="button" onClick={handleSavePrefs} disabled={isSaving || isLoading}
          className="w-full py-4 rounded-2xl font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2 hover:-translate-y-0.5 transition-all"
          style={{
            background: success ? "rgba(34,197,94,0.15)" : "var(--electric)",
            color: success ? "var(--electric)" : "#0A0A0A",
            border: success ? "1.5px solid rgba(34,197,94,0.4)" : "none",
            boxShadow: success ? "none" : "0 8px 24px rgba(34,197,94,0.3)",
          }}>
          {isSaving ? <><Loader2 size={18} className="animate-spin" /> Đang lưu...</> :
           success ? <><Check size={18} /> Đã lưu!</> :
           <><Bell size={18} /> Lưu cài đặt</>}
        </button>
      </main>
    </>
  );
}
