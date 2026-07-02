"use client";

export default function Card({
  as: Component = "div",
  elevated = false,
  padding = "1rem",
  className = "",
  style = {},
  children,
  ...props
}) {
  return (
    <Component
      className={`rounded-2xl ${className}`}
      style={{
        background: elevated ? "var(--card-bg)" : "var(--surface)",
        border: "1px solid var(--card-border)",
        padding,
        ...style,
      }}
      {...props}
    >
      {children}
    </Component>
  );
}
