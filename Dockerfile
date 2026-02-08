FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY tsconfig.json tsconfig.build.json vitest.config.ts ./
COPY src ./src
RUN npm run build
RUN npm prune --omit=dev

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/dist ./dist
RUN addgroup -S entryserver && adduser -S -G entryserver entryserver \
  && mkdir -p /tmp/entryserver-actual-data \
  && chown -R entryserver:entryserver /app /tmp/entryserver-actual-data
USER entryserver
EXPOSE 3000
CMD ["node", "dist/index.js"]
