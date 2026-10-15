/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Chứng chỉ gốc Apple đọc bằng fs lúc chạy (lib/billing/apple-verifier.js) —
  // tracing không tự thấy file .cer nên phải khai, không thì bản standalone
  // thiếu chứng chỉ và mọi giao dịch đều bị từ chối.
  outputFileTracingIncludes: {
    "/api/billing/*": ["./src/lib/billing/certs/*.cer"],
  },
  async headers() {
    return [
      {
        // Allow iOS app to call all /api/* endpoints
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,POST,PUT,DELETE,PATCH,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type,Authorization" },
        ],
      },
    ];
  },
};

export default nextConfig;
