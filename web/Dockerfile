# NEXT_PUBLIC_* chạy ở trình duyệt — Next.js bake cứng giá trị này vào JS lúc
# `next build`, không đọc được từ env runtime của container. Phải truyền giá
# trị THẬT qua --build-arg lúc build image (không phải placeholder) — các
# secret phía server (SUPABASE_SERVICE_ROLE_KEY, GROQ_API_KEY...) vẫn đọc từ
# runtime env (`docker-compose --env-file`) như bình thường, không bake vào.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx next build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
