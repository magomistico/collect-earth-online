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

# 3. Asegurar extensiones PostGIS y pgcrypto (reparar pgcrypto si crypt fue eliminado antes)
echo "[INFO] Verificando extensiones PostGIS y pgcrypto..."
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS postgis;" || true
HAS_CRYPT=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT count(*) FROM pg_proc WHERE proname = 'crypt';" 2>/dev/null || echo "0")
if [ "$HAS_CRYPT" = "0" ] || [ -z "$HAS_CRYPT" ]; then
    echo "[INFO] Restaurando extensión pgcrypto..."
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "DROP EXTENSION IF EXISTS pgcrypto CASCADE; CREATE EXTENSION pgcrypto;" || true
else
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;" || true
fi

# 4. Verificar si las tablas existen; si no, cargar esquema base
TABLE_COUNT=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'projects';" 2>/dev/null || echo "0")
if [ "$TABLE_COUNT" = "0" ] || [ -z "$TABLE_COUNT" ]; then
    echo "[INFO] Creando tablas del sistema desde src/sql/tables/all.sql..."
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "src/sql/tables/all.sql" || true
fi

# 5. Cargar SIEMPRE las funciones SQL en el orden estricto de dependencias (project -> member -> imagery -> plots -> geodash -> geoai -> doi -> metrics)
echo "[INFO] Sincronizando funciones SQL en orden de dependencias..."
for f in src/sql/functions/project.sql \
         src/sql/functions/member.sql \
         src/sql/functions/imagery.sql \
         src/sql/functions/plots.sql \
         src/sql/functions/geodash.sql \
         src/sql/functions/geoai.sql \
         src/sql/functions/doi.sql \
         src/sql/functions/metrics.sql; do
    if [ -f "$f" ]; then
        echo "       Cargando $f..."
        PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$f" >/dev/null || true
    fi
done

HAS_CHECK_LOGIN=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT count(*) FROM pg_proc WHERE proname = 'check_login';" 2>/dev/null || echo "0")
echo "[INFO] Función check_login activa: $HAS_CHECK_LOGIN"

# 6. Asegurar datos base (roles, usuario guest, usuario admin@inab.gob.gt e institución INAB - SIG)
ROLE_COUNT=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT count(*) FROM roles;" 2>/dev/null || echo "0")
if [ "$ROLE_COUNT" = "0" ] || [ -z "$ROLE_COUNT" ]; then
    echo "[INFO] Insertando roles y usuario invitado por defecto..."
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "src/sql/default_data/default_data.sql" || true
fi

HAS_ADMIN=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT count(*) FROM users WHERE email = 'admin@inab.gob.gt';" 2>/dev/null || echo "0")
if [ "$HAS_ADMIN" = "0" ] || [ -z "$HAS_ADMIN" ]; then
    echo "[INFO] Inicializando usuarios de INAB, institución INAB - SIG y proyecto piloto..."
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "src/sql/dev_data/dev_data.sql" || true
    echo "[INFO] Datos iniciales de INAB · SIG cargados correctamente."
fi

# 7. Iniciar servidor Ring/Triangulum
echo "[INFO] Iniciando servidor web INAB-SIG en el puerto $HTTP_PORT (modo prod)..."
exec clojure -M:production:server start -p "$HTTP_PORT"
