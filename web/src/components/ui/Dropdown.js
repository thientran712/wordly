"use client";

import { ChevronDown } from "lucide-react";

export default function Dropdown({ value, onChange, options, allLabel = "Tất cả", className = "" }) {
  return (
    <div className={`relative ${className}`}>
      <select
        value={value || ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="appearance-none pl-4 pr-9 py-2.5 rounded-xl text-sm font-bold focus:outline-none cursor-pointer transition-all"
        style={{
          background: "var(--surface-elevated)",
          border: "1.5px solid var(--line)",
          color: "var(--ink)",
        }}
      >
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--ink-soft)" }} />
    </div>
  );
}
