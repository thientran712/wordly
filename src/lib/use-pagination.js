"use client";

// Hook phân trang PHÍA CLIENT — dùng khi API đã trả toàn bộ danh sách
// (không có limit/offset ở tầng server).
//
// VÌ SAO CLIENT-SIDE: mọi API danh sách B2B hiện tại (materials, homework,
// members...) trả hết dữ liệu một lần vì số lượng thực tế nhỏ (một lớp
// hiếm khi quá vài trăm học viên/bài). Phân trang server-side cần sửa từng
// API (limit/offset/count) — việc riêng, không phải phạm vi lần này. Phân
// trang client cho đúng UX yêu cầu (bảng ngắn gọn, không cuộn dài) mà
// không phải đổi hợp đồng API.
//
// Nếu sau này một danh sách nào phình quá lớn (nghìn dòng), NÊN chuyển
// sang phân trang server — nhưng chưa cần thiết ở quy mô hiện tại.

import { useState, useMemo } from "react";

const EMPTY = [];

export function usePagination(items, pageSize = 10) {
  const [requestedPage, setPage] = useState(1);
  // Hằng số module-level thay vì [] mới mỗi render — nếu không, useMemo
  // bên dưới nghĩ "list" đổi ở MỌI lần render khi items không phải mảng,
  // làm mất tác dụng memo hoá.
  const list = Array.isArray(items) ? items : EMPTY;

  // Danh sách đổi (lọc/tìm kiếm khác) mà trang đang ở KHÔNG CÒN TỒN TẠI →
  // hiện trang cuối cùng còn dữ liệu, không phải trang trống.
  //
  // Tính TRỰC TIẾP trong render thay vì setState-trong-effect: effect sẽ
  // chạy sau lần render đầu (hiện tạm bảng trống 1 nhịp) rồi mới sửa —
  // vừa nhấp nháy vừa vi phạm rule "không setState trong effect chỉ để
  // đồng bộ state khác" (React khuyến cáo suy ra giá trị khi render được).
  const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
  const page = Math.min(requestedPage, totalPages);

  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return list.slice(start, start + pageSize);
  }, [list, page, pageSize]);

  return {
    pageItems,
    pagination: {
      page,
      pageSize,
      total: list.length,
      onPageChange: setPage,
    },
  };
}
