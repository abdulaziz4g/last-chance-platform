# ============================================================================
# Last Chance web console — production image (Next.js standalone output)
# ============================================================================
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-fund --no-audit
COPY . .
RUN npm run build

FROM node:24-alpine
ENV NODE_ENV=production
ENV PORT=3001
ENV HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
USER app
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/ || exit 1
CMD ["node", "server.js"]
