# Stage 1: Compilación de Assets del Frontend
FROM node:20-slim AS frontend-builder
WORKDIR /app

# Activar pnpm
RUN corepack enable && corepack prepare pnpm@12.18.0 --activate

# Copiar dependencias y lockfile
COPY package.json pnpm-lock.yaml ./

# Instalar dependencias bloqueando scripts innecesarios
RUN pnpm install --frozen-lockfile --allow-build esbuild --allow-build quick-lint-js

# Copiar código fuente del frontend
COPY vite.config.js ./
COPY resources ./resources
COPY src ./src

# Compilar producción (genera dist/public)
RUN npx vite build

# Stage 2: Runtime Backend Clojure + Python + PostGIS Client
FROM clojure:temurin-17-tools-deps-jammy

WORKDIR /app

# Instalar utilidades de sistema
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    postgresql-client \
    p7zip-full \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Instalar dependencias Python (para interop GeoDash GEE)
COPY requirements.txt ./
RUN pip3 install --no-cache-dir -r requirements.txt

# Pre-descargar dependencias Clojure para caching rápido
COPY deps.edn ./
RUN clojure -P && clojure -A:production -P

# Copiar código del backend y recursos
COPY src ./src
COPY resources ./resources
COPY config.example.edn ./
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Copiar frontend compilado desde el Stage 1
COPY --from=frontend-builder /app/dist/public ./dist/public

EXPOSE 8080

ENTRYPOINT ["./docker-entrypoint.sh"]
