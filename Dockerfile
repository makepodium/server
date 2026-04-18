FROM node:22-alpine AS deps
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile || pnpm install


FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN pnpm build


FROM node:22-alpine AS runtime
RUN apk add --no-cache ffmpeg && corepack enable
WORKDIR /app

ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --prod --frozen-lockfile || pnpm install --prod

COPY --from=build /app/dist ./dist
COPY drizzle ./drizzle
COPY drizzle.config.ts ./
COPY scripts ./scripts

RUN chmod +x scripts/entrypoint.sh && chown -R node:node /app
USER node

EXPOSE 3000
CMD ["./scripts/entrypoint.sh"]
