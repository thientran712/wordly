"use client";

import { useState, useEffect } from "react";
import { X, Mail, User, Clock, Calendar, Target, Lightbulb } from "lucide-react";

export default function SettingsModal({ isOpen, onClose, settings, onSave }) {
  const [form, setForm] = useState(settings);

  useEffect(() => {
    setForm(settings);
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
    if (form.email && !form.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      alert('Email không hợp lệ');
      return;
    }
    onSave({ ...form, enabled: !!form.email });
  };

  const days = [
    { day: 1, label: 'T2' },
    { day: 2, label: 'T3' },
    { day: 3, label: 'T4' },
    { day: 4, label: 'T5' },
    { day: 5, label: 'T6' },
    { day: 6, label: 'T7' },
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
        <button
          onClick={onClose}
          className="absolute top-5 right-5 w-10 h-10 rounded-xl border-2 border-[--line] bg-white cursor-pointer flex items-center justify-center text-[--ink-soft] transition-all hover:bg-[--pink] hover:border-[--hot-pink] hover:text-[--hot-pink] hover:rotate-90"
        >
          <X size={18} />
        </button>

        <div className="text-center mb-8">
          <div 
            className="w-16 h-16 mx-auto mb-3 rounded-3xl flex items-center justify-center text-3xl text-white shadow-[0_12px_32px_rgba(255,92,138,0.18)]"
            style={{ background: 'linear-gradient(135deg, #6C5CE7, #FF5C8A)', transform: 'rotate(-5deg)' }}
          >
            ✉️
          </div>
          <h2 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight">Cài đặt Email</h2>
          <p className="text-sm text-[--ink-soft] mt-1">Nhận từ vựng mới mỗi ngày qua email</p>
        </div>

        <div className="space-y-5">
          <FormField label="Địa chỉ Email" icon={<Mail size={14} />}>
            <input
              type="email"
              value={form.email}
              onChange={e => updateField('email', e.target.value)}
              placeholder="ban@email.com"
              className="w-full px-4 py-3.5 bg-[--whisper] border-2 border-[--line] rounded-2xl text-[--ink] focus:outline-none focus:border-[--electric] focus:bg-white focus:ring-4 focus:ring-purple-100 transition-all"
            />
          </FormField>

          <FormField label="Tên hiển thị" icon={<User size={14} />}>
            <input
              type="text"
              value={form.name}
              onChange={e => updateField('name', e.target.value)}
              placeholder="Tên của bạn"
              className="w-full px-4 py-3.5 bg-[--whisper] border-2 border-[--line] rounded-2xl text-[--ink] focus:outline-none focus:border-[--electric] focus:bg-white focus:ring-4 focus:ring-purple-100 transition-all"
            />
          </FormField>

          <FormField label="Giờ nhận email" icon={<Clock size={14} />}>
            <input
              type="time"
              value={form.time}
              onChange={e => updateField('time', e.target.value)}
              className="w-full px-4 py-3.5 bg-[--whisper] border-2 border-[--line] rounded-2xl text-[--ink] focus:outline-none focus:border-[--electric] focus:bg-white focus:ring-4 focus:ring-purple-100 transition-all"
            />
          </FormField>

          <FormField label="Tần suất" icon={<Calendar size={14} />}>
            <div className="grid grid-cols-3 gap-2">
              {[
                { val: 'daily', label: 'Hàng ngày' },
                { val: 'weekdays', label: 'T2 – T6' },
                { val: 'custom', label: 'Tùy chỉnh' }
              ].map(opt => (
                <button
                  key={opt.val}
                  onClick={() => updateField('frequency', opt.val)}
                  className={`px-3 py-3 rounded-xl border-2 font-semibold text-xs sm:text-sm cursor-pointer transition-all ${
                    form.frequency === opt.val
                      ? 'text-white border-transparent shadow-[0_12px_32px_rgba(255,92,138,0.18)]'
                      : 'bg-[--whisper] border-[--line] text-[--ink-soft] hover:border-[--electric] hover:text-[--electric]'
                  }`}
                  style={form.frequency === opt.val ? { background: 'linear-gradient(135deg, #6C5CE7, #FF5C8A)' } : {}}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </FormField>

          {form.frequency === 'custom' && (
            <FormField label="Chọn ngày trong tuần" icon="🗓️">
              <div className="grid grid-cols-7 gap-1.5">
                {days.map(d => (
                  <button
                    key={d.day}
                    onClick={() => toggleDay(d.day)}
                    className={`py-3 rounded-xl border-2 font-semibold text-xs cursor-pointer transition-all ${
                      form.customDays.includes(d.day)
                        ? 'bg-[--mint] text-[--grass] border-[--grass] -translate-y-0.5'
                        : 'bg-[--whisper] border-[--line] text-[--ink-soft]'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </FormField>
          )}

          <FormField label="Cấp độ từ vựng" icon={<Target size={14} />}>
            <select
              value={form.level}
              onChange={e => updateField('level', e.target.value)}
              className="w-full px-4 py-3.5 bg-[--whisper] border-2 border-[--line] rounded-2xl text-[--ink] focus:outline-none focus:border-[--electric] focus:bg-white focus:ring-4 focus:ring-purple-100 transition-all cursor-pointer"
            >
              <option value="beginner">🌱 Beginner — Cơ bản</option>
              <option value="intermediate">🌿 Intermediate — Trung cấp</option>
              <option value="advanced">🌳 Advanced — Nâng cao</option>
            </select>
          </FormField>

          <div 
            className="p-4 rounded-2xl border-2 flex gap-2.5 text-xs sm:text-sm leading-relaxed"
            style={{ background: 'linear-gradient(135deg, #FFE9A8, #FFF4D0)', borderColor: '#FFE9A8', color: '#8B5500' }}
          >
            <Lightbulb size={18} className="flex-shrink-0 mt-0.5" />
            <span>Cài đặt được lưu trên thiết bị. Để gửi email thực, cần kết nối backend (sẽ làm ở Buổi 6).</span>
          </div>

          <div className="flex gap-3 mt-6">
            <button
              onClick={onClose}
              className="px-6 py-4 bg-[--whisper] text-[--ink-soft] border-2 border-[--line] rounded-2xl font-semibold text-sm cursor-pointer transition-all hover:bg-[--lavender] hover:border-[--electric] hover:text-[--electric]"
            >
              Hủy
            </button>
            <button
              onClick={handleSave}
              className="flex-1 py-4 text-white border-none rounded-2xl font-bold text-sm cursor-pointer transition-all hover:-translate-y-0.5"
              style={{ 
                background: 'linear-gradient(135deg, #FF5C8A, #6C5CE7)',
                boxShadow: '0 12px 32px rgba(255, 92, 138, 0.18)'
              }}
            >
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
