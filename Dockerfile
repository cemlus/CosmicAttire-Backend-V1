# Stage 1: Build the TypeScript backend
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root package definition to install shared dependencies
COPY package.json package-lock.json ./

# Install root dependencies
RUN npm ci

# Copy server package definition and config files
COPY server/package.json ./server/
COPY server/tsconfig.json ./server/

# Install server devDependencies (like @types/node) for compilation
RUN cd server && npm install --include=dev

# Copy server source code and the static frontend
COPY server/src ./server/src
COPY frontend ./frontend

# Build the TypeScript application
RUN cd server && npm run build

# Stage 2: Production runner
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

# Copy the transpiled production build from the builder stage
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/package.json ./server/package.json

# Copy static frontend files (Express serves these dynamically)
COPY --from=builder /app/frontend ./frontend

# Copy root package definition and install ONLY production dependencies
COPY package.json package-lock.json ./
RUN npm ci --only=production

# Expose port 3000 (default port for the Express app)
EXPOSE 3000

# Set healthcheck to verify container status
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/ping').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Start the application from the root directory context
CMD ["node", "server/dist/src/index.js"]
