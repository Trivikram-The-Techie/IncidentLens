# Production Dockerfile for IncidentLens Cloud Run Service
FROM node:22-alpine

# Set working directory
WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=8080

# Install production dependencies first (caching layer)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source code
COPY . .

# Expose Cloud Run default port
EXPOSE 8080

# Run IncidentLens service
CMD ["npm", "start"]
