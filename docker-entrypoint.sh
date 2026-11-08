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

# 3. Verificar si la base de datos ya cuenta con las tablas
TABLE_COUNT=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'projects';" 2>/dev/null || echo "0")

if [ "$TABLE_COUNT" = "0" ] || [ -z "$TABLE_COUNT" ]; then
    echo "[INFO] Base de datos nueva detectada. Inicializando esquemas, funciones y datos de INAB-SIG..."
    clojure -M:build-db build-all --dev-data
    echo "[INFO] Base de datos de INAB-SIG inicializada con éxito."
else
    echo "[INFO] Base de datos existente detectada. Esquema listo para producción."
fi

# 4. Iniciar servidor Ring/Triangulum
echo "[INFO] Iniciando servidor web INAB-SIG en el puerto $HTTP_PORT (modo prod)..."
exec clojure -M:production:server start -p "$HTTP_PORT"
