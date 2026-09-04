"use client";

// Cài đặt tổ chức — form được dựng TỪ SCHEMA mà API trả về, nên thêm cấu
// hình mới chỉ cần sửa SETTING_SCHEMA ở server, không phải sửa UI này.

import { useEffect, useState } from "react";
import { Settings, HardDrive, Check, Sparkles, Lock } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Badge from "@/components/ui/Badge";

function formatBytes(n) {
  const v = Number(n) || 0;
  if (v >= 1024 ** 3) return `${(v / 1024 ** 3).toFixed(1)} GB`;
  if (v >= 1024 ** 2) return `${(v / 1024 ** 2).toFixed(0)} MB`;
  return `${(v / 1024).toFixed(0)} KB`;
}

export default function SettingsPanel({ orgId, isOwner }) {
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState({});
  const [orgName, setOrgName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;

    fetch(`/api/orgs/${orgId}/settings`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setOrgName(d.org?.name || "");
      })
      .catch(() => {
        if (!cancelled) setError("Không tải được cài đặt");
      });

    return () => {
      cancelled = true;
    };
  }, [orgId]);

  if (error && !data) {
    return (
      <Card padding="1.5rem" className="text-center">
        <p className="text-sm" style={{ color: "var(--error)" }}>{error}</p>
      </Card>
    );
  }

  if (!data) {
    return (
      <div className="space-y-2">
        {[0, 1].map((i) => (
          <div key={i} className="h-28 rounded-2xl animate-pulse" style={{ background: "var(--hover-bg)" }} />
        ))}
      </div>
    );
  }

  const { settings, schema, features, feature_labels, storage, org } = data;

  // Giá trị hiển thị: bản nháp nếu đang gõ, ngược lại lấy từ server
  const valueOf = (key) => (key in draft ? draft[key] : settings[key]);
  const dirty = Object.keys(draft).length > 0 || orgName !== org.name;

  const setValue = (key, v) => {
    setDraft((p) => ({ ...p, [key]: v }));
    setSaved(false);
    setError("");
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      // API validate all-or-nothing và từ chối patch rỗng, nên chỉ gửi
      // `settings` khi thực sự có cấu hình thay đổi. Đổi tên đi riêng.
      const payload = {};
      if (Object.keys(draft).length > 0) payload.settings = draft;
      if (orgName !== org.name) payload.name = orgName;

      const res = await fetch(`/api/orgs/${orgId}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Không lưu được cài đặt");

      setData((prev) => ({
        ...prev,
        settings: d.settings || prev.settings,
        org: { ...prev.org, name: orgName },
      }));
      setDraft({});
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const storagePercent =
    storage.bytes_limit > 0
      ? Math.min(100, Math.round((storage.bytes_used / storage.bytes_limit) * 100))
      : 0;

  return (
    // Màn hình rộng: xếp 2 cột để không phải cuộn dọc nhiều.
    // items-start để các card không bị kéo cao bằng nhau.
    <div className="grid gap-3 items-start" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))" }}>
      {error && (
        <div
          className="px-3 py-2 rounded-xl text-sm"
          style={{ background: "var(--error-soft)", color: "var(--error)", border: "1px solid var(--error-border)", gridColumn: "1 / -1" }}
        >
          {error}
        </div>
      )}

      {/* Thông tin trung tâm */}
      <Card elevated>
        <div className="flex items-center gap-2 mb-3">
          <Settings size={15} style={{ color: "var(--ink-soft)" }} />
          <h3 className="text-sm font-bold" style={{ color: "var(--ink)" }}>
            Thông tin trung tâm
          </h3>
          <Badge tone={org.status === "trial" ? "warning" : "accent"}>
            {org.status === "trial" ? "Dùng thử" : org.plan}
          </Badge>
        </div>

        <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--ink-soft)" }}>
          Tên trung tâm
        </label>
        <Input
          value={orgName}
          onChange={(e) => {
            setOrgName(e.target.value);
            setSaved(false);
          }}
          maxLength={200}
          disabled={!isOwner}
          className="mb-2"
        />
        <p className="text-xs" style={{ color: "var(--ink-ghost)" }}>
          Mã: {org.slug}
        </p>
      </Card>

      {/* Dung lượng lưu trữ */}
      <Card elevated>
        <div className="flex items-center gap-2 mb-3">
          <HardDrive size={15} style={{ color: "var(--ink-soft)" }} />
          <h3 className="text-sm font-bold" style={{ color: "var(--ink)" }}>
            Dung lượng lưu trữ
          </h3>
        </div>

        <div className="flex items-baseline gap-1.5 mb-2">
          <span className="text-lg font-black tabular-nums" style={{ color: "var(--ink)" }}>
            {formatBytes(storage.bytes_used)}
          </span>
          <span className="text-xs" style={{ color: "var(--ink-soft)" }}>
            / {formatBytes(storage.bytes_limit)}
          </span>
        </div>

        <div className="h-2 rounded-full overflow-hidden mb-2" style={{ background: "var(--surface)" }}>
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${storagePercent}%`,
              background:
                storagePercent >= 90
                  ? "var(--error)"
                  : storagePercent >= 70
                  ? "var(--sunshine-text)"
                  : "var(--electric)",
            }}
          />
        </div>

        {storagePercent >= 90 && (
          <p className="text-xs" style={{ color: "var(--error)" }}>
            Gần hết dung lượng. Xoá tài liệu cũ hoặc nâng gói để tiếp tục upload.
          </p>
        )}
      </Card>

      {/* Cấu hình — dựng từ schema */}
      <Card elevated>
        <h3 className="text-sm font-bold mb-3" style={{ color: "var(--ink)" }}>
          Cấu hình
        </h3>

        <div className="space-y-3">
          {Object.entries(schema).map(([key, s]) => (
            <div key={key}>
              <label className="block text-xs font-semibold mb-1" style={{ color: "var(--ink-soft)" }}>
                {s.label}
              </label>

              {s.type === "int" && (
                <Input
                  type="number"
                  min={s.min}
                  max={s.max}
                  value={valueOf(key) ?? ""}
                  onChange={(e) => setValue(key, e.target.value === "" ? "" : Number(e.target.value))}
                  disabled={!isOwner}
                />
              )}

              {s.type === "enum" && (
                <select
                  value={valueOf(key) ?? ""}
                  onChange={(e) => setValue(key, e.target.value)}
                  disabled={!isOwner}
                  className="w-full px-3 py-2 rounded-xl text-sm appearance-none"
                  style={{ background: "var(--input-bg)", border: "1px solid var(--input-border)", color: "var(--ink)" }}
                >
                  {s.values.map((v) => (
                    <option key={v} value={v}>
                      {s.labels?.[v] || v}
                    </option>
                  ))}
                </select>
              )}

              {s.type === "time_array" && (
                <Input
                  value={(valueOf(key) || []).join(", ")}
                  onChange={(e) =>
                    setValue(
                      key,
                      e.target.value
                        .split(",")
                        .map((t) => t.trim())
                        .filter(Boolean)
                    )
                  }
                  placeholder="08:00, 20:00"
                  disabled={!isOwner}
                />
              )}

              {s.help && (
                <p className="text-xs mt-1" style={{ color: "var(--ink-ghost)" }}>
                  {s.help}
                </p>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Tính năng theo gói — chỉ xem, bật/tắt do bên bán quyết định */}
      <Card elevated>
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={15} style={{ color: "var(--ink-soft)" }} />
          <h3 className="text-sm font-bold" style={{ color: "var(--ink)" }}>
            Tính năng trong gói
          </h3>
        </div>

        <div className="space-y-1.5">
          {Object.entries(feature_labels).map(([key, label]) => {
            const on = features[key];
            return (
              <div
                key={key}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs"
                style={{ background: "var(--surface)" }}
              >
                {on ? (
                  <Check size={13} style={{ color: "var(--grass-text)" }} />
                ) : (
                  <Lock size={13} style={{ color: "var(--ink-ghost)" }} />
                )}
                <span style={{ color: on ? "var(--ink)" : "var(--ink-ghost)" }}>{label}</span>
                {!on && (
                  <span className="ml-auto" style={{ color: "var(--ink-ghost)" }}>
                    Nâng gói
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-xs mt-3" style={{ color: "var(--ink-ghost)" }}>
          Liên hệ Wordly để nâng gói và mở thêm tính năng.
        </p>
      </Card>

      {isOwner && (
        <div className="flex items-center gap-2" style={{ gridColumn: "1 / -1" }}>
          <Button onClick={save} disabled={!dirty || saving}>
            {saving ? "Đang lưu..." : "Lưu cài đặt"}
          </Button>
          {saved && (
            <span className="text-xs font-bold flex items-center gap-1" style={{ color: "var(--grass-text)" }}>
              <Check size={13} />
              Đã lưu
            </span>
          )}
        </div>
      )}
    </div>
  );
}
