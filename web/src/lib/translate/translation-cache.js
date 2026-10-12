// Cache bản dịch trong RAM của container web (self-host 1 instance, không phải
// serverless) — từ phổ biến không phải gọi DeepL lại (nhanh hơn, đỡ quota).
// Map giữ thứ tự chèn: xoá rồi chèn lại khi dùng → phần tử đầu là ít dùng nhất.

export function createLruCache({ max, ttlMs, now = Date.now }) {
  const map = new Map();
  return {
    get(key) {
      const hit = map.get(key);
      if (!hit) return undefined;
      if (now() - hit.at > ttlMs) {
        map.delete(key);
        return undefined;
      }
      map.delete(key);
      map.set(key, hit);
      return hit.value;
    },
    set(key, value) {
      map.delete(key);
      map.set(key, { value, at: now() });
      if (map.size > max) map.delete(map.keys().next().value);
    },
  };
}

/** Khoá cache: chiều dịch + văn bản (giữ hoa/thường — "US" khác "us"). */
export function translationCacheKey(text, source, target) {
  return `${source}>${target}:${text.trim()}`;
}
