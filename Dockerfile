# Build stage — dashboard
FROM node:20-alpine AS dashboard-build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/dashboard/package.json packages/dashboard/
COPY packages/server/package.json packages/server/
RUN npm install --workspace=packages/dashboard
COPY packages/dashboard packages/dashboard
RUN npm run build --workspace=packages/dashboard

# Build stage — server
FROM node:20-alpine AS server-build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/server/package.json packages/server/
COPY packages/dashboard/package.json packages/dashboard/
RUN npm install --workspace=packages/server
COPY packages/server packages/server
RUN npm run build --workspace=packages/server

# Production stage
FROM node:20-alpine
WORKDIR /app

# Install git (needed for GitHub clone feature) and unzip
RUN apk add --no-cache git unzip

# Copy package files and install production deps only
COPY package.json package-lock.json* ./
COPY packages/server/package.json packages/server/
COPY packages/dashboard/package.json packages/dashboard/
RUN npm install --workspace=packages/server --omit=dev

# Copy built server
COPY --from=server-build /app/packages/server/dist packages/server/dist

# Copy built dashboard into server's static dir
COPY --from=dashboard-build /app/packages/dashboard/dist packages/dashboard/dist

# Create data directory
RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV DATA_DIR=/app/data
ENV PORT=3000

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

CMD ["node", "packages/server/dist/index.js"]
