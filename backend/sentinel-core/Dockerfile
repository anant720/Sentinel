# Build Stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./
# Install ALL dependencies (including devDependencies for TypeScript compilation)
RUN npm ci

# Copy raw source code
COPY tsconfig.json ./
COPY src ./src

# Compile TypeScript to JavaScript
RUN npm run build


# Production Stage
FROM node:20-alpine AS runner

WORKDIR /app

# Set Node environment
ENV NODE_ENV=production

# Copy strictly package manifests
COPY package*.json ./
# Install only production dependencies
RUN npm ci --production

# Extrapolate only the compiled generic javascript from the builder
COPY --from=builder /app/dist ./dist

# Expose container port natively
EXPOSE 3000

# Execute the application
CMD ["node", "dist/index.js"]
