FROM node:20-bookworm AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN echo "force-rebuild-20240414" && npm ci

FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends libatomic1 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY . .
CMD ["node", "src/server.js"]
