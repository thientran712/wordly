"use client";

// /join — Học viên nhập mã lớp để tham gia trung tâm.
//
// Sau khi join thành công PHẢI gọi refreshSession(): ngữ cảnh org nằm trong
// JWT, nên token hiện tại chưa biết org mới. Không refresh thì học viên vào
// /org sẽ thấy "chưa thuộc trung tâm nào" dù đã join xong.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ticket, Check } from "lucide-react";
import { createClient } from "@/lib/supabase-client";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

export default function JoinPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [state, setState] = useState("idle"); // idle | submitting | success
  const [error, setError] = useState("");
  const [joined, setJoined] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    const clean = code.trim().toUpperCase().replace(/[\s-]/g, "");
    if (!clean || state === "submitting") return;

    setState("submitting");
    setError("");

    try {
      const res = await fetch("/api/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: clean }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Không tham gia được lớp");
        setState("idle");
        return;
      }

      // Bắt buộc: lấy JWT mới để có claim user_orgs chứa org vừa join.
      if (data.needs_session_refresh) {
        try {
          await createClient().auth.refreshSession();
        } catch {
          // Nếu refresh lỗi, vẫn cho vào /org — trang đó tự fetch lại
        }
      }

      setJoined(data);
      setState("success");
      setTimeout(() => router.push("/org"), 1500);
    } catch {
      setError("Có lỗi xảy ra, vui lòng thử lại");
      setState("idle");
    }
  };

  if (state === "success") {
    return (
      <main className="max-w-md mx-auto px-4 py-16">
        <Card elevated padding="2rem" className="text-center">
          <div
            className="w-14 h-14 rounded-full mx-auto mb-4 flex items-center justify-center"
            style={{ background: "var(--grass-soft)" }}
          >
            <Check size={26} style={{ color: "var(--grass-text)" }} />
          </div>
          <h1 className="text-lg font-bold mb-1" style={{ color: "var(--ink)" }}>
            Đã tham gia lớp!
          </h1>
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
            {joined?.class_name}
          </p>
        </Card>
      </main>
    );
  }

  return (
    <main className="max-w-md mx-auto px-4 py-16">
      <Card elevated padding="2rem">
        <div
          className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
          style={{ background: "var(--green-subtle)" }}
        >
          <Ticket size={26} style={{ color: "var(--electric)" }} />
        </div>

        <h1 className="text-lg font-bold text-center mb-1" style={{ color: "var(--ink)" }}>
          Nhập mã lớp
        </h1>
        <p className="text-sm text-center mb-6" style={{ color: "var(--ink-soft)" }}>
          Giáo viên sẽ cho bạn mã gồm 6 ký tự
        </p>

        <form onSubmit={submit}>
          <Input
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              setError("");
            }}
            placeholder="VD: K7M2QP"
            maxLength={14}
            autoFocus
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            className="text-center font-mono font-bold tracking-widest"
            style={{ fontSize: "1.25rem" }}
          />

          {error && (
            <p className="text-xs mt-2 text-center" style={{ color: "var(--error)" }}>
              {error}
            </p>
          )}

          <Button
            type="submit"
            fullWidth
            disabled={!code.trim() || state === "submitting"}
            className="mt-4"
          >
            {state === "submitting" ? "Đang tham gia..." : "Tham gia lớp"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
