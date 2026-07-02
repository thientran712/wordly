"use client";

import { useRouter } from "next/navigation";
import { Sparkles, LogIn, UserPlus } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";

export default function GuestBanner() {
  const router = useRouter();
  return (
    <Card
      className="flex flex-col sm:flex-row items-start sm:items-center gap-3"
      padding="1rem"
      style={{ background: "var(--green-subtle)", borderColor: "var(--green-subtle-border)" }}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: "var(--card-bg)", border: "1px solid var(--green-subtle-border)" }}
        >
          <Sparkles size={15} style={{ color: "var(--electric)" }} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold" style={{ color: "var(--ink)" }}>
            Đăng ký để mở khoá đầy đủ tính năng
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--ink-soft)" }}>
            Từ mới mỗi ngày · Ghi chú từ vựng · Email nhắc ôn tập
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto">
        <Button variant="primary" size="sm" icon={UserPlus} onClick={() => router.push("/signup")} className="flex-1 sm:flex-none">
          Đăng ký miễn phí
        </Button>
        <Button variant="secondary" size="sm" icon={LogIn} onClick={() => router.push("/login")} className="flex-1 sm:flex-none">
          Đăng nhập
        </Button>
      </div>
    </Card>
  );
}
