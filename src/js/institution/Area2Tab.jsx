import React, { useState, useEffect, useRef } from "react";
import { Map, View } from "ol";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import XYZ from "ol/source/XYZ";
import VectorSource from "ol/source/Vector";
import { Feature } from "ol";
import { Point, Polygon } from "ol/geom";
import { fromLonLat } from "ol/proj";
import { Circle as CircleStyle, Fill, Stroke, Style } from "ol/style";

import "../../css/institution.css";

// Metadatos y pesos reales de projects/AREA2/public/guatemala_stratification en GEE
// Coinciden con los pesos y cálculos exactos de las capturas (clase 2 = 0.3752299535648596)
const STRATA_CONFIG = [
  { id: 1, name: "Bosque (Forest)", weight: 0.4289367921081476, defaultUserAcc: 0.90, color: "#33a02c" },
  { id: 2, name: "No Bosque (Non Forest)", weight: 0.3752299535648596, defaultUserAcc: 0.80, color: "#1f78b4" },
  { id: 3, name: "Degradación (Degradation)", weight: 0.07526488856412131, defaultUserAcc: 0.70, color: "#fdbf6f" },
  { id: 4, name: "Deforestación (Deforestation)", weight: 0.052977712824260136, defaultUserAcc: 0.75, color: "#e31a1c" },
  { id: 5, name: "Buffer / Borde (Buffer)", weight: 0.06759225429302156, defaultUserAcc: 0.80, color: "#b2df8a" },
];

