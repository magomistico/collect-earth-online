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

# 5. Aplicar SIEMPRE migraciones de esquema (columnas accept_tos, visibility_type, project_type, project_drafts, etc.)
echo "[INFO] Verificando columnas y tipos requeridos por las funciones SQL..."
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" <<'EOSQL' || true
DO $$ BEGIN
    CREATE TYPE project_type AS ENUM ('simplified', 'regular');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE visibility_type AS ENUM ('public', 'private', 'platform');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

ALTER TABLE users ADD COLUMN IF NOT EXISTS accepted_terms boolean DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS accept_tos text;

ALTER TABLE projects ADD COLUMN IF NOT EXISTS learning_material text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS type project_type DEFAULT 'regular';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS reference_plot_rid integer REFERENCES plots (plot_uid) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS geoai_assets jsonb;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS highlight boolean;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS accept_tos text;

ALTER TABLE user_plots ADD COLUMN IF NOT EXISTS imagery_ids jsonb;
ALTER TABLE user_plots ADD COLUMN IF NOT EXISTS disabled boolean DEFAULT FALSE;
ALTER TABLE user_plots ADD COLUMN IF NOT EXISTS used_kml boolean;
ALTER TABLE user_plots ADD COLUMN IF NOT EXISTS used_geodash boolean;
ALTER TABLE user_plots ADD COLUMN IF NOT EXISTS admin_review boolean DEFAULT FALSE;

DO $$ BEGIN
    ALTER TABLE imagery ALTER COLUMN visibility TYPE visibility_type USING visibility::visibility_type;
EXCEPTION
    WHEN others THEN null;
END $$;

