# 🌲 INAB · SIG - Plataforma de Validación Forestal

> Sistema de Información Geográfica del **Instituto Nacional de Bosques (INAB) de Guatemala** para la interpretación visual, fotointerpretación y validación espacial de cobertura forestal y uso de la tierra sobre imágenes satelitales de alta resolución.

![Licencia MIT](https://img.shields.io/badge/licencia-MIT-green.svg)
![PostGIS](https://img.shields.io/badge/PostGIS-3.3+-blue.svg)
![Clojure](https://img.shields.io/badge/Clojure-1.11+-purple.svg)
![React](https://img.shields.io/badge/React-17-cyan.svg)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg)

---

## ✨ Características Principales

- **Identidad INAB-SIG:** Portada institucional con emblema interactivo y navegación adaptada para la gestión forestal guatemalteca.
- **Centrado Espacial en Guatemala:** Mapas base, visores y proyectos configurados por defecto sobre el territorio nacional (`-90.25, 15.78`).
- **Formularios de Validación Nacionales:** Categorías de cobertura forestal (Latifoliado, Coníferas, Mixto, Mangle, Humedal, etc.), deforestación y porcentaje de copa.
- **Conectividad SIG:** Compatibilidad directa con **QGIS** a través de PostGIS para consulta y exportación de datos vectoriales.
- **Soporte Multi-Sensor:** Integración con OpenStreetMap, Esri World Imagery, capas WMS/WMTS del Geoportal INAB/IDEG y mosaicos Planet NICFI.
- **Despliegue con un Solo Comando:** Listo para producción y pruebas locales mediante Docker Compose.

---

## 🚀 Inicio Rápido (Docker)

```bash
# Clonar el repositorio
git clone https://github.com/magomistico/collect-earth-online.git
cd collect-earth-online

# Levantar con Docker Compose
docker compose up --build -d
```

Abre en tu navegador:
👉 **[http://localhost:8080](http://localhost:8080)**

Para más detalles sobre credenciales, configuración de capas WMS y conexión con QGIS, consulta la **[Guía Completa de Despliegue (DESPLIEGUE.md)](DESPLIEGUE.md)**.

---

## 👥 Credenciales de Prueba

- **Administrador:** `admin@inab.gob.gt` / `password123`
- **Técnico Validador:** `tecnico@inab.gob.gt` / `password123`
- **Técnico SIG:** `sig@inab.gob.gt` / `password123`

---

## 📄 Licencia y Atribución

Este proyecto es una adaptación y especialización institucional para **INAB-SIG** basada en el software de código abierto **Collect Earth Online (CEO)**, desarrollado originalmente por la **Organización de las Naciones Unidas para la Alimentación y la Agricultura (FAO)** y el **Spatial Informatics Group (SIG)**.

Distribuido bajo los términos de la **Licencia MIT**. Consulta el archivo [LICENSE](LICENSE) para más detalles.
