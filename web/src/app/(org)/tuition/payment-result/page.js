"use client";

// Trang kết quả sau khi VNPay redirect người dùng về (route vnpay-return).
//
// LƯU Ý: trang này chỉ HIỂN THỊ dựa trên status trong URL — trạng thái
// thật đã (hoặc sẽ) được ghi nhận qua IPN (server-to-server), không phải ở
// đây. Nếu IPN có độ trễ, trạng thái "success" hiện ở đây là dự đoán hợp
// lý (VNPay redirect về SAU khi xử lý), nhưng nguồn sự thật là DB.

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { CheckCircle2, XCircle, AlertTriangle, Loader2 } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";

const STATUS_CONFIG = {
  success: {
    icon: CheckCircle2,
    color: "var(--grass-text)",
    bg: "var(--grass-soft)",
    title: "Thanh toán thành công",
    desc: "Khoản học phí của bạn đã được ghi nhận.",
  },
  failed: {
    icon: XCircle,
    color: "var(--error)",
    bg: "var(--error-soft)",
    title: "Thanh toán không thành công",
    desc: "Giao dịch bị từ chối hoặc đã huỷ. Bạn có thể thử lại.",
  },
  invalid_signature: {
    icon: AlertTriangle,
    color: "var(--error)",
    bg: "var(--error-soft)",
    title: "Không xác minh được giao dịch",
    desc: "Có dấu hiệu bất thường với giao dịch này. Vui lòng liên hệ trung tâm để được hỗ trợ, đừng thử lại ngay.",
  },
  not_found: {
    icon: AlertTriangle,
    color: "var(--sunshine-text)",
    bg: "var(--sunshine-soft)",
    title: "Không tìm thấy giao dịch",
    desc: "Đường dẫn có thể đã hết hạn hoặc không hợp lệ.",
  },
  invalid: {
    icon: AlertTriangle,
    color: "var(--sunshine-text)",
    bg: "var(--sunshine-soft)",
    title: "Đường dẫn không hợp lệ",
    desc: "Thiếu thông tin giao dịch.",
  },
};

export default function PaymentResultPage() {
  return (
    <Suspense fallback={null}>
      <PaymentResultInner />
    </Suspense>
  );
}

function PaymentResultInner() {
  const params = useSearchParams();
  const router = useRouter();
  const status = params.get("status");
  const tuitionId = params.get("tuition_id");

  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.invalid;
  const Icon = cfg.icon;

  return (
    <main className="max-w-md mx-auto px-4 py-16">
      <Card elevated padding="2rem" className="text-center">
        <div
          className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center"
          style={{ background: cfg.bg }}
        >
          <Icon size={30} style={{ color: cfg.color }} />
        </div>

        <h1 className="text-lg font-bold mb-1" style={{ color: "var(--ink)" }}>
          {cfg.title}
        </h1>
        <p className="text-sm mb-6" style={{ color: "var(--ink-soft)" }}>
          {cfg.desc}
        </p>

        {status === "success" && (
          <p className="text-xs mb-4" style={{ color: "var(--ink-ghost)" }}>
            Nếu công nợ chưa cập nhật ngay, hãy đợi ít phút rồi tải lại trang.
          </p>
        )}

        <Button onClick={() => router.push("/org")} fullWidth>
          Về trang tổ chức
        </Button>
      </Card>
    </main>
  );
}
