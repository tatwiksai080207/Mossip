FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Copy source code
COPY . .

# Build the frontend and backend
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Only copy necessary files from builder
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server

# Expose the API port
EXPOSE 3001

# Start the Node.js server using tsx
# Note: In a true production environment, you might compile the TS server to JS.
# But using tsx is fine for the playground.
CMD ["npm", "run", "server"]
