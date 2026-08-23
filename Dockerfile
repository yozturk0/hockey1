FROM node:20-alpine
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY server ./server
COPY web ./web

ENV PORT=8080
EXPOSE 8080
CMD ["node", "server/server.js"]
