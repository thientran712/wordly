"use client";

import { useState, useEffect } from "react";
import { X, Mail, User, Clock, Calendar, Target, Lightbulb, Send } from "lucide-react";

export default function SettingsModal({ isOpen, onClose, settings, onSave }) {
  const [form, setForm] = useState(settings);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    setForm(settings);
    setTestResult(null);
  }, [settings, isOpen]);

  if (!isOpen) return null;

  const updateField = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const toggleDay = (day) => {
    setForm(prev => ({
      ...prev,
      customDays: prev.customDays.includes(day)
        ? prev.customDays.filter(d => d !== day)
        : [...prev.customDays, day]
    }));
  };

  const handleSave = () => {
    onSave({ ...form, enabled: true });
  };

  const handleSendTest = async () => {
    setIsSendingTest(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/email/test", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setTestResult({ type: "success", msg: data.message });
      } else {
        setTestResult({ type: "error", msg: data.error || "Lỗi không xác định" });
      }
    } catch (e) {
      setTestResult({ type: "error", msg: e.message });
    } finally {
      setIsSendingTest(false);
    }
  };

  const days = [
    { day: 1, label: 'T2' }, { day: 2, label: 'T3' }, { day: 3, label: 'T4' },
    { day: 4, label: 'T5' }, { day: 5, label: 'T6' }, { day: 6, label: 'T7' },
    { day: 0, label: 'CN' }
  ];

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center p-5 animate-fade-in"
      style={{ background: 'rgba(45, 27, 78, 0.4)', backdropFilter: 'blur(12px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div 
        className="bg-white max-w-[540px] w-full max-h-[90vh] overflow-y-auto rounded-[32px] p-6 sm:p-10 relative animate-slide-up"
        style={{ boxShadow: '0 20px 48px rgba(45, 27, 78, 0.12)' }}
      >
        <button onClick={onClose}
          className="absolute top-5 right-5 w-10 h-10 rounded-xl border-2 border-[--line] bg-white cursor-pointer flex items-center justify-center text-[--ink-soft] transition-all hover:bg-[--pink] hover:border-[--hot-pink] hover:text-[--hot-pink] hover:rotate-90">
          <X size={18} />
        </button>

        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-3 rounded-3xl flex items-center justify-center text-3xl text-white shadow-[0_12px_32px_rgba(255,92,138,0.18)]"
            style={{ background: 'linear-gradient(135deg, #6C5CE7, #FF5C8A)', transform: 'rotate(-5deg)' }}>
            ✉️
          </div>
          <h2 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight">Cài đặt Email</h2>
          <p className="text-sm text-[--ink-soft] mt-1">Nhận từ vựng mới mỗi ngày qua email</p>
        </div>

        <div className="space-y-5">
          <FormField label="Giờ nhận email" icon={<Clock size={14} />}>
            <input type="time" value={form.time} onChange={e => updateField('time', e.target.value)}
              className="w-full px-4 py-3.5 bg-[--whisper] border-2 border-[--line] rounded-2xl text-[--ink] focus:outline-none focus:border-[--electric] focus:bg-white focus:ring-4 focus:ring-purple-100 transition-all" />
          </FormField>

          <FormField label="Tần suất" icon={<Calendar size={14} />}>
            <div className="grid grid-cols-3 gap-2">
              {[
                { val: 'daily', label: 'Hàng ngày' },
                { val: 'weekdays', label: 'T2 – T6' },
                { val: 'custom', label: 'Tùy chỉnh' }
              ].map(opt => (
                <button key={opt.val} onClick={() => updateField('frequency', opt.val)}
                  className={`px-3 py-3 rounded-xl border-2 font-semibold text-xs sm:text-sm cursor-pointer transition-all ${
                    form.frequency === opt.val ? 'text-white border-transparent shadow-[0_12px_32px_rgba(255,92,138,0.18)]' 
                    : 'bg-[--whisper] border-[--line] text-[--ink-soft] hover:border-[--electric] hover:text-[--electric]'
                  }`}
                  style={form.frequency === opt.val ? { background: 'linear-gradient(135deg, #6C5CE7, #FF5C8A)' } : {}}>
                  {opt.label}
                </button>
              ))}
            </div>
          </FormField>

          {form.frequency === 'custom' && (
            <FormField label="Chọn ngày trong tuần" icon="🗓️">
              <div className="grid grid-cols-7 gap-1.5">
                {days.map(d => (
                  <button key={d.day} onClick={() => toggleDay(d.day)}
                    className={`py-3 rounded-xl border-2 font-semibold text-xs cursor-pointer transition-all ${
                      form.customDays.includes(d.day) ? 'bg-[--mint] text-[--grass] border-[--grass] -translate-y-0.5'
                      : 'bg-[--whisper] border-[--line] text-[--ink-soft]'
                    }`}>
                    {d.label}
                  </button>
                ))}
              </div>
            </FormField>
          )}

          {/* Test Email Button */}
          <div className="pt-2 pb-2">
            <button
              onClick={handleSendTest}
              disabled={isSendingTest}
              className="w-full py-3 px-4 bg-white border-2 border-dashed border-[--electric] rounded-2xl font-semibold text-sm cursor-pointer transition-all hover:bg-[--lavender] disabled:opacity-60 flex items-center justify-center gap-2 text-[--electric]"
            >
              <Send size={16} className={isSendingTest ? "animate-spin" : ""} />
              {isSendingTest ? "Đang gửi..." : "🧪 Gửi email test ngay"}
            </button>
            
            {testResult && (
              <div className={`mt-3 p-3 rounded-xl border-2 text-sm flex items-start gap-2 ${
                testResult.type === "success" 
                  ? "bg-[#F0FFF4] border-[#B8E8C9] text-[--grass]"
                  : "bg-[#FFE8E8] border-[#FFB4A8] text-[#B83426]"
              }`}>
                <span>{testResult.type === "success" ? "✅" : "⚠️"}</span>
                <span>{testResult.msg}</span>
              </div>
            )}
          </div>

          <div className="p-4 rounded-2xl border-2 flex gap-2.5 text-xs sm:text-sm leading-relaxed"
            style={{ background: 'linear-gradient(135deg, #FFE9A8, #FFF4D0)', borderColor: '#FFE9A8', color: '#8B5500' }}>
            <Lightbulb size={18} className="flex-shrink-0 mt-0.5" />
            <span>Trong giai đoạn dev, email test chỉ gửi được đến email đã đăng ký Resend.</span>
          </div>

          <div className="flex gap-3 mt-6">
            <button onClick={onClose}
              className="px-6 py-4 bg-[--whisper] text-[--ink-soft] border-2 border-[--line] rounded-2xl font-semibold text-sm cursor-pointer transition-all hover:bg-[--lavender] hover:border-[--electric] hover:text-[--electric]">
              Hủy
            </button>
            <button onClick={handleSave}
              className="flex-1 py-4 text-white border-none rounded-2xl font-bold text-sm cursor-pointer transition-all hover:-translate-y-0.5"
              style={{ background: 'linear-gradient(135deg, #FF5C8A, #6C5CE7)', boxShadow: '0 12px 32px rgba(255, 92, 138, 0.18)' }}>
              💾 Lưu cài đặt
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FormField({ label, icon, children }) {
  return (
    <div>
      <label className="flex items-center gap-1.5 font-bold text-xs sm:text-sm mb-2 text-[--ink]">
        {icon && <span>{icon}</span>}
        {label}
      </label>
      {children}
    </div>
  );
}
