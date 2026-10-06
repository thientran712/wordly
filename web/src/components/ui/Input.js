"use client";

import { forwardRef } from "react";

const Input = forwardRef(function Input(
  { icon: Icon, as: Component = "input", className = "", style = {}, ...props },
  ref
) {
  return (
    <div className="relative">
      {Icon && (
        <Icon size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--ink-ghost)" }} />
      )}
      <Component
        ref={ref}
        className={`w-full text-sm rounded-xl focus:outline-none transition-all ${Icon ? "pl-10" : "pl-3.5"} pr-3.5 py-2.5 ${className}`}
        style={{
          background: "var(--input-bg)",
          border: "1px solid var(--input-border)",
          color: "var(--ink)",
          ...style,
        }}
        onFocus={(e) => { e.target.style.borderColor = "var(--electric)"; }}
        onBlur={(e) => { e.target.style.borderColor = "var(--input-border)"; }}
        {...props}
      />
    </div>
  );
});

export default Input;