CREATE TABLE IF NOT EXISTS project_drafts (
    project_draft_uid SERIAL PRIMARY KEY,
    user_rid INT REFERENCES users (user_uid) ON DELETE CASCADE,
    institution_rid INT REFERENCES institutions (institution_uid) ON DELETE CASCADE,
    name text NOT NULL,
    project_state JSONB,
    created_date date DEFAULT NOW(),
    updated_date date DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS metrics_users (
    metric_users_uid SERIAL PRIMARY KEY,
    user_rid INTEGER NOT NULL REFERENCES users (user_uid) ON DELETE CASCADE ON UPDATE CASCADE,
    created_date DATE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS data_sharing (
    data_sharing_uid SERIAL PRIMARY KEY,
    interpreter_name TEXT NOT NULL,
    accepted_date DATE DEFAULT NOW(),
    ip TEXT,
    project_rid INTEGER REFERENCES projects(project_uid) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS geoai_cache (
    geoai_cache_uid SERIAL PRIMARY KEY,
    project_rid integer NOT NULL REFERENCES projects(project_uid) ON DELETE CASCADE ON UPDATE CASCADE,
    plot_rid integer NOT NULL REFERENCES plots(plot_uid) ON DELETE CASCADE ON UPDATE CASCADE,
    similar_plots integer[],
    metadata jsonb,
    CONSTRAINT geoai_cache_project_plot_unique UNIQUE (project_rid, plot_rid)
);
EOSQL

# 6. Cargar SIEMPRE las funciones SQL en el orden estricto de dependencias
echo "[INFO] Sincronizando funciones SQL en orden de dependencias..."
for f in src/sql/functions/clear_functions.sql \
         src/sql/functions/project.sql \
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

# 7. Asegurar datos base, usuario admin@inab.gob.gt (contraseña admin123) e institución INAB - SIG
ROLE_COUNT=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT count(*) FROM roles;" 2>/dev/null || echo "0")
if [ "$ROLE_COUNT" = "0" ] || [ -z "$ROLE_COUNT" ]; then
    echo "[INFO] Insertando roles y usuario invitado por defecto..."
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "src/sql/default_data/default_data.sql" || true
fi

HAS_PROJECT=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT count(*) FROM projects;" 2>/dev/null || echo "0")
if [ "$HAS_PROJECT" = "0" ] || [ -z "$HAS_PROJECT" ]; then
    echo "[INFO] Inicializando datos piloto de INAB - SIG..."
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "src/sql/dev_data/dev_data.sql" || true
fi

echo "[INFO] Asegurando credenciales de admin@inab.gob.gt y membresías en INAB - SIG..."
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" <<'EOSQL' || true
-- Sanitizar cualquier contraseña vacía o nula que pudiera romper pgcrypto
UPDATE users SET password = crypt('disabled_guest_password', gen_salt('bf')) WHERE email = 'guest' OR password = '' OR password IS NULL;

-- Asegurar secuencias correctas
SELECT setval(pg_get_serial_sequence('users', 'user_uid'), GREATEST(COALESCE((SELECT MAX(user_uid) FROM users), 1), 1));

-- Crear o actualizar usuario administrador principal admin@inab.gob.gt con contraseña admin123
INSERT INTO users (email, password, administrator, reset_key, verified)
VALUES ('admin@inab.gob.gt', crypt('admin123', gen_salt('bf')), TRUE, NULL, TRUE)
ON CONFLICT (email) DO UPDATE
SET password = crypt('admin123', gen_salt('bf')),
    administrator = TRUE,
    verified = TRUE;

-- Asegurar hash bcrypt para admin@inab.gob.gt en caso de que exista con mayúsculas/espacios
UPDATE users
SET password = crypt('admin123', gen_salt('bf')),
    administrator = TRUE,
    verified = TRUE
WHERE LOWER(TRIM(email)) = 'admin@inab.gob.gt';

-- Marcar todos los usuarios registrados como verificados
UPDATE users SET verified = TRUE WHERE verified = FALSE;

-- Asegurar que exista la institución 1 (INAB - SIG)
INSERT INTO institutions (institution_uid, name, description, url, archived)
VALUES (1, 'INAB - SIG', 'Instituto Nacional de Bosques - Sistema de Información Geográfica', 'https://www.inab.gob.gt', FALSE)
ON CONFLICT (institution_uid) DO UPDATE
SET name = 'INAB - SIG',
    description = 'Instituto Nacional de Bosques - Sistema de Información Geográfica',
    archived = FALSE;

SELECT setval(pg_get_serial_sequence('institutions', 'institution_uid'), GREATEST(COALESCE((SELECT MAX(institution_uid) FROM institutions), 1), 1));

-- Vincular a admin@inab.gob.gt como Administrador (role_rid = 1) de INAB - SIG
INSERT INTO institution_users (institution_rid, user_rid, role_rid)
SELECT 1, user_uid, 1 FROM users WHERE email = 'admin@inab.gob.gt'
ON CONFLICT (institution_rid, user_rid) DO UPDATE SET role_rid = 1;

-- Vincular a cualquier otro usuario registrado a INAB - SIG
INSERT INTO institution_users (institution_rid, user_rid, role_rid)
SELECT 1, user_uid, CASE WHEN administrator THEN 1 ELSE 2 END
FROM users WHERE user_uid > 0 AND email <> 'admin@inab.gob.gt'
ON CONFLICT (institution_rid, user_rid) DO NOTHING;

-- Asegurar capas satelitales base (OpenStreetMap y Esri World Imagery) para los formularios
INSERT INTO imagery (imagery_uid, institution_rid, visibility, title, attribution, extent, source_config, archived)
VALUES
    (1, 1, 'platform'::visibility_type, 'OpenStreetMap', 'OpenStreetMap contributors', NULL, '{"type": "OSM"}'::jsonb, FALSE),
    (2, 1, 'platform'::visibility_type, 'Esri World Imagery (Satélite)', 'Esri, Maxar, Earthstar Geographics', NULL, '{"type": "xyz", "url": "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"}'::jsonb, FALSE),
    (3, 1, 'platform'::visibility_type, 'Google Satélite (Alta Resolución)', 'Google Maps Satellite', NULL, '{"type": "xyz", "url": "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}", "maxZoom": 22}'::jsonb, FALSE),
    (4, 1, 'platform'::visibility_type, 'Google Satélite Híbrido (Rutas y Nombres)', 'Google Maps Hybrid', NULL, '{"type": "xyz", "url": "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}", "maxZoom": 22}'::jsonb, FALSE)
ON CONFLICT (imagery_uid) DO UPDATE
SET title = EXCLUDED.title,
    attribution = EXCLUDED.attribution,
    source_config = EXCLUDED.source_config,
    visibility = 'platform'::visibility_type,
    archived = FALSE;

SELECT setval(pg_get_serial_sequence('imagery', 'imagery_uid'), GREATEST(COALESCE((SELECT MAX(imagery_uid) FROM imagery), 4), 4));

-- Asignar Google Satélite como capa principal por defecto a los proyectos
UPDATE projects SET imagery_rid = 3 WHERE project_uid = 1 OR imagery_rid = 2;

-- Asegurar que las capas de Google Satélite estén vinculadas a project_imagery
INSERT INTO project_imagery (project_rid, imagery_rid)
SELECT 1, 3 WHERE EXISTS (SELECT 1 FROM projects WHERE project_uid = 1)
ON CONFLICT (project_rid, imagery_rid) DO NOTHING;

INSERT INTO project_imagery (project_rid, imagery_rid)
SELECT 1, 4 WHERE EXISTS (SELECT 1 FROM projects WHERE project_uid = 1)
ON CONFLICT (project_rid, imagery_rid) DO NOTHING;

INSERT INTO project_imagery (project_rid, imagery_rid)
SELECT 1, 1 WHERE EXISTS (SELECT 1 FROM projects WHERE project_uid = 1)
ON CONFLICT (project_rid, imagery_rid) DO NOTHING;
EOSQL

LOGIN_OK=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT count(*) FROM check_login('admin@inab.gob.gt', 'admin123');" 2>/dev/null || echo "0")
echo "[INFO] Verificación de login para admin@inab.gob.gt: $LOGIN_OK (1 = OK)"

# 8. Iniciar servidor Ring/Triangulum
echo "[INFO] Iniciando servidor web INAB-SIG en el puerto $HTTP_PORT (modo prod)..."
exec clojure -M:production:server start -p "$HTTP_PORT"
