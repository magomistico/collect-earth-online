#!/usr/bin/env bash
set -e

# Configuración por defecto de variables de entorno
export DB_HOST=${DB_HOST:-db}
export DB_PORT=${DB_PORT:-5432}
export DB_NAME=${DB_NAME:-ceo}
export DB_USER=${DB_USER:-ceo}
export DB_PASSWORD=${DB_PASSWORD:-ceo_secret_password}
export DB_ADMIN_PASSWORD=${DB_ADMIN_PASSWORD:-ceo_secret_password}
export HTTP_PORT=${PORT:-8080}
export SESSION_KEY=${SESSION_KEY:-inabsigvalidacio}

echo "=========================================================="
echo "    INAB · SIG - Plataforma de Validación Forestal        "
echo "=========================================================="

# 1. Generar o actualizar config.edn
if [ ! -f "config.edn" ]; then
    echo "[INFO] Generando config.edn a partir de config.example.edn..."
    cp config.example.edn config.edn
fi

# Reemplazar configuraciones con las variables de entorno y modo producción
sed -i "s/:triangulum.database\/host .*/:triangulum.database\/host            \"$DB_HOST\"/" config.edn
sed -i "s/:triangulum.database\/port .*/:triangulum.database\/port            $DB_PORT/" config.edn
sed -i "s/:triangulum.database\/dbname .*/:triangulum.database\/dbname          \"$DB_NAME\"/" config.edn
sed -i "s/:triangulum.database\/user .*/:triangulum.database\/user            \"$DB_USER\"/" config.edn
sed -i "s/:triangulum.database\/password .*/:triangulum.database\/password        \"$DB_PASSWORD\"/" config.edn
sed -i "s/:triangulum.build-db\/admin-pass .*/:triangulum.build-db\/admin-pass      \"$DB_ADMIN_PASSWORD\"/" config.edn
sed -i "s/:triangulum.handler\/session-key .*/:triangulum.handler\/session-key       \"$SESSION_KEY\"/" config.edn
sed -i "s/:triangulum.server\/http-port .*/:triangulum.server\/http-port         $HTTP_PORT/" config.edn
sed -i 's/:triangulum.server\/mode .*/:triangulum.server\/mode              "prod"/' config.edn

# 2. Esperar disponibilidad de PostgreSQL
echo "[INFO] Esperando a PostgreSQL en $DB_HOST:$DB_PORT..."
until PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c '\q' 2>/dev/null || PGPASSWORD="$DB_ADMIN_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "postgres" -c '\q' 2>/dev/null; do
    echo "       PostgreSQL no está listo aún - esperando 2 segundos..."
    sleep 2
done
echo "[INFO] Conexión exitosa a PostgreSQL."

# 3. Verificar extensiones PostGIS y pgcrypto
echo "[INFO] Verificando extensiones PostGIS y pgcrypto..."
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS postgis; CREATE EXTENSION IF NOT EXISTS pgcrypto;" >/dev/null 2>&1 || true

# 4. Verificar si la base de datos ya cuenta con las tablas
TABLE_COUNT=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'projects';" 2>/dev/null || echo "0")

if [ "$TABLE_COUNT" = "0" ] || [ -z "$TABLE_COUNT" ]; then
    echo "[INFO] Base de datos nueva detectada. Inicializando esquemas, funciones y datos de INAB-SIG..."
    clojure -M:build-db build-all --dev-data || true
    echo "[INFO] Proceso de inicialización ejecutado."
else
    echo "[INFO] Base de datos existente detectada."
fi

# 5. Asegurar SIEMPRE que las funciones SQL (check_login, etc.) estén cargadas
HAS_FUNCTIONS=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT count(*) FROM pg_proc WHERE proname = 'check_login';" 2>/dev/null || echo "0")
if [ "$HAS_FUNCTIONS" = "0" ] || [ -z "$HAS_FUNCTIONS" ]; then
    echo "[INFO] Funciones SQL faltantes. Instalando funciones en PostgreSQL..."
    for f in src/sql/functions/clear_functions.sql \
             src/sql/functions/doi.sql \
             src/sql/functions/geoai.sql \
             src/sql/functions/geodash.sql \
             src/sql/functions/imagery.sql \
             src/sql/functions/member.sql \
             src/sql/functions/metrics.sql \
             src/sql/functions/plots.sql \
             src/sql/functions/project.sql; do
        if [ -f "$f" ]; then
            echo "       Instalando $f..."
            PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$f" >/dev/null 2>&1 || true
        fi
    done
    echo "[INFO] Funciones SQL verificadas e instaladas."
fi

# 6. Asegurar que el usuario administrador de INAB exista
HAS_ADMIN=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT count(*) FROM users WHERE email = 'admin@inab.gob.gt';" 2>/dev/null || echo "0")
if [ "$HAS_ADMIN" = "0" ] || [ -z "$HAS_ADMIN" ]; then
    echo "[INFO] Creando usuario administrador inicial de INAB..."
    if [ -f "src/sql/default_data/default_data.sql" ]; then
        PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "src/sql/default_data/default_data.sql" >/dev/null 2>&1 || true
    fi
    if [ -f "src/sql/dev_data/dev_data.sql" ]; then
        PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "src/sql/dev_data/dev_data.sql" >/dev/null 2>&1 || true
    fi
    echo "[INFO] Usuario admin@inab.gob.gt listo."
fi

# 4. Iniciar servidor Ring/Triangulum
echo "[INFO] Iniciando servidor web INAB-SIG en el puerto $HTTP_PORT (modo prod)..."
exec clojure -M:production:server start -p "$HTTP_PORT"
