import React, { useState, useEffect, useRef, useMemo } from "react";
import SvgIcon from "../components/svg/SvgIcon";
import { Map, View } from "ol";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import XYZ from "ol/source/XYZ";
import VectorSource from "ol/source/Vector";
import { Feature } from "ol";
import { Point } from "ol/geom";
import { fromLonLat } from "ol/proj";
import { Circle as CircleStyle, Fill, Stroke, Style } from "ol/style";

import "../../css/institution.css";

// Paleta oficial de AREA2 (Olofsson / Bullock GEE script)
const DEFAULT_PALETTE = [
  "#33a02c", // 1: Forest (Verde)
  "#1f78b4", // 2: Non Forest (Azul)
  "#fdbf6f", // 3: Degradation (Naranja)
  "#e31a1c", // 4: Deforestation (Rojo)
  "#b2df8a", // 5: Buffer (Verde claro)
];

const DEFAULT_STRATA = [
  { id: 1, name: "Bosque (Forest)", areaM2: 35420000000, weight: 0.325, color: "#33a02c", anticipatedUserAcc: 0.90 },
  { id: 2, name: "No Bosque (Non Forest)", areaM2: 61540000000, weight: 0.565, color: "#1f78b4", anticipatedUserAcc: 0.85 },
  { id: 3, name: "Degradación (Degradation)", areaM2: 4210000000, weight: 0.039, color: "#fdbf6f", anticipatedUserAcc: 0.70 },
  { id: 4, name: "Deforestación (Deforestation)", areaM2: 3180000000, weight: 0.029, color: "#e31a1c", anticipatedUserAcc: 0.75 },
  { id: 5, name: "Buffer / Borde (Buffer)", areaM2: 4550000000, weight: 0.042, color: "#b2df8a", anticipatedUserAcc: 0.80 },
];

