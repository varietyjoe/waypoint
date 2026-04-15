FROM node:20-bookworm AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --production

FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends libatomic1 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
CMD ["node", "src/server.js"]
