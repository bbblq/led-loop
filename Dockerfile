FROM node:20-alpine

# Install FFmpeg for server-side MP4 rendering on HTTP LAN IPs
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy application source
COPY . .

# Ensure storage directories exist
RUN mkdir -p /app/data /app/uploads/fonts /app/uploads/videos

# Expose port
EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production

# Volume mounts for data persistence
VOLUME ["/app/data", "/app/uploads"]

CMD ["npm", "start"]
