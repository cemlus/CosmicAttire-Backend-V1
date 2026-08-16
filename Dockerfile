FROM node:20-alpine AS builder

WORKDIR /app

COPY server/package*.json ./
COPY server/tsconfig.json ./

RUN npm ci

COPY server/src ./src

# Build Typescript
RUN npm run build


FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY server/package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
# tsc only compiles .ts files — public.pem never made it into dist/esp/ on
# its own. Currently dead weight either way (nothing in the routes calls
# esp/crypto.ts's encryptPayload/decryptPayload, they use encryptor.ts's
# AES scheme instead), but copying it keeps the RSA path from silently
# breaking if it's ever wired up.
COPY server/src/esp/public.pem ./dist/esp/public.pem

# index.ts serves the profile/verification web pages from here
# (checks ../frontend then ./frontend relative to cwd — cwd is /app, so
# this needs to land at /app/frontend). Without it, the exact URL the
# networking-link feature generates (GET /profile/:encryptedId, the human-
# facing HTML page) 404s in production even though the JSON API under
# /api/profile/:encryptedId keeps working — this was missing entirely.
COPY frontend ./frontend

# Matches config.ts's own default (env.PORT via zod, default 8080). Most
# hosts (Railway, Render, Fly) inject their own PORT at runtime, which this
# ENV default yields to — it's only the fallback if nothing overrides it.
ENV PORT=8080
EXPOSE 8080

# Was hardcoded to port 3000 while the app's real default is 8080 — the
# healthcheck would have failed against any host that didn't happen to
# assign port 3000, marking a working container unhealthy. Reads the
# actual runtime PORT (whatever the host assigned) instead of a fixed port.
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||8080)+'/api/ping').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]