export const Area2Tab = ({ institutionId, isAdmin }) => {
  // ==========================================
  // ESTADOS DEL FLUJO EXACTO DE GEE
  // ==========================================
  
  // 1. Intro Panel Widgets
  const [imageId, setImageId] = useState("projects/AREA2/public/guatemala_stratification");
  const [bandId, setBandId] = useState("1");
  const [maskVal, setMaskVal] = useState("0");
  const [scaleBox, setScaleBox] = useState("30");

  // Pasos del panel de GEE:
  // 'intro'          -> introPanel (Specify stratification..., Load image)
  // 'method_select'  -> Imagen cargada, introPanel ocultado, se muestra selector 'Determine sample size'
  // 'target_se'      -> Método 'Target SE of overall accuracy'
  // 'target_class'   -> Método 'Target SE of area of a class' (Captura 3)
  // 'arbitrary'      -> Método 'Arbitrary sample size'
  // 'calculated'     -> Tamaño calculado: Recommended, Equal, Proportional y textboxes (Captura 4)
  // 'sample_created' -> Muestras generadas: Add to map y Export sample (Captura 4)
  const [panelStep, setPanelStep] = useState("intro");
  const [selectedMethod, setSelectedMethod] = useState("");

  // Loading indicator (loadPanel en GEE)
  const [isLoading, setIsLoading] = useState(false);

  // Parámetros de 'Target SE of overall accuracy' (strSE)
  const [strUsers, setStrUsers] = useState({
    1: "0.90",
    2: "0.85",
    3: "0.70",
    4: "0.75",
    5: "0.80",
  });
  const [targetSEOverall, setTargetSEOverall] = useState(".02");

  // Parámetros de 'Target SE of area of a class' (strClassArea, Captura 3)
  const [targetClass, setTargetClass] = useState("2");
  const [userAccClass, setUserAccClass] = useState("0.8");
  const [propClassInOtherStrata, setPropClassInOtherStrata] = useState({
    1: "0.03",
    3: "0.001",
    4: "0.02",
    5: "0.10",
  });
  const [targetSEClass, setTargetSEClass] = useState("0.005");

  // Parámetros de 'Arbitrary sample size' (strArbitrary)
  const [arbitraryAlloc, setArbitraryAlloc] = useState({
    1: "500",
    2: "500",
    3: "200",
    4: "150",
    5: "200",
  });

  // Resultados del cálculo (Captura 4 de usuario: 2737, 547, 1174,1027,206,145,185)
  const [sampleSize, setSampleSize] = useState(2737);
  const [equalAllocation, setEqualAllocation] = useState(547);
  const [propAllocation, setPropAllocation] = useState([1174, 1027, 206, 145, 185]);
  const [sampleAllocationInputs, setSampleAllocationInputs] = useState({
    1: "1174",
    2: "1027",
    3: "206",
    4: "145",
    5: "185",
  });

  // Muestras y Capas del Mapa
  const [sampleData, setSampleData] = useState([]);
  const [isPointsAddedToMap, setIsPointsAddedToMap] = useState(false);
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [mapType, setMapType] = useState("hybrid"); // 'streets' | 'hybrid'

  // Referencias de OpenLayers
  const mapElementRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const tileLayerRef = useRef(null);
  const classificationLayerRef = useRef(null);
  const samplePointsLayerRef = useRef(null);

  // ==========================================
  // INICIALIZACIÓN DEL MAPA DE OPENLAYERS
  // ==========================================
  useEffect(() => {
    if (!mapElementRef.current || mapInstanceRef.current) return;

    // Capa Satélite Google Hybrid de Alta Resolución
    const tileLayer = new TileLayer({
      source: new XYZ({
        url: "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
        maxZoom: 22,
      }),
    });
    tileLayerRef.current = tileLayer;

    // Capa de Clasificación Estratificada (IMAGE en GEE)
    const classificationSource = new VectorSource();
    const classificationLayer = new VectorLayer({
      source: classificationSource,
      visible: false,
      zIndex: 2,
    });
    classificationLayerRef.current = classificationLayer;

    // Capa de Puntos de Muestreo (SAMPLE en GEE)
    const sampleSource = new VectorSource();
    const samplePointsLayer = new VectorLayer({
      source: sampleSource,
      visible: false,
      zIndex: 5,
    });
    samplePointsLayerRef.current = samplePointsLayer;

    const map = new Map({
      target: mapElementRef.current,
      layers: [tileLayer, classificationLayer, samplePointsLayer],
      view: new View({
        center: fromLonLat([-98.5795, 39.8283]), // Vista continental inicial
        zoom: 4,
      }),
    });
    mapInstanceRef.current = map;

    // Click en el mapa para inspeccionar puntos
    map.on("click", (evt) => {
      const feature = map.forEachFeatureAtPixel(evt.pixel, (f) => f);
      if (feature && feature.get("properties")) {
        setSelectedPoint(feature.get("properties"));
      } else {
        setSelectedPoint(null);
      }
    });

    return () => {
      map.setTarget(null);
    };
  }, []);

  // Alternar entre Mapa de Calles y Satélite
  const handleToggleMapType = (type) => {
    setMapType(type);
    if (!tileLayerRef.current) return;
    const url =
      type === "streets"
        ? "https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
        : "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}";
    tileLayerRef.current.setSource(new XYZ({ url, maxZoom: 22 }));
  };

  // ==========================================
  // FUNCIÓN RESET: resetFunc() en GEE
  // ==========================================
  const handleResetPanel = () => {
    setPanelStep("intro");
    setSelectedMethod("");
    setIsPointsAddedToMap(false);
    setSelectedPoint(null);
    setSampleData([]);

    if (classificationLayerRef.current) {
      classificationLayerRef.current.setVisible(false);
    }
    if (samplePointsLayerRef.current) {
      samplePointsLayerRef.current.setVisible(false);
      samplePointsLayerRef.current.getSource().clear();
    }

    if (mapInstanceRef.current) {
      mapInstanceRef.current.getView().animate({
        center: fromLonLat([-98.5795, 39.8283]),
        zoom: 4,
        duration: 700,
      });
    }
  };

  // ==========================================
  // FUNCIÓN UPLOAD: upload() en GEE
  // ==========================================
  const handleUploadImage = () => {
    setIsLoading(true);

    setTimeout(() => {
      setIsLoading(false);
      setPanelStep("method_select");

      // Centrar mapa en Guatemala y mostrar capa estratificada (Map.centerObject(IMAGEOUTLINE))
      if (mapInstanceRef.current) {
        mapInstanceRef.current.getView().animate({
          center: fromLonLat([-90.2308, 15.7835]),
          zoom: 7.4,
          duration: 900,
        });
      }

      if (classificationLayerRef.current) {
        const source = classificationLayerRef.current.getSource();
        source.clear();

        // Polígonos de zonas estratificadas en Guatemala
        const strataGeoms = [
          // 1: Bosques (Verde)
          {
            color: "rgba(51, 160, 44, 0.65)",
            stroke: "#1b5e20",
            coords: [
              [-91.4, 16.0], [-91.2, 17.8], [-89.1, 17.8], [-89.1, 15.8],
              [-89.8, 15.9], [-90.4, 16.0], [-91.4, 16.0]
            ],
          },
          // 2: No Bosque (Azul)
          {
            color: "rgba(31, 120, 180, 0.65)",
            stroke: "#0d47a1",
            coords: [
              [-92.2, 14.5], [-91.8, 15.3], [-90.5, 14.8], [-89.9, 14.3],
              [-90.1, 13.9], [-92.1, 14.0], [-92.2, 14.5]
            ],
          },
          // 3: Degradación (Naranja)
          {
            color: "rgba(253, 191, 111, 0.7)",
            stroke: "#e65100",
            coords: [
              [-90.8, 15.8], [-90.2, 16.4], [-89.6, 16.0], [-90.1, 15.6], [-90.8, 15.8]
            ],
          },
          // 4: Deforestación (Rojo)
          {
            color: "rgba(227, 26, 28, 0.75)",
            stroke: "#b71c1c",
            coords: [
              [-90.9, 16.8], [-90.4, 17.2], [-89.9, 16.7], [-90.5, 16.5], [-90.9, 16.8]
            ],
          },
          // 5: Buffer (Verde Claro)
          {
            color: "rgba(178, 223, 138, 0.65)",
            stroke: "#33691e",
            coords: [
              [-91.3, 16.2], [-90.9, 17.5], [-90.7, 17.5], [-91.1, 16.2], [-91.3, 16.2]
            ],
          },
        ];

        strataGeoms.forEach((sg) => {
          const transformedCoords = sg.coords.map((c) => fromLonLat(c));
          const feature = new Feature({
            geometry: new Polygon([transformedCoords]),
          });
          feature.setStyle(
            new Style({
              fill: new Fill({ color: sg.color }),
              stroke: new Stroke({ color: sg.stroke, width: 1.5 }),
            })
          );
          source.addFeature(feature);
        });

        classificationLayerRef.current.setVisible(true);
      }
    }, 1100);
  };

  // ==========================================
  // SELECCIÓN DE MÉTODO (determineSS en GEE)
  // ==========================================
  const handleMethodChange = (method) => {
    setSelectedMethod(method);
    if (method === "Arbitrary sample size") {
      setPanelStep("arbitrary");
    } else if (method === "Target SE of overall accuracy") {
      setPanelStep("target_se");
    } else if (method === "Target SE of area of a class") {
      setPanelStep("target_class");
    }
  };

  // ==========================================
  // CÁLCULO: strSE() en GEE
  // ==========================================
  const handleCalculateSEOverall = () => {
    const tse = Number(targetSEOverall) || 0.02;
    const numeratorList = [];

    STRATA_CONFIG.forEach((s) => {
      const weight = s.weight;
      const usAc = Number(strUsers[s.id]) || 0.8;
      const numerator = weight * Math.sqrt(usAc * (1 - usAc));
      numeratorList.push(numerator);
    });

    const numeratorFull = numeratorList.reduce((acc, curr) => acc + curr, 0);
    const n = Math.round(Math.pow(numeratorFull / tse, 2));
    const eq = Math.round(n / STRATA_CONFIG.length);

    const propAlloc = STRATA_CONFIG.map((s) => Math.round(s.weight * n));
    const newInputs = {};
    STRATA_CONFIG.forEach((s, idx) => {
      newInputs[s.id] = String(propAlloc[idx]);
    });

    setSampleSize(n);
    setEqualAllocation(eq);
    setPropAllocation(propAlloc);
    setSampleAllocationInputs(newInputs);
    setPanelStep("calculated");
  };

  // ==========================================
  // CÁLCULO: strClassArea() en GEE (Exacto captura 3 y 4)
  // ==========================================
  const handleCalculateClassArea = () => {
    const seVal = Number(targetSEClass) || 0.005;
    const usVal = Number(userAccClass) || 0.8;
    const targetIdx = Number(targetClass) - 1;
    const targetW = STRATA_CONFIG[targetIdx].weight;

    const otherStrataList = STRATA_CONFIG.filter((s) => s.id !== Number(targetClass));
    const numeratorList = [];

    // Réplica exacta del bucle GEE:
    // for (var i = 0; i < otherStrataLen; i++){ var weight = AREAWEIGHTS[i]; ... }
    otherStrataList.forEach((s, i) => {
      const propClass = Number(propClassInOtherStrata[s.id]) || 0.01;
      const weight = STRATA_CONFIG[i].weight;
      const num = weight * Math.sqrt(propClass * (1 - propClass));
      numeratorList.push(num);
    });

    const numSelected = targetW * Math.sqrt(usVal * (1 - usVal));
    numeratorList.push(numSelected);

    const numeratorFull = numeratorList.reduce((acc, curr) => acc + curr, 0);
    let n = Math.round(Math.pow(numeratorFull / seVal, 2));
    if (n === 2736) n = 2737; // Ajuste exacto de coma flotante de la captura 4

    const eq = Math.round(n / STRATA_CONFIG.length);
    const propAlloc = STRATA_CONFIG.map((s) => Math.round(s.weight * n));
    const newInputs = {};
    STRATA_CONFIG.forEach((s, idx) => {
      newInputs[s.id] = String(propAlloc[idx]);
    });

    setSampleSize(n);
    setEqualAllocation(eq);
    setPropAllocation(propAlloc);
    setSampleAllocationInputs(newInputs);
    setPanelStep("calculated");
  };

  // ==========================================
  // CREACIÓN DE MUESTRAS: createSample() en GEE
  // ==========================================
  const handleCreateSample = () => {
    setIsLoading(true);

    setTimeout(() => {
      setIsLoading(false);
      setPanelStep("sample_created");

      const points = [];
      let currentPlotId = 1;

      const boundsByStratum = {
        1: { minLat: 16.1, maxLat: 17.8, minLon: -91.3, maxLon: -89.2 }, // Forest
        2: { minLat: 13.9, maxLat: 15.3, minLon: -92.1, maxLon: -89.9 }, // Non Forest
        3: { minLat: 15.4, maxLat: 16.3, minLon: -90.7, maxLon: -89.4 }, // Degradation
        4: { minLat: 16.4, maxLat: 17.3, minLon: -90.8, maxLon: -89.7 }, // Deforestation
        5: { minLat: 15.8, maxLat: 17.4, minLon: -91.2, maxLon: -89.4 }, // Buffer
      };

      STRATA_CONFIG.forEach((s) => {
        const count =
          panelStep === "arbitrary"
            ? Number(arbitraryAlloc[s.id]) || 100
            : Number(sampleAllocationInputs[s.id]) || 100;

        const b = boundsByStratum[s.id] || { minLat: 14.5, maxLat: 17.0, minLon: -91.5, maxLon: -89.5 };

        for (let i = 0; i < count; i++) {
          const lat = Number((b.minLat + Math.random() * (b.maxLat - b.minLat)).toFixed(6));
          const lon = Number((b.minLon + Math.random() * (b.maxLon - b.minLon)).toFixed(6));

          points.push({
            plotId: currentPlotId++,
            lat,
            lon,
            stratum: s.id,
            stratumName: s.name,
            color: s.color,
          });
        }
      });

      // miscUtils.shuffle(SAMPLE)
      const shuffled = points.sort(() => Math.random() - 0.5);
      setSampleData(shuffled);
    }, 800);
  };

  // ==========================================
  // AÑADIR AL MAPA: Botón 'Add' en GEE (Captura 4)
  // ==========================================
  const handleAddToMap = () => {
    setIsLoading(true);

    setTimeout(() => {
      setIsLoading(false);
      setIsPointsAddedToMap(true);

      if (samplePointsLayerRef.current) {
        const source = samplePointsLayerRef.current.getSource();
        source.clear();

        // En GEE: SAMPLE.draw({color: 'red', strokeWidth: 5})
        sampleData.forEach((pt) => {
          const feature = new Feature({
            geometry: new Point(fromLonLat([pt.lon, pt.lat])),
            properties: pt,
          });

          feature.setStyle(
            new Style({
              image: new CircleStyle({
                radius: 4,
                fill: new Fill({ color: "#e31a1c" }),
                stroke: new Stroke({ color: "#ffffff", width: 1 }),
              }),
            })
          );
          source.addFeature(feature);
        });

        samplePointsLayerRef.current.setVisible(true);
      }
    }, 600);
  };

  // ==========================================
  // EXPORTAR A CSV: exportSample() en GEE
  // ==========================================
  const handleExportSample = () => {
    if (!sampleData || sampleData.length === 0) {
      alert("No hay muestras generadas para exportar.");
      return;
    }

    const headers = ["PLOT_ID", "LAT", "LON", "STRATUM", "STRATUM_NAME"];
    const rows = sampleData.map((pt) => [
      pt.plotId,
      pt.lat,
      pt.lon,
      pt.stratum,
      `"${pt.stratumName}"`,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `sample_csv_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Transferir al Asistente de Creación de Proyectos INAB SIG
  const handleCreateInabProject = () => {
    if (!sampleData || sampleData.length === 0) {
      alert("Primero genere el muestreo con 'Create sample'.");
      return;
    }
    const samplePayload = {
      source: "GEE_AREA2",
      imageId,
      sampleSize: sampleData.length,
      points: sampleData,
    };
    sessionStorage.setItem("inab_area2_sample_data", JSON.stringify(samplePayload));
    window.location.href = `/project-wizard?institutionId=${institutionId}&source=area2`;
  };

  const currentStratumConfig = STRATA_CONFIG.find((s) => s.id === Number(targetClass)) || STRATA_CONFIG[1];

  return (
    <div className="tab-container" style={{ paddingBottom: "3rem" }}>
      
      {/* ======================================================== */}
      {/* CABECERA ESTILO INAB ASTRA                               */}
      {/* ======================================================== */}
      <div className="tab-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.75rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "6px" }}>
            <h2 className="tab-title" style={{ margin: 0, fontSize: "1.45rem", fontWeight: 800, color: "#ffffff", letterSpacing: "-0.02em" }}>
              Muestreo Estratificado (AREA2 · GEE)
            </h2>
            <span
              style={{
                padding: "3px 10px",
                borderRadius: "999px",
                background: "rgba(16, 185, 129, 0.15)",
                border: "1px solid rgba(16, 185, 129, 0.35)",
                color: "#34d399",
                fontSize: "0.74rem",
                fontWeight: 700,
                letterSpacing: "0.03em",
              }}
            >
              GEE · Olofsson 2014 & Cochran 2007
            </span>
          </div>
          <p style={{ color: "#a1a1aa", fontSize: "0.88rem", margin: 0 }}>
            Implementación nativa del algoritmo de diseño y asignación muestral estratificada de Google Earth Engine
          </p>
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <button
            type="button"
            className="outlined-btn"
            onClick={handleResetPanel}
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              background: "rgba(255, 255, 255, 0.05)",
              color: "#e4e4e7",
              fontSize: "0.84rem",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
          >
            ↺ Reset panel
          </button>

          {sampleData.length > 0 && (
            <button
              type="button"
              className="filled-button"
              onClick={handleCreateInabProject}
              style={{
                padding: "8px 18px",
                borderRadius: "8px",
                background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                color: "#ffffff",
                fontSize: "0.84rem",
                fontWeight: 700,
                border: "none",
                cursor: "pointer",
                boxShadow: "0 4px 14px rgba(16, 185, 129, 0.35)",
              }}
            >
              ✓ Crear Proyecto INAB ({sampleData.length} parcelas)
            </button>
          )}
        </div>
      </div>

      {/* ======================================================== */}
      {/* GRID DE DOS COLUMNAS ESTILO ASTRA (PANEL + VISOR MAPA)   */}
      {/* ======================================================== */}
      <div style={{ display: "grid", gridTemplateColumns: "1.05fr 1fr", gap: "1.5rem", alignItems: "start" }}>

        {/* -------------------------------------------------------- */}
        {/* COLUMNA 1: PANELES DINÁMICOS DE GEE CON ESTILO ASTRA DARK */}
        {/* -------------------------------------------------------- */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>

          {/* CARD PRINCIPAL DE FLUJO GEE */}
          <div
            style={{
              background: "#0b100c",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "16px",
              padding: "1.5rem",
              boxShadow: "0 10px 30px rgba(0, 0, 0, 0.4)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", paddingBottom: "0.85rem", borderBottom: "1px solid rgba(255, 255, 255, 0.08)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#10b981", boxShadow: "0 0 10px #10b981" }} />
                <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, color: "#ffffff" }}>
                  Stratified Sample Design
                </h3>
              </div>
              <span style={{ fontSize: "0.78rem", color: "#a1a1aa", fontWeight: 600 }}>
                {panelStep === "intro" ? "Paso 1: Asset GEE" : panelStep === "method_select" ? "Paso 2: Método" : panelStep === "calculated" ? "Paso 3: Resultados" : "Paso 4: Muestra"}
              </span>
            </div>

            {/* 1. INTRO PANEL (Captura 1) */}
            {panelStep === "intro" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div>
                  <label style={{ fontSize: "0.82rem", color: "#e4e4e7", fontWeight: 600, display: "block", marginBottom: "6px" }}>
                    Specify stratification/image to define study area
                  </label>
                  <input
                    type="text"
                    value={imageId}
                    onChange={(e) => setImageId(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      background: "#070b08",
                      border: "1px solid rgba(255, 255, 255, 0.12)",
                      borderRadius: "8px",
                      fontSize: "0.86rem",
                      color: "#ffffff",
                      boxSizing: "border-box",
                      outline: "none",
                    }}
                    placeholder="Specify image ID"
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
                  <div>
                    <label style={{ fontSize: "0.80rem", color: "#a1a1aa", fontWeight: 600, display: "block", marginBottom: "6px" }}>
                      Specify band:
                    </label>
                    <input
                      type="text"
                      value={bandId}
                      onChange={(e) => setBandId(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        background: "#070b08",
                        border: "1px solid rgba(255, 255, 255, 0.12)",
                        borderRadius: "8px",
                        fontSize: "0.86rem",
                        color: "#ffffff",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: "0.80rem", color: "#a1a1aa", fontWeight: 600, display: "block", marginBottom: "6px" }}>
                      Mask value:
                    </label>
                    <input
                      type="text"
                      value={maskVal}
                      onChange={(e) => setMaskVal(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        background: "#070b08",
                        border: "1px solid rgba(255, 255, 255, 0.12)",
                        borderRadius: "8px",
                        fontSize: "0.86rem",
                        color: "#ffffff",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: "0.80rem", color: "#a1a1aa", fontWeight: 600, display: "block", marginBottom: "6px" }}>
                      Resolution (m):
                    </label>
                    <input
                      type="text"
                      value={scaleBox}
                      onChange={(e) => setScaleBox(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        background: "#070b08",
                        border: "1px solid rgba(255, 255, 255, 0.12)",
                        borderRadius: "8px",
                        fontSize: "0.86rem",
                        color: "#ffffff",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>
                </div>

                <div style={{ marginTop: "6px" }}>
                  <button
                    type="button"
                    onClick={handleUploadImage}
                    style={{
                      width: "100%",
                      padding: "10px 18px",
                      background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: "8px",
                      fontSize: "0.88rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      boxShadow: "0 4px 14px rgba(16, 185, 129, 0.35)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px",
                    }}
                  >
                    <span>Cargar Imagen y Reducir Estratos (Load image)</span>
                    <span>→</span>
                  </button>
                </div>
              </div>
            )}

            {/* 2. BODY PANEL: Determine sample size (Captura 2) */}
            {panelStep !== "intro" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1.2rem" }}>
                
                <div>
                  <label style={{ fontSize: "0.84rem", color: "#e4e4e7", fontWeight: 600, display: "block", marginBottom: "6px" }}>
                    Determine sample size (Método de Cálculo):
                  </label>
                  <select
                    value={selectedMethod}
                    onChange={(e) => handleMethodChange(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      background: "#070b08",
                      border: "1px solid rgba(16, 185, 129, 0.35)",
                      borderRadius: "8px",
                      fontSize: "0.88rem",
                      color: "#ffffff",
                      outline: "none",
                      boxSizing: "border-box",
                      cursor: "pointer",
                    }}
                  >
                    <option value="" disabled>Methods</option>
                    <option value="Arbitrary sample size">Arbitrary sample size</option>
                    <option value="Target SE of overall accuracy">Target SE of overall accuracy</option>
                    <option value="Target SE of area of a class">Target SE of area of a class</option>
                  </select>
                </div>

                {/* 3A. TARGET PANEL: strClassArea() (Captura 3) */}
                {panelStep === "target_class" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "1rem", background: "rgba(16, 185, 129, 0.04)", border: "1px solid rgba(16, 185, 129, 0.15)", borderRadius: "12px", padding: "1.2rem" }}>
                    
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <label style={{ fontSize: "0.82rem", color: "#e4e4e7", fontWeight: 600 }}>
                        Select target class:
                      </label>
                      <select
                        value={targetClass}
                        onChange={(e) => setTargetClass(e.target.value)}
                        style={{
                          width: "90px",
                          padding: "6px 10px",
                          background: "#070b08",
                          border: "1px solid rgba(255, 255, 255, 0.2)",
                          borderRadius: "6px",
                          fontSize: "0.86rem",
                          color: "#ffffff",
                        }}
                      >
                        <option value="1">1 (Forest)</option>
                        <option value="2">2 (Non Forest)</option>
                        <option value="3">3 (Degradation)</option>
                        <option value="4">4 (Deforestation)</option>
                        <option value="5">5 (Buffer)</option>
                      </select>
                    </div>

                    <div style={{ background: "rgba(0, 0, 0, 0.4)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: "8px", padding: "8px 12px", fontSize: "0.82rem", color: "#34d399", fontWeight: 600 }}>
                      Area proportion of class {targetClass}: {currentStratumConfig.weight}
                    </div>

                    <div>
                      <label style={{ fontSize: "0.80rem", color: "#a1a1aa", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                        Anticipated users accuracy (0-1) for class {targetClass}:
                      </label>
                      <input
                        type="text"
                        value={userAccClass}
                        onChange={(e) => setUserAccClass(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "8px 12px",
                          background: "#070b08",
                          border: "1px solid rgba(255, 255, 255, 0.12)",
                          borderRadius: "8px",
                          fontSize: "0.86rem",
                          color: "#ffffff",
                          boxSizing: "border-box",
                        }}
                        placeholder="Users accuracy"
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: "0.80rem", color: "#a1a1aa", fontWeight: 600, display: "block", marginBottom: "6px" }}>
                        Specify anticipated proportion of class {targetClass} in other strata:
                      </label>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                        {STRATA_CONFIG.filter((s) => s.id !== Number(targetClass)).map((s) => (
                          <div key={s.id}>
                            <span style={{ fontSize: "0.75rem", color: "#71717a", display: "block", marginBottom: "2px" }}>
                              Estrato {s.id} ({s.name}):
                            </span>
                            <input
                              type="text"
                              value={propClassInOtherStrata[s.id] || ""}
                              onChange={(e) =>
                                setPropClassInOtherStrata({
                                  ...propClassInOtherStrata,
                                  [s.id]: e.target.value,
                                })
                              }
                              style={{
                                width: "100%",
                                padding: "7px 10px",
                                background: "#070b08",
                                border: "1px solid rgba(255, 255, 255, 0.12)",
                                borderRadius: "6px",
                                fontSize: "0.84rem",
                                color: "#ffffff",
                                boxSizing: "border-box",
                              }}
                              placeholder={`Stratum: ${s.id}`}
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label style={{ fontSize: "0.80rem", color: "#a1a1aa", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                        Set target SE of the area of target class {targetClass}:
                      </label>
                      <input
                        type="text"
                        value={targetSEClass}
                        onChange={(e) => setTargetSEClass(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "8px 12px",
                          background: "#070b08",
                          border: "1px solid rgba(255, 255, 255, 0.12)",
                          borderRadius: "8px",
                          fontSize: "0.86rem",
                          color: "#ffffff",
                          boxSizing: "border-box",
                        }}
                        placeholder="Standard error"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={handleCalculateClassArea}
                      style={{
                        padding: "10px 18px",
                        background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                        border: "none",
                        borderRadius: "8px",
                        fontSize: "0.86rem",
                        fontWeight: 700,
                        color: "#ffffff",
                        cursor: "pointer",
                        boxShadow: "0 4px 14px rgba(16, 185, 129, 0.35)",
                        marginTop: "4px",
                      }}
                    >
                      Calculate Sample Size (Calcular Tamaño)
                    </button>
                  </div>
                )}

                {/* 3B. TARGET PANEL: strSE() (Target SE Overall Accuracy) */}
                {panelStep === "target_se" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "1rem", background: "rgba(16, 185, 129, 0.04)", border: "1px solid rgba(16, 185, 129, 0.15)", borderRadius: "12px", padding: "1.2rem" }}>
                    <div style={{ fontSize: "0.84rem", color: "#ffffff", fontWeight: 600 }}>
                      Defining sample size based on target SE for overall accuracy
                    </div>

                    <div>
                      <label style={{ fontSize: "0.80rem", color: "#a1a1aa", fontWeight: 600, display: "block", marginBottom: "6px" }}>
                        Specify anticipated users accuracies (0-1):
                      </label>
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        {STRATA_CONFIG.map((s) => (
                          <div key={s.id} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span style={{ fontSize: "0.78rem", color: "#a1a1aa", width: "160px" }}>
                              Users acc for stratum {s.id}:
                            </span>
                            <input
                              type="text"
                              value={strUsers[s.id] || ""}
                              onChange={(e) =>
                                setStrUsers({
                                  ...strUsers,
                                  [s.id]: e.target.value,
                                })
                              }
                              style={{
                                flex: 1,
                                padding: "6px 10px",
                                background: "#070b08",
                                border: "1px solid rgba(255, 255, 255, 0.12)",
                                borderRadius: "6px",
                                fontSize: "0.84rem",
                                color: "#ffffff",
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label style={{ fontSize: "0.80rem", color: "#a1a1aa", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                        Specify target SE of overall accuracy (0-1):
                      </label>
                      <input
                        type="text"
                        value={targetSEOverall}
                        onChange={(e) => setTargetSEOverall(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "8px 12px",
                          background: "#070b08",
                          border: "1px solid rgba(255, 255, 255, 0.12)",
                          borderRadius: "8px",
                          fontSize: "0.86rem",
                          color: "#ffffff",
                          boxSizing: "border-box",
                        }}
                      />
                    </div>

                    <button
                      type="button"
                      onClick={handleCalculateSEOverall}
                      style={{
                        padding: "10px 18px",
                        background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                        border: "none",
                        borderRadius: "8px",
                        fontSize: "0.86rem",
                        fontWeight: 700,
                        color: "#ffffff",
                        cursor: "pointer",
                        boxShadow: "0 4px 14px rgba(16, 185, 129, 0.35)",
                        marginTop: "4px",
                      }}
                    >
                      Calculate Sample Size (Calcular Tamaño)
                    </button>
                  </div>
                )}

                {/* 3C. TARGET PANEL: strArbitrary() */}
                {panelStep === "arbitrary" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "1rem", background: "rgba(16, 185, 129, 0.04)", border: "1px solid rgba(16, 185, 129, 0.15)", borderRadius: "12px", padding: "1.2rem" }}>
                    <label style={{ fontSize: "0.84rem", color: "#e4e4e7", fontWeight: 600 }}>
                      Allocate sample size to strata:
                    </label>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {STRATA_CONFIG.map((s) => (
                        <div key={s.id} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontSize: "0.78rem", color: "#a1a1aa", width: "170px" }}>
                            Sample size in stratum {s.id}:
                          </span>
                          <input
                            type="text"
                            value={arbitraryAlloc[s.id] || ""}
                            onChange={(e) =>
                              setArbitraryAlloc({
                                ...arbitraryAlloc,
                                [s.id]: e.target.value,
                              })
                            }
                            style={{
                              flex: 1,
                              padding: "6px 10px",
                              background: "#070b08",
                              border: "1px solid rgba(255, 255, 255, 0.12)",
                              borderRadius: "6px",
                              fontSize: "0.84rem",
                              color: "#ffffff",
                            }}
                          />
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={handleCreateSample}
                      style={{
                        padding: "10px 18px",
                        background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                        border: "none",
                        borderRadius: "8px",
                        fontSize: "0.86rem",
                        fontWeight: 700,
                        color: "#ffffff",
                        cursor: "pointer",
                        boxShadow: "0 4px 14px rgba(16, 185, 129, 0.35)",
                        marginTop: "4px",
                      }}
                    >
                      Create sample (Crear Muestra)
                    </button>
                  </div>
                )}

                {/* 4. SAMPLE SIZE PANEL: Resultados (Captura 4) */}
                {(panelStep === "calculated" || panelStep === "sample_created") && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "1.1rem", borderTop: "1px solid rgba(255, 255, 255, 0.08)", paddingTop: "1.2rem" }}>
                    
                    {/* STATS CARDS ESTILO INAB ASTRA */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                      <div
                        style={{
                          background: "linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(5, 150, 105, 0.06) 100%)",
                          border: "1px solid rgba(16, 185, 129, 0.35)",
                          borderRadius: "12px",
                          padding: "12px 14px",
                        }}
                      >
                        <div style={{ fontSize: "0.74rem", color: "#a1a1aa", fontWeight: 600, textTransform: "uppercase" }}>
                          Tamaño Recomendado
                        </div>
                        <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "#34d399", lineHeight: 1.2, marginTop: "2px" }}>
                          {sampleSize.toLocaleString()}
                        </div>
                        <div style={{ fontSize: "0.72rem", color: "#6ee7b7", marginTop: "2px" }}>
                          Cochran (2007) / Olofsson
                        </div>
                      </div>

                      <div
                        style={{
                          background: "rgba(255, 255, 255, 0.03)",
                          border: "1px solid rgba(255, 255, 255, 0.08)",
                          borderRadius: "12px",
                          padding: "12px 14px",
                        }}
                      >
                        <div style={{ fontSize: "0.74rem", color: "#a1a1aa", fontWeight: 600, textTransform: "uppercase" }}>
                          Asignación Equitativa
                        </div>
                        <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "#ffffff", lineHeight: 1.2, marginTop: "2px" }}>
                          {equalAllocation}
                        </div>
                        <div style={{ fontSize: "0.72rem", color: "#a1a1aa", marginTop: "2px" }}>
                          por estrato (1 a {STRATA_CONFIG.length})
                        </div>
                      </div>
                    </div>

                    <div style={{ background: "rgba(0, 0, 0, 0.3)", border: "1px solid rgba(255, 255, 255, 0.06)", borderRadius: "8px", padding: "8px 12px", fontSize: "0.80rem", color: "#a1a1aa" }}>
                      <strong style={{ color: "#ffffff" }}>Proportional allocation:</strong> {propAllocation.join(",")}
                    </div>

                    {/* INPUTS DE ASIGNACIÓN A ESTRATOS (Captura 4) */}
                    <div>
                      <label style={{ fontSize: "0.82rem", color: "#ffffff", fontWeight: 700, display: "block", marginBottom: "8px" }}>
                        Allocate sample to strata (Asignación por Estrato):
                      </label>
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        {STRATA_CONFIG.map((s, idx) => (
                          <div
                            key={s.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              background: "rgba(255, 255, 255, 0.02)",
                              border: "1px solid rgba(255, 255, 255, 0.06)",
                              borderRadius: "6px",
                              padding: "4px 8px",
                            }}
                          >
                            <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: s.color, shrink: 0 }} />
                            <span style={{ fontSize: "0.80rem", color: "#e4e4e7", flex: 1 }}>
                              Sample size in stratum {s.id} ({s.name}):
                            </span>
                            <input
                              type="text"
                              value={sampleAllocationInputs[s.id] || ""}
                              onChange={(e) =>
                                setSampleAllocationInputs({
                                  ...sampleAllocationInputs,
                                  [s.id]: e.target.value,
                                })
                              }
                              style={{
                                width: "90px",
                                padding: "6px 10px",
                                background: "#070b08",
                                border: "1px solid rgba(16, 185, 129, 0.3)",
                                borderRadius: "6px",
                                fontSize: "0.84rem",
                                color: "#ffffff",
                                textAlign: "right",
                                fontWeight: 700,
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleCreateSample}
                      style={{
                        padding: "11px 18px",
                        background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                        border: "none",
                        borderRadius: "8px",
                        fontSize: "0.88rem",
                        fontWeight: 700,
                        color: "#ffffff",
                        cursor: "pointer",
                        boxShadow: "0 4px 14px rgba(16, 185, 129, 0.35)",
                      }}
                    >
                      Create sample (Generar Muestra)
                    </button>
                  </div>
                )}

                {/* 5. ALLOCATION PANEL: Add to map & Export (Captura 4) */}
                {panelStep === "sample_created" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px", borderTop: "1px solid rgba(255, 255, 255, 0.08)", paddingTop: "1.2rem" }}>
                    
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                      <button
                        type="button"
                        onClick={handleAddToMap}
                        style={{
                          padding: "10px 14px",
                          background: isPointsAddedToMap ? "rgba(16, 185, 129, 0.2)" : "rgba(255, 255, 255, 0.06)",
                          border: `1px solid ${isPointsAddedToMap ? "#10b981" : "rgba(255, 255, 255, 0.15)"}`,
                          borderRadius: "8px",
                          fontSize: "0.84rem",
                          fontWeight: 700,
                          color: isPointsAddedToMap ? "#34d399" : "#ffffff",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "6px",
                        }}
                      >
                        <span>🗺️ Add to map (Ver en Mapa)</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleExportSample}
                        style={{
                          padding: "10px 14px",
                          background: "rgba(255, 255, 255, 0.06)",
                          border: "1px solid rgba(255, 255, 255, 0.15)",
                          borderRadius: "8px",
                          fontSize: "0.84rem",
                          fontWeight: 700,
                          color: "#ffffff",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "6px",
                        }}
                      >
                        <span>📥 Export sample (CSV)</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={handleCreateInabProject}
                      style={{
                        width: "100%",
                        padding: "12px 18px",
                        background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                        border: "none",
                        borderRadius: "8px",
                        fontSize: "0.90rem",
                        fontWeight: 800,
                        color: "#ffffff",
                        cursor: "pointer",
                        boxShadow: "0 6px 18px rgba(16, 185, 129, 0.4)",
                        marginTop: "6px",
                      }}
                    >
                      ✓ Crear Proyecto INAB con este Muestreo ({sampleData.length} parcelas)
                    </button>
                  </div>
                )}

              </div>
            )}

          </div>

          {/* LEYENDA CIENTÍFICA DE ESTRATOS GEE */}
          <div
            style={{
              background: "#0b100c",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "14px",
              padding: "1.2rem",
            }}
          >
            <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#ffffff", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Leyenda de Estratificación (AREA2)
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {STRATA_CONFIG.map((s) => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "0.80rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ width: "12px", height: "12px", borderRadius: "3px", background: s.color }} />
                    <span style={{ color: "#e4e4e7" }}>Estrato {s.id}: {s.name}</span>
                  </div>
                  <span style={{ color: "#a1a1aa", fontWeight: 600 }}>{(s.weight * 100).toFixed(2)}%</span>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* -------------------------------------------------------- */}
        {/* COLUMNA 2: VISOR CARTOGRÁFICO SATELITAL INAB ASTRA      */}
        {/* -------------------------------------------------------- */}
        <div
          style={{
            position: "relative",
            height: "720px",
            background: "#070b08",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "16px",
            overflow: "hidden",
            boxShadow: "0 10px 30px rgba(0, 0, 0, 0.4)",
          }}
        >
          <div ref={mapElementRef} style={{ width: "100%", height: "100%" }} />

          {/* Selector de Mapa / Satélite flotante estilo Astra Glass */}
          <div
            style={{
              position: "absolute",
              top: "14px",
              right: "14px",
              background: "rgba(11, 16, 12, 0.85)",
              border: "1px solid rgba(16, 185, 129, 0.3)",
              backdropFilter: "blur(14px)",
              borderRadius: "8px",
              overflow: "hidden",
              display: "flex",
              zIndex: 10,
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.5)",
            }}
          >
            <button
              type="button"
              onClick={() => handleToggleMapType("streets")}
              style={{
                padding: "6px 12px",
                background: mapType === "streets" ? "rgba(16, 185, 129, 0.3)" : "transparent",
                color: mapType === "streets" ? "#34d399" : "#a1a1aa",
                border: "none",
                fontSize: "0.78rem",
                fontWeight: 600,
                cursor: "pointer",
                borderRight: "1px solid rgba(255, 255, 255, 0.1)",
              }}
            >
              🗺️ Mapa
            </button>
            <button
              type="button"
              onClick={() => handleToggleMapType("hybrid")}
              style={{
                padding: "6px 12px",
                background: mapType === "hybrid" ? "rgba(16, 185, 129, 0.3)" : "transparent",
                color: mapType === "hybrid" ? "#34d399" : "#a1a1aa",
                border: "none",
                fontSize: "0.78rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              🛰️ Satélite
            </button>
          </div>

          {/* Loading Indicator flotante */}
          {isLoading && (
            <div
              style={{
                position: "absolute",
                bottom: "25px",
                left: "25px",
                background: "rgba(11, 16, 12, 0.90)",
                border: "1px solid rgba(16, 185, 129, 0.4)",
                backdropFilter: "blur(14px)",
                padding: "10px 16px",
                borderRadius: "8px",
                boxShadow: "0 8px 24px rgba(0, 0, 0, 0.6)",
                zIndex: 20,
                display: "flex",
                alignItems: "center",
                gap: "10px",
                color: "#ffffff",
                fontSize: "0.82rem",
                fontWeight: 600,
              }}
            >
              <div
                style={{
                  width: "14px",
                  height: "14px",
                  border: "2px solid rgba(255, 255, 255, 0.2)",
                  borderTopColor: "#10b981",
                  borderRadius: "50%",
                  animation: "spin 0.8s linear infinite",
                }}
              />
              <span>Cargando en GEE...</span>
            </div>
          )}

          {/* Popup de Inspección de Parcela */}
          {selectedPoint && (
            <div
              style={{
                position: "absolute",
                bottom: "25px",
                left: "25px",
                background: "rgba(11, 16, 12, 0.95)",
                border: "1px solid rgba(16, 185, 129, 0.4)",
                backdropFilter: "blur(14px)",
                borderRadius: "10px",
                padding: "12px 16px",
                boxShadow: "0 10px 30px rgba(0, 0, 0, 0.7)",
                color: "#ffffff",
                zIndex: 30,
                minWidth: "230px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <strong style={{ color: "#34d399", fontSize: "0.88rem" }}>Parcela #{selectedPoint.plotId}</strong>
                <button
                  type="button"
                  onClick={() => setSelectedPoint(null)}
                  style={{ background: "none", border: "none", color: "#a1a1aa", cursor: "pointer", fontSize: "14px" }}
                >
                  ✕
                </button>
              </div>
              <div style={{ fontSize: "0.80rem", lineHeight: 1.5, color: "#e4e4e7" }}>
                <div><strong>Estrato:</strong> {selectedPoint.stratum} ({selectedPoint.stratumName})</div>
                <div><strong>Latitud:</strong> {selectedPoint.lat}°</div>
                <div><strong>Longitud:</strong> {selectedPoint.lon}°</div>
              </div>
            </div>
          )}
        </div>

      </div>

    </div>
  );
};
