"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Flame, UserPlus, LogIn } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";

export default function HomeRightRail({ isGuest }) {
  const router = useRouter();
  const [streak, setStreak] = useState(null);

  useEffect(() => {
    if (isGuest) return;
    fetch("/api/stats/streak")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) setStreak(data.streak); })
      .catch(() => {});
  }, [isGuest]);

  return (
    <div className="flex flex-col gap-3">
      {!isGuest && streak !== null && (
        <Card elevated className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: "var(--sunshine-soft)" }}
          >
            <Flame size={20} style={{ color: "var(--duo-orange)" }} fill="var(--duo-orange)" />
          </div>
          <div>
            <div className="font-black text-lg leading-none" style={{ color: "var(--ink)" }}>{streak}</div>
            <div className="text-xs" style={{ color: "var(--ink-soft)" }}>ngày liên tục</div>
          </div>
        </Card>
      )}

      {isGuest && (
        <Card elevated>
          <p className="font-bold text-sm mb-3" style={{ color: "var(--ink)" }}>
            Tạo hồ sơ để lưu tiến trình của bạn!
          </p>
          <div className="flex flex-col gap-2">
            <Button variant="primary" icon={UserPlus} onClick={() => router.push("/signup")} fullWidth>
              Tạo hồ sơ
            </Button>
            <Button variant="secondary" icon={LogIn} onClick={() => router.push("/login")} fullWidth>
              Đăng nhập
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
