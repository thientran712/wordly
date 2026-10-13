/** Cắt theo ký tự (không cắt đôi emoji/chữ có dấu), thêm "…". */
export function truncate(text, max) {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  return chars.slice(0, max - 1).join("").trimEnd() + "…";
}