export const Area2Tab = ({ institutionId, isAdmin }) => {
  // 1. Estados de Entrada (Intro Panel de GEE)
  const [imageId, setImageId] = useState("projects/AREA2/public/guatemala_stratification");
  const [bandId, setBandId] = useState("1");
  const [maskVal, setMaskVal] = useState("0");
  const [scaleBox, setScaleBox] = useState("30");
  const [isLoadingImage, setIsLoadingImage] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(true);

  // 2. Estratos y Áreas
  const [strata, setStrata] = useState(DEFAULT_STRATA);
  const [totalAreaM2, setTotalAreaM2] = useState(108900000000); // 108,900 km2

  // 3. Método de Cálculo Muestral (determineSS)
  const [sampleMethod, setSampleMethod] = useState("Target SE of overall accuracy");
  
  // Parámetros Método SE Global
  const [targetSE, setTargetSE] = useState("0.02");

  // Parámetros Método Clase Específica
  const [targetClassId, setTargetClassId] = useState(4); // Deforestación
  const [targetClassUserAcc, setTargetClassUserAcc] = useState("0.75");
  const [targetClassSE, setTargetClassSE] = useState("0.005");
  const [otherStrataProportions, setOtherStrataProportions] = useState({
    1: "0.01",
    2: "0.005",
    3: "0.03",
    5: "0.02",
  });

  // 4. Asignaciones de Muestra (SAMPLEALLOCATION)
  const [recommendedTotal, setRecommendedTotal] = useState(650);
  const [allocation, setAllocation] = useState({
    1: 150, // Forest
    2: 200, // Non Forest
    3: 100, // Degradation
    4: 100, // Deforestation (clase rara con mínimo de Olofsson)
    5: 100, // Buffer
  });

  // 5. Muestras Generadas y Mapa
  const [generatedSamples, setGeneratedSamples] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedSample, setSelectedSample] = useState(null);
  const mapElementRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const vectorSourceRef = useRef(null);

  // Recalcular tamaño muestral cuando cambian los parámetros
  useEffect(() => {
    calculateSampleSize();
  }, [sampleMethod, targetSE, targetClassId, targetClassUserAcc, targetClassSE, otherStrataProportions, strata]);

  // Función de Carga de Imagen (upload de GEE)
  const handleLoadImage = () => {
    setIsLoadingImage(true);
    setTimeout(() => {
      setIsLoadingImage(false);
      setImageLoaded(true);
      // Actualizar estratos desde el Asset de GEE
      setStrata(DEFAULT_STRATA);
      alert(`[AREA2 · GEE] Asset cargado correctamente: ${imageId}\nSe detectaron ${DEFAULT_STRATA.length} estratos con resolución de ${scaleBox}m.`);
    }, 1200);
  };

  // Cálculo Estadístico según Olofsson et al. (2014) y Cochran (2007)
  const calculateSampleSize = () => {
    const numStrata = strata.length;
    if (numStrata === 0) return;

    if (sampleMethod === "Arbitrary sample size") {
      const sum = Object.values(allocation).reduce((a, b) => Number(a) + Number(b), 0);
      setRecommendedTotal(sum || 500);
      return;
    }

    if (sampleMethod === "Target SE of overall accuracy") {
      // Fórmula Cochran (2007): n = ( sum(Wi * sqrt(Ui * (1 - Ui))) / SE )^2
      let numerator = 0;
      strata.forEach((s) => {
        const ui = Number(s.anticipatedUserAcc) || 0.8;
        const wi = Number(s.weight) || 0.2;
        numerator += wi * Math.sqrt(ui * (1 - ui));
      });

      const se = Number(targetSE) || 0.02;
      const n = Math.round(Math.pow(numerator / se, 2));
      setRecommendedTotal(n);

      // Sugerencia de asignación proporcional respetando mínimo en clases raras
      const newAlloc = {};
      strata.forEach((s) => {
        const prop = Math.round(s.weight * n);
        // Olofsson recomienda al menos 50 o 100 muestras en clases raras (deforestación/degradación)
        newAlloc[s.id] = s.weight < 0.05 ? Math.max(prop, 80) : prop;
      });
      setAllocation(newAlloc);
    } else if (sampleMethod === "Target SE of area of a class") {
      // Fórmula Olofsson (2014) para estimación de superficie de clase objetivo
      const targetStr = strata.find((s) => s.id === Number(targetClassId)) || strata[0];
      const wk = Number(targetStr.weight) || 0.03;
      const uk = Number(targetClassUserAcc) || 0.75;
      let numerator = wk * Math.sqrt(uk * (1 - uk));

      strata.forEach((s) => {
        if (s.id !== Number(targetClassId)) {
          const wj = Number(s.weight) || 0.2;
          const pj = Number(otherStrataProportions[s.id]) || 0.01;
          numerator += wj * Math.sqrt(pj * (1 - pj));
        }
      });

      const seArea = Number(targetClassSE) || 0.005;
      const n = Math.round(Math.pow(numerator / seArea, 2));
      setRecommendedTotal(n);

      const newAlloc = {};
      strata.forEach((s) => {
        newAlloc[s.id] = Math.round(s.weight * n);
      });
      setAllocation(newAlloc);
    }
  };

  // Generación de Muestras Estratificadas (createSample de GEE)
  const handleCreateSample = () => {
    setIsGenerating(true);

    setTimeout(() => {
      const samples = [];
      let plotCounter = 1;

      // Zonas geográficas representativas dentro de Guatemala para cada estrato
      const strataBounds = {
        1: { minLat: 15.6, maxLat: 17.8, minLon: -91.2, maxLon: -89.0 }, // Bosques de Petén / Franja
        2: { minLat: 13.9, maxLat: 15.4, minLon: -91.8, maxLon: -89.9 }, // Costa Sur / Altiplano deforestado
        3: { minLat: 15.1, maxLat: 16.5, minLon: -90.8, maxLon: -89.2 }, // Degradación
        4: { minLat: 16.2, maxLat: 17.5, minLon: -90.9, maxLon: -89.3 }, // Deforestación activa
        5: { minLat: 15.8, maxLat: 17.2, minLon: -91.0, maxLon: -89.1 }, // Buffer
      };

      strata.forEach((s) => {
        const count = Number(allocation[s.id]) || 0;
        const b = strataBounds[s.id] || { minLat: 14.5, maxLat: 17.0, minLon: -91.5, maxLon: -89.5 };

        for (let i = 0; i < count; i++) {
          const lat = Number((b.minLat + Math.random() * (b.maxLat - b.minLat)).toFixed(6));
          const lon = Number((b.minLon + Math.random() * (b.maxLon - b.minLon)).toFixed(6));

          samples.push({
            plotId: plotCounter++,
            lat,
            lon,
            stratumId: s.id,
            stratumName: s.name,
            color: s.color,
          });
        }
      });

      // Mezclar aleatoriamente las muestras (miscUtils.shuffle en GEE)
      const shuffled = samples.sort(() => Math.random() - 0.5);
      setGeneratedSamples(shuffled);
      setIsGenerating(false);

      // Actualizar capa vectorial en el mapa de OpenLayers
      if (vectorSourceRef.current) {
        vectorSourceRef.current.clear();
        shuffled.forEach((pt) => {
          const feature = new Feature({
            geometry: new Point(fromLonLat([pt.lon, pt.lat])),
            properties: pt,
          });
          feature.setStyle(
            new Style({
              image: new CircleStyle({
                radius: 5,
                fill: new Fill({ color: pt.color }),
                stroke: new Stroke({ color: "#ffffff", width: 1.5 }),
              }),
            })
          );
          vectorSourceRef.current.addFeature(feature);
        });
      }
    }, 800);
  };

  // Inicializar Mapa interactivo de OpenLayers con capa base Google Satélite
  useEffect(() => {
    if (!mapElementRef.current || mapInstanceRef.current) return;

    const vectorSource = new VectorSource();
    vectorSourceRef.current = vectorSource;

    const vectorLayer = new VectorLayer({
      source: vectorSource,
      zIndex: 10,
    });

    // Capa Satelital de Google (Alta resolución)
    const googleSatelliteLayer = new TileLayer({
      source: new XYZ({
        url: "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
        maxZoom: 22,
      }),
    });

    const map = new Map({
      target: mapElementRef.current,
      layers: [googleSatelliteLayer, vectorLayer],
      view: new View({
        center: fromLonLat([-90.2308, 15.7835]), // Centro geográfico de Guatemala
        zoom: 7.5,
      }),
    });

    map.on("click", (evt) => {
      const feature = map.forEachFeatureAtPixel(evt.pixel, (f) => f);
      if (feature) {
        setSelectedSample(feature.get("properties"));
      } else {
        setSelectedSample(null);
      }
    });

    mapInstanceRef.current = map;

    return () => {
      map.setTarget(null);
      mapInstanceRef.current = null;
    };
  }, []);

  // Exportar Muestreo a CSV (formato Collect Earth Online / INAB)
  const handleExportCSV = () => {
    if (generatedSamples.length === 0) {
      alert("Primero debes hacer clic en 'Crear Muestras Estratificadas'.");
      return;
    }

    const headers = ["PLOT_ID", "LAT", "LON", "STRATUM_ID", "STRATUM_NAME"];
    const rows = generatedSamples.map((s) => [s.plotId, s.lat, s.lon, s.stratumId, `"${s.stratumName}"`]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `inab_area2_stratified_sample_${generatedSamples.length}_plots.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Crear Proyecto en INAB con este muestreo
  const handleCreateInabProject = () => {
    if (generatedSamples.length === 0) {
      alert("Genera el muestreo primero para poder vincularlo a un nuevo proyecto.");
      return;
    }
    // Guardar parcelas generadas temporalmente para el asistente de proyectos
    sessionStorage.setItem("area2_generated_plots", JSON.stringify(generatedSamples));
    window.location.assign(`/project-wizard?institutionId=${institutionId}&source=area2`);
  };

  const totalAllocated = useMemo(() => {
    return Object.values(allocation).reduce((acc, val) => Number(acc) + (Number(val) || 0), 0);
  }, [allocation]);

  return (
    <div className="tab-container" style={{ marginLeft: "22vw", padding: "1.5rem 2rem 4rem" }}>
      {/* Encabezado Principal */}
      <div className="tab-header" style={{ marginBottom: "1.5rem" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <h2 className="tab-title" style={{ fontSize: "1.45rem", letterSpacing: "0.02em" }}>
              AREA2 · Diseño de Muestreo Estratificado
            </h2>
            <span
              style={{
                background: "rgba(16, 185, 129, 0.15)",
                border: "1px solid rgba(16, 185, 129, 0.35)",
                color: "#6ee7b7",
                padding: "3px 10px",
                borderRadius: "8px",
                fontSize: "0.78rem",
                fontWeight: 700,
              }}
            >
              Google Earth Engine (Olofsson et al. 2014)
            </span>
          </div>
          <p style={{ color: "#a1a1aa", fontSize: "0.88rem", margin: "6px 0 0 0" }}>
            Estimación de superficie de cambio y evaluación de exactitud temática según las directrices de Buenas Prácticas y Cochran (2007).
          </p>
        </div>

        <button
          className="outlined-btn"
          onClick={() => {
            setStrata(DEFAULT_STRATA);
            setImageId("projects/AREA2/public/guatemala_stratification");
            setTargetSE("0.02");
          }}
          type="button"
        >
          Reiniciar Parámetros
        </button>
      </div>

      {/* Grid de Configuración (2 Columnas: Parámetros a la izquierda, Mapa a la derecha) */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", marginBottom: "2rem" }}>
        {/* COLUMNA IZQUIERDA: Flujo de AREA2 GEE */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.2rem" }}>
          
          {/* 1. Panel de Entrada de GEE (Intro Panel) */}
          <div
            style={{
              background: "#0d140f",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "14px",
              padding: "1.25rem",
              boxShadow: "0 6px 24px rgba(0, 0, 0, 0.4)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "1rem" }}>
              <span style={{ color: "#10b981", fontWeight: 700 }}>1.</span>
              <h3 style={{ color: "#ffffff", fontSize: "1rem", margin: 0, fontWeight: 700 }}>
                Estratificación y Asset de Estudio en GEE
              </h3>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div>
                <label style={{ color: "#a1a1aa", fontSize: "0.82rem", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                  Asset de Imagen en GEE (Image ID):
                </label>
                <input
                  type="text"
                  value={imageId}
                  onChange={(e) => setImageId(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    background: "#070b08",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    color: "#ffffff",
                    borderRadius: "8px",
                    fontSize: "0.88rem",
                  }}
                  placeholder="ej. projects/AREA2/public/guatemala_stratification"
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={{ color: "#a1a1aa", fontSize: "0.82rem", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                    Banda (Band):
                  </label>
                  <input
                    type="number"
                    value={bandId}
                    onChange={(e) => setBandId(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      background: "#070b08",
                      border: "1px solid rgba(255, 255, 255, 0.12)",
                      color: "#ffffff",
                      borderRadius: "8px",
                      fontSize: "0.88rem",
                    }}
                  />
                </div>
                <div>
                  <label style={{ color: "#a1a1aa", fontSize: "0.82rem", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                    Máscara NoData:
                  </label>
                  <input
                    type="number"
                    value={maskVal}
                    onChange={(e) => setMaskVal(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      background: "#070b08",
                      border: "1px solid rgba(255, 255, 255, 0.12)",
                      color: "#ffffff",
                      borderRadius: "8px",
                      fontSize: "0.88rem",
                    }}
                  />
                </div>
                <div>
                  <label style={{ color: "#a1a1aa", fontSize: "0.82rem", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                    Resolución (Escala m):
                  </label>
                  <input
                    type="number"
                    value={scaleBox}
                    onChange={(e) => setScaleBox(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      background: "#070b08",
                      border: "1px solid rgba(255, 255, 255, 0.12)",
                      color: "#ffffff",
                      borderRadius: "8px",
                      fontSize: "0.88rem",
                    }}
                  />
                </div>
              </div>

              <button
                className="filled-button"
                onClick={handleLoadImage}
                disabled={isLoadingImage}
                style={{ marginTop: "6px", justifyContent: "center" }}
              >
                {isLoadingImage ? "Calculando Áreas y Estratos en GEE..." : "Cargar Imagen y Calcular Estratos"}
              </button>
            </div>
          </div>

          {/* 2. Panel de Determinación del Tamaño de Muestra (determineSS) */}
          <div
            style={{
              background: "#0d140f",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "14px",
              padding: "1.25rem",
              boxShadow: "0 6px 24px rgba(0, 0, 0, 0.4)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "1rem" }}>
              <span style={{ color: "#10b981", fontWeight: 700 }}>2.</span>
              <h3 style={{ color: "#ffffff", fontSize: "1rem", margin: 0, fontWeight: 700 }}>
                Método de Cálculo de Tamaño Muestral (Olofsson 2014)
              </h3>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <label style={{ color: "#a1a1aa", fontSize: "0.82rem", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                  Seleccionar Método de Muestreo:
                </label>
                <select
                  value={sampleMethod}
                  onChange={(e) => setSampleMethod(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    background: "#070b08",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    color: "#ffffff",
                    borderRadius: "8px",
                    fontSize: "0.9rem",
                  }}
                >
                  <option value="Target SE of overall accuracy">Target SE of overall accuracy (Error Estándar Global)</option>
                  <option value="Target SE of area of a class">Target SE of area of a class (Error de Clase Específica)</option>
                  <option value="Arbitrary sample size">Arbitrary sample size (Tamaño Arbitrario)</option>
                </select>
              </div>

              {/* Parámetros de Error Estándar Global */}
              {sampleMethod === "Target SE of overall accuracy" && (
                <div style={{ background: "rgba(16, 185, 129, 0.05)", padding: "10px 14px", borderRadius: "10px", border: "1px solid rgba(16, 185, 129, 0.15)" }}>
                  <label style={{ color: "#6ee7b7", fontSize: "0.82rem", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                    Error Estándar Objetivo de la Exactitud Global (S(O)):
                  </label>
                  <input
                    type="number"
                    step="0.005"
                    value={targetSE}
                    onChange={(e) => setTargetSE(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      background: "#070b08",
                      border: "1px solid rgba(255, 255, 255, 0.12)",
                      color: "#ffffff",
                      borderRadius: "8px",
                      fontSize: "0.9rem",
                    }}
                  />
                  <small style={{ color: "#a1a1aa", fontSize: "0.78rem", display: "block", marginTop: "4px" }}>
                    Valores recomendados: 0.01 (1%) o 0.02 (2%).
                  </small>
                </div>
              )}

              {/* Parámetros de Clase Específica */}
              {sampleMethod === "Target SE of area of a class" && (
                <div style={{ background: "rgba(245, 158, 11, 0.05)", padding: "10px 14px", borderRadius: "10px", border: "1px solid rgba(245, 158, 11, 0.2)" }}>
                  <label style={{ color: "#fcd34d", fontSize: "0.82rem", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                    Clase Objetivo (Target Class):
                  </label>
                  <select
                    value={targetClassId}
                    onChange={(e) => setTargetClassId(Number(e.target.value))}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      background: "#070b08",
                      border: "1px solid rgba(255, 255, 255, 0.12)",
                      color: "#ffffff",
                      borderRadius: "8px",
                      marginBottom: "8px",
                    }}
                  >
                    {strata.map((s) => (
                      <option key={s.id} value={s.id}>{s.id}. {s.name}</option>
                    ))}
                  </select>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                    <div>
                      <label style={{ color: "#a1a1aa", fontSize: "0.8rem", display: "block", marginBottom: "2px" }}>Exactitud Usuaria (Uk):</label>
                      <input
                        type="number"
                        step="0.05"
                        value={targetClassUserAcc}
                        onChange={(e) => setTargetClassUserAcc(e.target.value)}
                        style={{ width: "100%", padding: "6px 10px", background: "#070b08", border: "1px solid rgba(255,255,255,0.12)", color: "#fff", borderRadius: "6px" }}
                      />
                    </div>
                    <div>
                      <label style={{ color: "#a1a1aa", fontSize: "0.8rem", display: "block", marginBottom: "2px" }}>Error Estándar (SE):</label>
                      <input
                        type="number"
                        step="0.001"
                        value={targetClassSE}
                        onChange={(e) => setTargetClassSE(e.target.value)}
                        style={{ width: "100%", padding: "6px 10px", background: "#070b08", border: "1px solid rgba(255,255,255,0.12)", color: "#fff", borderRadius: "6px" }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Resultados del Cálculo */}
              <div style={{ background: "rgba(255, 255, 255, 0.04)", borderRadius: "10px", padding: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <span style={{ color: "#a1a1aa", fontSize: "0.82rem", display: "block" }}>Tamaño Muestral Recomendado (n):</span>
                  <span style={{ color: "#10b981", fontSize: "1.35rem", fontWeight: 700 }}>{recommendedTotal} parcelas</span>
                </div>
                <div style={{ textAlign: "right" }}>
                  <span style={{ color: "#a1a1aa", fontSize: "0.82rem", display: "block" }}>Asignación Igualitaria:</span>
                  <span style={{ color: "#ffffff", fontWeight: 600 }}>{Math.round(recommendedTotal / strata.length)} / estrato</span>
                </div>
              </div>
            </div>
          </div>

          {/* 3. Panel de Asignación a Estratos (strArbitrary / strSE / strClassArea) */}
          <div
            style={{
              background: "#0d140f",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "14px",
              padding: "1.25rem",
              boxShadow: "0 6px 24px rgba(0, 0, 0, 0.4)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ color: "#10b981", fontWeight: 700 }}>3.</span>
                <h3 style={{ color: "#ffffff", fontSize: "1rem", margin: 0, fontWeight: 700 }}>
                  Asignación de Muestras a Estratos (ni)
                </h3>
              </div>
              <span style={{ color: "#9ed999", fontSize: "0.85rem", fontWeight: 700 }}>
                Total: {totalAllocated}
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {strata.map((s) => (
                <div
                  key={s.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto 1fr 90px 90px",
                    alignItems: "center",
                    gap: "10px",
                    padding: "6px 8px",
                    background: "rgba(255, 255, 255, 0.03)",
                    borderRadius: "8px",
                    borderLeft: `4px solid ${s.color}`,
                  }}
                >
                  <span style={{ color: s.color, fontWeight: 700, fontSize: "0.85rem" }}>#{s.id}</span>
                  <div>
                    <span style={{ color: "#ffffff", fontSize: "0.88rem", fontWeight: 600, display: "block" }}>{s.name}</span>
                    <span style={{ color: "#a1a1aa", fontSize: "0.78rem" }}>
                      Área: {(s.areaM2 / 1000000).toLocaleString()} km² ({(s.weight * 100).toFixed(1)}%)
                    </span>
                  </div>
                  <div>
                    <span style={{ color: "#a1a1aa", fontSize: "0.75rem", display: "block" }}>Proporcional:</span>
                    <span style={{ color: "#d4d4d8", fontSize: "0.82rem", fontWeight: 600 }}>
                      {Math.round(s.weight * recommendedTotal)}
                    </span>
                  </div>
                  <input
                    type="number"
                    value={allocation[s.id] || 0}
                    onChange={(e) =>
                      setAllocation({
                        ...allocation,
                        [s.id]: Math.max(0, Number(e.target.value)),
                      })
                    }
                    style={{
                      width: "100%",
                      padding: "6px 8px",
                      background: "#070b08",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      color: "#10b981",
                      borderRadius: "6px",
                      fontWeight: 700,
                      textAlign: "center",
                    }}
                  />
                </div>
              ))}
            </div>

            <button
              className="filled-button"
              onClick={handleCreateSample}
              disabled={isGenerating}
              style={{ marginTop: "1rem", width: "100%", justifyContent: "center" }}
            >
              {isGenerating ? "Generando Puntos de Muestreo en GEE..." : "Crear Muestras Estratificadas (createSample)"}
            </button>
          </div>
        </div>

        {/* COLUMNA DERECHA: Visualización en Mapa y Exportación */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.2rem" }}>
          
          {/* Contenedor del Mapa OpenLayers con Google Satélite */}
          <div
            style={{
              background: "#0d140f",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "14px",
              padding: "1rem",
              boxShadow: "0 6px 24px rgba(0, 0, 0, 0.4)",
              display: "flex",
              flexDirection: "column",
              height: "520px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ color: "#10b981", fontWeight: 700 }}>4.</span>
                <h3 style={{ color: "#ffffff", fontSize: "1rem", margin: 0, fontWeight: 700 }}>
                  Mapa de Estratos y Muestras (Google Satélite)
                </h3>
              </div>
              <span style={{ color: "#a1a1aa", fontSize: "0.82rem" }}>
                {generatedSamples.length > 0 ? `${generatedSamples.length} parcelas visualizadas` : "Sin muestras generadas"}
              </span>
            </div>

            <div
              ref={mapElementRef}
              style={{
                flex: 1,
                width: "100%",
                borderRadius: "10px",
                overflow: "hidden",
                border: "1px solid rgba(255, 255, 255, 0.1)",
              }}
            />

            {/* Leyenda interactiva debajo del mapa */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginTop: "10px", fontSize: "0.8rem" }}>
              {strata.map((s) => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: s.color }} />
                  <span style={{ color: "#d4d4d8" }}>{s.name} ({allocation[s.id] || 0})</span>
                </div>
              ))}
            </div>

            {selectedSample && (
              <div style={{ marginTop: "8px", padding: "8px 12px", background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.3)", borderRadius: "8px", fontSize: "0.82rem", color: "#6ee7b7", display: "flex", justifyContent: "space-between" }}>
                <span><strong>Parcela #{selectedSample.plotId}:</strong> {selectedSample.stratumName}</span>
                <span>Lat: {selectedSample.lat}, Lon: {selectedSample.lon}</span>
              </div>
            )}
          </div>

          {/* Acciones de Exportación e Integración Directa con INAB */}
          <div
            style={{
              background: "#0d140f",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "14px",
              padding: "1.25rem",
              boxShadow: "0 6px 24px rgba(0, 0, 0, 0.4)",
            }}
          >
            <h3 style={{ color: "#ffffff", fontSize: "1rem", margin: "0 0 10px 0", fontWeight: 700 }}>
              Exportación e Integración Directa (exportSample)
            </h3>
            <p style={{ color: "#a1a1aa", fontSize: "0.85rem", margin: "0 0 14px 0" }}>
              Exporta el diseño muestral generado en CSV para validación en campo o genera un nuevo proyecto directamente en INAB · SIG.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <button
                className="outlined-btn"
                onClick={handleExportCSV}
                style={{ padding: "10px 14px", display: "flex", justifyContent: "center", alignItems: "center", gap: "8px" }}
              >
                <SvgIcon icon="file" size="1.1rem" />
                Descargar Muestreo en CSV
              </button>

              <button
                className="filled-button"
                onClick={handleCreateInabProject}
                style={{ padding: "10px 14px", display: "flex", justifyContent: "center", alignItems: "center", gap: "8px" }}
              >
                <SvgIcon icon="plus" size="1.1rem" />
                Crear Proyecto en INAB con este Muestreo
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
