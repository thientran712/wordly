"use client";

const VARIANT_STYLES = {
  primary: {
    background: "var(--electric)",
    color: "var(--on-electric)",
    border: "none",
    boxShadow: "0 2px 8px rgba(var(--electric-rgb),0.3)",
  },
  secondary: {
    background: "var(--hover-bg)",
    color: "var(--ink)",
    border: "1px solid var(--card-border)",
  },
  ghost: {
    background: "transparent",
    color: "var(--ink-soft)",
    border: "1px solid transparent",
  },
  danger: {
    background: "var(--error-soft)",
    color: "var(--error)",
    border: "1px solid var(--error-border)",
  },
};

const SIZE_STYLES = {
  sm: { padding: "0.375rem 0.75rem", fontSize: "0.75rem", borderRadius: "0.625rem" },
  md: { padding: "0.625rem 1rem", fontSize: "0.875rem", borderRadius: "0.75rem" },
  lg: { padding: "0.875rem 1.5rem", fontSize: "0.9375rem", borderRadius: "0.75rem" },
};

export default function Button({
  variant = "primary",
  size = "md",
  icon: Icon,
  iconOnly = false,
  fullWidth = false,
  className = "",
  style = {},
  children,
  ...props
}) {
  const variantStyle = VARIANT_STYLES[variant] || VARIANT_STYLES.primary;
  const sizeStyle = SIZE_STYLES[size] || SIZE_STYLES.md;

  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 font-semibold transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none no-min-h ${fullWidth ? "w-full" : ""} ${className}`}
      style={{
        ...variantStyle,
        ...sizeStyle,
        ...(iconOnly ? { padding: sizeStyle.padding.split(" ")[0], aspectRatio: "1" } : {}),
        ...style,
      }}
      {...props}
    >
      {Icon && <Icon size={size === "sm" ? 13 : size === "lg" ? 18 : 15} />}
      {!iconOnly && children}
    </button>
  );
}
