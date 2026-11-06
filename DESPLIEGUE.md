# 🌲 Guía de Despliegue y Operación - INAB · SIG

Plataforma de validación espacial, fotointerpretación y monitoreo de cobertura forestal del **Instituto Nacional de Bosques (INAB) - Sistema de Información Geográfica (SIG)**.

---

## 🚀 1. Despliegue Rápido con Docker (Recomendado)

La forma más rápida y estandarizada de levantar la plataforma completa (PostGIS + Backend Clojure + Frontend React + Assets compilados) es mediante Docker Compose.

### Requisitos Previos:
- [Docker](https://docs.docker.com/get-docker/) (v20.10+)
- [Docker Compose](https://docs.docker.com/compose/) (v2.0+)

### Pasos para Iniciar:

```bash
# 1. Clonar el repositorio
git clone https://github.com/magomistico/collect-earth-online.git inab-validacion
cd inab-validacion

# 2. (Opcional) Copiar variables de entorno
cp .env.example .env

# 3. Construir y levantar los contenedores
docker compose up --build -d
```

### ¿Qué hace automáticamente el contenedor?
1. **Base de Datos PostGIS:** Inicia PostgreSQL 15 con PostGIS 3.3 y la extensión criptográfica `pgcrypto`.
2. **Migración Automática:** Detecta que la base de datos es nueva y ejecuta `clojure -M:build-db build-all --dev-data`, creando todas las tablas, esquemas y funciones espaciales.
3. **Carga Institucional INAB-SIG:** Carga la institución *INAB - SIG*, usuarios técnicos de prueba, el proyecto de validación nacional centrado en Guatemala y las parcelas de muestreo (Petén, Altiplano y Costa Sur).
4. **Servidor Web:** Inicia el servicio en el puerto `8080`.

La plataforma estará lista en:
👉 **`http://localhost:8080`**

---

## 👥 2. Credenciales Preconfiguradas

La base de datos viene precargada con tres usuarios para pruebas y validaciones iniciales:

| Rol | Correo Electrónico | Contraseña | Permisos |
| :--- | :--- | :--- | :--- |
| **Administrador SIG** | `admin@inab.gob.gt` | `password123` | Control total, creación de proyectos y capas |
| **Técnico Validador** | `tecnico@inab.gob.gt` | `password123` | Fotointerpretación, etiquetado de parcelas |
| **Técnico de Monitoreo** | `sig@inab.gob.gt` | `password123` | Consulta y validación de campo |

> [!TIP]
> Se recomienda cambiar las contraseñas en el menú **Cuenta** (`/account`) o actualizar la llave secreta de sesión en `.env` para entornos de producción oficial.

---

## 🗺️ 3. Conexión Directa desde QGIS

Al estar levantado el servicio `db` en el puerto `5432`, los técnicos del INAB pueden conectar **QGIS** u otras herramientas SIG de escritorio directamente:

- **Host:** `localhost` (o la IP del servidor)
- **Port:** `5432`
- **Database:** `ceo`
- **User:** `ceo`
- **Password:** `ceo_secret_password`

### Tablas Principales Disponibles:
- `projects`: Proyectos y áreas de interés (AOI) poligonales.
- `plots`: Parcelas de validación (`plot_geom` en EPSG:4326).
- `samples`: Puntos de muestreo internos por parcela (`sample_geom` en EPSG:4326).
- `user_plots`: Historial de parcelas validadas por usuario y fecha.
- `imagery`: Capas satelitales configuradas.

---

## 🛰️ 4. Configuración de Capas Satelitales y WMS de Guatemala

La plataforma incluye capas base gratuitas de **OpenStreetMap** y **Esri World Imagery (Satélite de Alta Resolución)**.

Para añadir servicios de mapas de Guatemala (IDEG, Geoportal INAB o Planet NICFI):
1. Iniciar sesión como `admin@inab.gob.gt`.
2. Ir a **Panel Institucional** (`/institution-dashboard?institutionId=1`).
3. En la sección **Imagery Services**:
   - **WMS / WMTS:** Añadir la URL de la capa del Geoportal INAB o IDEG.
   - **Planet NICFI:** Introducir la API Key gratuita para los mosaicos tropicales mensuales de alta resolución de Noruega/Planet.

---

## 🛠️ 5. Desarrollo e Instalación Local (Sin Docker)

Si se desea ejecutar en modo de desarrollo local:

### Requisitos:
- Java JDK 17
- Clojure CLI tools (1.11+)
- Node.js 18+ o 20+ y `pnpm`
- PostgreSQL 12+ con PostGIS 3.2+
- Python 3

### Comandos:
```bash
# Instalar dependencias JS y compilar Frontend
pnpm install --allow-build esbuild --allow-build quick-lint-js
pnpm run vite-prod

# Configurar Base de Datos
cp config.example.edn config.edn
clojure -M:build-db build-all --dev-data

# Iniciar Servidor Backend
clojure -M:production:server start -p 8080
```

---

## 🛑 6. Comandos de Mantenimiento Docker

```bash
# Ver registros en tiempo real
docker compose logs -f app

# Detener los contenedores
docker compose stop

# Reiniciar los contenedores
docker compose start

# Destruir contenedores (conservando los datos de la base de datos)
docker compose down

# Destruir contenedores y resetear base de datos desde cero
docker compose down -v
```
