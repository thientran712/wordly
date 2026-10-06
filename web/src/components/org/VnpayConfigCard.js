"use client";

// Cấu hình thanh toán VNPay — CHỈ owner thấy và sửa.
//
// Hash Secret KHÔNG BAO GIỜ hiển thị lại sau khi lưu — API GET không trả
// giá trị đó (chỉ báo has_hash_secret: true/false). Owner nhập lại secret
// mới nếu muốn đổi, ô nhập luôn trống khi tải trang.

import { useEffect, useState } from "react";
import { CreditCard, Eye, EyeOff, Check, AlertTriangle } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Badge from "@/components/ui/Badge";

export default function VnpayConfigCard({ orgId }) {
  const [data, setData] = useState(null);
  const [tmnCode, setTmnCode] = useState("");
  const [hashSecret, setHashSecret] = useState("");
  const [environment, setEnvironment] = useState("sandbox");
  const [enabled, setEnabled] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;

    fetch(`/api/orgs/${orgId}/payment-config`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d) => {
        if (cancelled) return;
        setData(d);
        if (d.config) {
          setTmnCode(d.config.tmn_code || "");
          setEnvironment(d.config.environment || "sandbox");
          setEnabled(d.config.enabled === true);
        }
      })
      .catch(() => {
        if (!cancelled) setError("Không tải được cấu hình thanh toán");
      });

    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const body = { tmn_code: tmnCode.trim(), environment, enabled };
      if (hashSecret.trim()) body.hash_secret = hashSecret.trim();

      const res = await fetch(`/api/orgs/${orgId}/payment-config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Không lưu được cấu hình");

      setHashSecret(""); // xoá khỏi ô nhập ngay sau khi lưu — không để lộ dài lâu trên màn hình
      setSaved(true);
      setData((prev) => ({
        ...prev,
        config: { ...prev.config, tmn_code: tmnCode.trim(), environment, enabled },
        has_hash_secret: true,
      }));
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!data) {
    return <div className="h-40 rounded-2xl animate-pulse" style={{ background: "var(--hover-bg)" }} />;
  }

  const isFirstTime = !data.config;

  return (
    <Card elevated>
      <div className="flex items-center gap-2 mb-1">
        <CreditCard size={15} style={{ color: "var(--ink-soft)" }} />
        <h3 className="text-sm font-bold" style={{ color: "var(--ink)" }}>
          Thanh toán VNPay
        </h3>
        {data.has_hash_secret && <Badge tone="accent">Đã cấu hình</Badge>}
      </div>
      <p className="text-xs mb-3" style={{ color: "var(--ink-soft)" }}>
        Cho phép học viên/phụ huynh thanh toán học phí trực tuyến. Tiền về
        thẳng tài khoản VNPay của trung tâm — Wordly không giữ tiền.
      </p>

      {error && (
        <div
          className="mb-3 px-3 py-2 rounded-xl text-xs"
          style={{ background: "var(--error-soft)", color: "var(--error)", border: "1px solid var(--error-border)" }}
        >
          {error}
        </div>
      )}

      <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--ink-soft)" }}>
        TMN Code (Mã Website)
      </label>
      <Input
        value={tmnCode}
        onChange={(e) => setTmnCode(e.target.value)}
        placeholder="VD: DEMO1234"
        maxLength={50}
        className="mb-3"
      />

      <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--ink-soft)" }}>
        Hash Secret
        {!isFirstTime && (
          <span style={{ color: "var(--ink-ghost)" }}> (để trống nếu không đổi)</span>
        )}
      </label>
      <div className="relative mb-1">
        <Input
          type={showSecret ? "text" : "password"}
          value={hashSecret}
          onChange={(e) => setHashSecret(e.target.value)}
          placeholder={isFirstTime ? "Dán Hash Secret từ VNPay Merchant Portal" : "••••••••••••"}
        />
        <button
          type="button"
          onClick={() => setShowSecret((v) => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2 no-min-h w-6 h-6 flex items-center justify-center"
          style={{ color: "var(--ink-ghost)" }}
        >
          {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
      <p className="text-xs mb-3" style={{ color: "var(--ink-ghost)" }}>
        Được mã hoá khi lưu. Không ai xem lại được giá trị này, kể cả bạn —
        chỉ hệ thống dùng để xác minh giao dịch.
      </p>

      <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--ink-soft)" }}>
        Môi trường
      </label>
      <select
        value={environment}
        onChange={(e) => setEnvironment(e.target.value)}
        className="w-full px-3 py-2 rounded-xl text-sm mb-3 appearance-none"
        style={{ background: "var(--input-bg)", border: "1px solid var(--input-border)", color: "var(--ink)" }}
      >
        <option value="sandbox">Sandbox (test, không mất tiền thật)</option>
        <option value="production">Production (giao dịch thật)</option>
      </select>

      {environment === "production" && (
        <div
          className="flex items-start gap-1.5 text-xs mb-3 px-2.5 py-2 rounded-xl"
          style={{ background: "var(--sunshine-soft)", border: "1px solid var(--sunshine-border)", color: "var(--sunshine-dark)" }}
        >
          <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
          <span>Chế độ Production dùng tiền thật. Hãy test kỹ ở Sandbox trước khi chuyển.</span>
        </div>
      )}

      <label
        className="flex items-center gap-2 mb-4 cursor-pointer px-2.5 py-2 rounded-xl"
        style={{ background: "var(--surface)" }}
      >
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          disabled={isFirstTime && !hashSecret.trim() && !data.has_hash_secret}
        />
        <span className="text-xs font-semibold" style={{ color: "var(--ink)" }}>
          Bật thanh toán online cho học viên
        </span>
      </label>

      <div className="flex items-center gap-2">
        <Button onClick={save} disabled={!tmnCode.trim() || saving || (isFirstTime && !hashSecret.trim())}>
          {saving ? "Đang lưu..." : "Lưu cấu hình"}
        </Button>
        {saved && (
          <span className="text-xs font-bold flex items-center gap-1" style={{ color: "var(--grass-text)" }}>
            <Check size={13} />
            Đã lưu
          </span>
        )}
      </div>
    </Card>
  );
}
