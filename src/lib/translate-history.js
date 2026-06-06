const KEY = "wordly-translate-history";
const MAX = 120;

export function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function addToHistory({ text, translated, direction }) {
  if (!text?.trim() || !translated?.trim()) return;
  try {
    const history = getHistory();
    // Deduplicate: remove previous identical source text in same direction
    const filtered = history.filter(
      h => !(h.text === text.trim() && h.direction === direction)
    );
    const entry = {
      id: Date.now(),
      text: text.trim(),
      translated: translated.trim(),
      direction,
      date: new Date().toISOString(),
    };
    const next = [entry, ...filtered].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
    return entry;
  } catch {
    return null;
  }
}

export function deleteFromHistory(id) {
  try {
    const next = getHistory().filter(h => h.id !== id);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
}

export function clearHistory() {
  try { localStorage.removeItem(KEY); } catch {}
}

// Group entries by calendar date (YYYY-MM-DD), returns [{dateLabel, entries}]
export function groupByDate(history) {
  const map = new Map();
  for (const entry of history) {
    const day = entry.date.slice(0, 10);
    if (!map.has(day)) map.set(day, []);
    map.get(day).push(entry);
  }
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  return Array.from(map.entries()).map(([day, entries]) => ({
    day,
    dateLabel: day === today ? "Hôm nay" : day === yesterday ? "Hôm qua" : formatDate(day),
    entries,
  }));
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "numeric" });
}
