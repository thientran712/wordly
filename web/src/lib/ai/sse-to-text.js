// Chuyển luồng SSE kiểu OpenAI (Gemini/Groq) thành luồng chữ thuần — chỉ phần
// delta content, đủ để client hiện hiệu ứng gõ chữ.
//
// pull() PHẢI đọc tiếp cho tới khi đưa ra được chữ hoặc luồng gốc kết thúc.
// Theo chuẩn Web Streams, pull() trả về mà không enqueue gì thì sẽ KHÔNG được
// gọi lại → luồng treo vĩnh viễn. Chunk không sinh ra chữ là chuyện thường:
// nửa dòng SSE bị cắt giữa 2 gói mạng, dòng [DONE], chunk chỉ có
// finish_reason. Lỗi này từng làm chat Alex bị cụt rồi treo tới timeout.
export function toPlainTextStream(upstream) {
  const reader = upstream.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  // Trả về số đoạn chữ đã enqueue từ các dòng hoàn chỉnh
  const emitLines = (lines, controller) => {
    let emitted = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const delta = JSON.parse(payload).choices?.[0]?.delta?.content;
        if (delta) {
          controller.enqueue(encoder.encode(delta));
          emitted++;
        }
      } catch {
        // bỏ qua chunk SSE hỏng
      }
    }
    return emitted;
  };

  return new ReadableStream({
    async pull(controller) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          // Dòng cuối có thể không kết thúc bằng xuống dòng
          buffer += decoder.decode();
          emitLines([buffer], controller);
          buffer = "";
          controller.close();
          return;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        if (emitLines(lines, controller) > 0) return;
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}
