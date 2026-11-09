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

// Paleta oficial de AREA2 en GEE (Olofsson / Bullock):
// var palette = ['#a6cee3','#1f78b4','#b2df8a','#33a02c','#fb9a99','#e31a1c',
//                '#fdbf6f','#ff7f00','#cab2d6','#6a3d9a','#ffff99','#b15928']
const GEE_PALETTE = [
  "#a6cee3",
  "#1f78b4", // 1: Non Forest en clasificación GEE
  "#b2df8a", // 2: Buffer
  "#33a02c", // 3: Forest
  "#fb9a99",
  "#e31a1c", // 5: Deforestation
  "#fdbf6f", // 6: Degradation
  "#ff7f00",
  "#cab2d6",
  "#6a3d9a",
  "#ffff99",
  "#b15928",
];

// Metadatos y pesos reales de projects/AREA2/public/guatemala_stratification en GEE
// Coinciden con los pesos y resultados de las capturas (ej: clase 2 = 0.3752299535648596)
const STRATA_CONFIG = [
  { id: 1, name: "Forest", weight: 0.4289367921081476, defaultUserAcc: 0.90, color: "#33a02c" },
  { id: 2, name: "Non Forest", weight: 0.3752299535648596, defaultUserAcc: 0.80, color: "#1f78b4" },
  { id: 3, name: "Degradation", weight: 0.07526488856412131, defaultUserAcc: 0.70, color: "#fdbf6f" },
  { id: 4, name: "Deforestation", weight: 0.052977712824260136, defaultUserAcc: 0.75, color: "#e31a1c" },
  { id: 5, name: "Buffer", weight: 0.06759225429302156, defaultUserAcc: 0.80, color: "#b2df8a" },
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

  // Estado del panel:
  // 'intro'           -> Se muestra introPanel (Specify stratification..., Load image)
  // 'method_select'   -> Imagen cargada, introPanel eliminado, se muestra dropdown 'Determine sample size'
  // 'target_se'       -> Método 'Target SE of overall accuracy' activo
  // 'target_class'    -> Método 'Target SE of area of a class' activo
  // 'arbitrary'       -> Método 'Arbitrary sample size' activo
  // 'calculated'      -> Se calculó tamaño de muestra y se muestran recomendaciones + SAMPLEALLOCATION
  // 'sample_created'  -> Muestra generada, se muestra 'Add to map' y 'Export sample'
  const [panelStep, setPanelStep] = useState("intro");
  const [selectedMethod, setSelectedMethod] = useState("");

  // Loading overlay (loadPanel en GEE: position: 'bottom-left', width: '250px')
  const [isLoading, setIsLoading] = useState(false);

  // Parámetros de 'Target SE of overall accuracy'
  const [strUsers, setStrUsers] = useState({
    1: "0.90",
    2: "0.85",
    3: "0.70",
    4: "0.75",
    5: "0.80",
  });
  const [targetSEOverall, setTargetSEOverall] = useState(".02");

  // Parámetros de 'Target SE of area of a class' (como en captura 3)
  const [targetClass, setTargetClass] = useState("2");
  const [userAccClass, setUserAccClass] = useState("0.8");
  const [propClassInOtherStrata, setPropClassInOtherStrata] = useState({
    1: "0.03",
    3: "0.001",
    4: "0.02",
    5: "0.10",
  });
  const [targetSEClass, setTargetSEClass] = useState("0.005");

  // Parámetros de 'Arbitrary sample size'
  const [arbitraryAlloc, setArbitraryAlloc] = useState({
    1: "500",
    2: "500",
    3: "200",
    4: "150",
    5: "200",
  });

  // Resultados del cálculo (como en captura 4)
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

    // Capa Satélite Google con Hybrid labels
    const tileLayer = new TileLayer({
      source: new XYZ({
        url: "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
        maxZoom: 22,
      }),
    });
    tileLayerRef.current = tileLayer;

    // Capa de Clasificación (simulando IMAGE en GEE)
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
        center: fromLonLat([-98.5795, 39.8283]), // Vista continental inicial (como en captura 1 de GEE)
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

    // Ocultar capas del mapa
    if (classificationLayerRef.current) {
      classificationLayerRef.current.setVisible(false);
    }
    if (samplePointsLayerRef.current) {
      samplePointsLayerRef.current.setVisible(false);
      samplePointsLayerRef.current.getSource().clear();
    }

    // Regresar mapa a vista continental inicial
    if (mapInstanceRef.current) {
      mapInstanceRef.current.getView().animate({
        center: fromLonLat([-98.5795, 39.8283]),
        zoom: 4,
        duration: 800,
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

      // Centrar mapa en Guatemala y mostrar capa de clasificación (Map.centerObject(IMAGEOUTLINE))
      if (mapInstanceRef.current) {
        mapInstanceRef.current.getView().animate({
          center: fromLonLat([-90.2308, 15.7835]),
          zoom: 7.4,
          duration: 900,
        });
      }

      // Generar polígonos representativos de estratos en Guatemala
      if (classificationLayerRef.current) {
        const source = classificationLayerRef.current.getSource();
        source.clear();

        // Polígonos de zonas estratificadas
        const strataGeoms = [
          // 1: Bosques de Petén e Izabal (Verde)
          {
            color: "rgba(51, 160, 44, 0.65)",
            stroke: "#1b5e20",
            coords: [
              [-91.4, 16.0], [-91.2, 17.8], [-89.1, 17.8], [-89.1, 15.8],
              [-89.8, 15.9], [-90.4, 16.0], [-91.4, 16.0]
            ],
          },
          // 2: No Bosque / Agrícola / Costa Sur (Azul)
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
    }, 1200);
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

    // Añadir el estrato objetivo
    const numSelected = targetW * Math.sqrt(usVal * (1 - usVal));
    numeratorList.push(numSelected);

    const numeratorFull = numeratorList.reduce((acc, curr) => acc + curr, 0);
    const n = Math.round(Math.pow(numeratorFull / seVal, 2));
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

      // Usar los valores que el usuario especificó o confirmó en los Textbox
      const points = [];
      let currentPlotId = 1;

      // Límites geográficos representativos de cada estrato en Guatemala
      const boundsByStratum = {
        1: { minLat: 16.1, maxLat: 17.8, minLon: -91.3, maxLon: -89.2 }, // Forest (Petén)
        2: { minLat: 13.9, maxLat: 15.3, minLon: -92.1, maxLon: -89.9 }, // Non Forest (Costa Sur / Valle)
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

      // Mezclar aleatoriamente las muestras (miscUtils.shuffle(SAMPLE))
      const shuffled = points.sort(() => Math.random() - 0.5);
      setSampleData(shuffled);
    }, 900);
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

          // Puntos rojos estilo GEE
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

  // Guardar en sessionStorage para crear proyecto en INAB SIG
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
    <div style={{ position: "relative", width: "100%", height: "calc(100vh - 110px)", display: "flex", overflow: "hidden" }}>
      
      {/* ======================================================== */}
      {/* 1. VISOR CARTOGRÁFICO (GOOGLE MAPS)                      */}
      {/* ======================================================== */}
      <div style={{ flex: 1, position: "relative", height: "100%", background: "#e5e3df" }}>
        <div ref={mapElementRef} style={{ width: "100%", height: "100%" }} />

        {/* Botones de Cambio de Mapa / Satélite estilo GEE (Top Right) */}
        <div
          style={{
            position: "absolute",
            top: "14px",
            right: "14px",
            background: "#ffffff",
            borderRadius: "2px",
            boxShadow: "0 1px 4px rgba(0, 0, 0, 0.3)",
            display: "flex",
            overflow: "hidden",
            zIndex: 10,
          }}
        >
          <button
            type="button"
            onClick={() => handleToggleMapType("streets")}
            style={{
              padding: "7px 14px",
              background: mapType === "streets" ? "#f1f1f1" : "#ffffff",
              color: "#333333",
              border: "none",
              borderRight: "1px solid #e0e0e0",
              fontSize: "12px",
              fontWeight: mapType === "streets" ? "bold" : "normal",
              cursor: "pointer",
            }}
          >
            Mapa
          </button>
          <button
            type="button"
            onClick={() => handleToggleMapType("hybrid")}
            style={{
              padding: "7px 14px",
              background: mapType === "hybrid" ? "#f1f1f1" : "#ffffff",
              color: "#333333",
              border: "none",
              fontSize: "12px",
              fontWeight: mapType === "hybrid" ? "bold" : "normal",
              cursor: "pointer",
            }}
          >
            Satélite
          </button>
        </div>

        {/* Load Panel (Loading... en GEE: bottom-left, width: 250px) */}
        {isLoading && (
          <div
            style={{
              position: "absolute",
              bottom: "25px",
              left: "25px",
              width: "250px",
              background: "#ffffff",
              padding: "10px 16px",
              borderRadius: "4px",
              boxShadow: "0 2px 8px rgba(0, 0, 0, 0.3)",
              zIndex: 20,
              display: "flex",
              alignItems: "center",
              gap: "10px",
              color: "#333333",
              fontSize: "13px",
              fontWeight: 600,
            }}
          >
            <div
              style={{
                width: "16px",
                height: "16px",
                border: "2px solid #ccc",
                borderTopColor: "#10b981",
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
              }}
            />
            <span>Loading...</span>
          </div>
        )}

        {/* Popup de Inspección de Punto de Muestreo */}
        {selectedPoint && (
          <div
            style={{
              position: "absolute",
              bottom: "25px",
              left: "25px",
              background: "rgba(11, 16, 12, 0.95)",
              border: "1px solid #10b981",
              borderRadius: "8px",
              padding: "12px 16px",
              boxShadow: "0 8px 24px rgba(0, 0, 0, 0.5)",
              color: "#ffffff",
              zIndex: 30,
              minWidth: "220px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
              <strong style={{ color: "#10b981", fontSize: "0.9rem" }}>Parcela #{selectedPoint.plotId}</strong>
              <button
                type="button"
                onClick={() => setSelectedPoint(null)}
                style={{ background: "none", border: "none", color: "#a1a1aa", cursor: "pointer", fontSize: "14px" }}
              >
                ✕
              </button>
            </div>
            <div style={{ fontSize: "0.82rem", lineHeight: 1.5 }}>
              <div><strong>Estrato:</strong> {selectedPoint.stratum} ({selectedPoint.stratumName})</div>
              <div><strong>Latitud:</strong> {selectedPoint.lat}°</div>
              <div><strong>Longitud:</strong> {selectedPoint.lon}°</div>
            </div>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* 2. PANEL DERECHO DE GEE (mainPanel: width 400px)          */}
      {/* ======================================================== */}
      <div
        style={{
          width: "410px",
          height: "100%",
          background: "#ffffff",
          borderLeft: "1px solid #d0d0d0",
          boxShadow: "-2px 0 10px rgba(0, 0, 0, 0.15)",
          display: "flex",
          flexDirection: "column",
          zIndex: 10,
          overflowY: "auto",
          fontFamily: "Arial, sans-serif",
          color: "#222222",
        }}
      >
        <div style={{ padding: "18px 20px" }}>
          
          {/* TITLE PANEL */}
          <div style={{ marginBottom: "16px" }}>
            <h2 style={{ fontSize: "20px", fontWeight: "bold", margin: "0 0 10px 0", color: "#000000" }}>
              Stratified Sample Design
            </h2>
            <button
              type="button"
              onClick={handleResetPanel}
              style={{
                background: "#f8f9fa",
                border: "1px solid #dadce0",
                borderRadius: "4px",
                padding: "6px 14px",
                fontSize: "13px",
                fontWeight: 500,
                color: "#1a73e8",
                cursor: "pointer",
                boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
              }}
            >
              Reset panel
            </button>
          </div>

          {/* =================================================== */}
          {/* PASO 1: INTRO PANEL (Specify stratification/image)   */}
          {/* =================================================== */}
          {panelStep === "intro" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label style={{ fontSize: "13px", color: "#202124", display: "block", marginBottom: "6px" }}>
                  Specify stratification/image to define study area
                </label>
                <input
                  type="text"
                  value={imageId}
                  onChange={(e) => setImageId(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "7px 10px",
                    border: "1px solid #dadce0",
                    borderRadius: "4px",
                    fontSize: "13px",
                    color: "#202124",
                    boxSizing: "border-box",
                  }}
                  placeholder="Specify image ID"
                />
              </div>

              <div>
                <label style={{ fontSize: "13px", color: "#202124", display: "block", marginBottom: "6px" }}>
                  Specify band if a multi-band image (if not, specify 1)
                </label>
                <input
                  type="text"
                  value={bandId}
                  onChange={(e) => setBandId(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "7px 10px",
                    border: "1px solid #dadce0",
                    borderRadius: "4px",
                    fontSize: "13px",
                    color: "#202124",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: "13px", color: "#202124", display: "block", marginBottom: "6px" }}>
                  Specify mask value
                </label>
                <input
                  type="text"
                  value={maskVal}
                  onChange={(e) => setMaskVal(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "7px 10px",
                    border: "1px solid #dadce0",
                    borderRadius: "4px",
                    fontSize: "13px",
                    color: "#202124",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: "13px", color: "#202124", display: "block", marginBottom: "6px" }}>
                  Specify spatial resolution for calculating area proportions:
                </label>
                <input
                  type="text"
                  value={scaleBox}
                  onChange={(e) => setScaleBox(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "7px 10px",
                    border: "1px solid #dadce0",
                    borderRadius: "4px",
                    fontSize: "13px",
                    color: "#202124",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: "13px", color: "#202124", display: "block", marginBottom: "6px" }}>
                  Load image
                </label>
                <button
                  type="button"
                  onClick={handleUploadImage}
                  style={{
                    background: "#f1f3f4",
                    border: "1px solid #dadce0",
                    borderRadius: "4px",
                    padding: "7px 16px",
                    fontSize: "13px",
                    color: "#202124",
                    cursor: "pointer",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                  }}
                >
                  Load image
                </button>
              </div>
            </div>
          )}

          {/* =================================================== */}
          {/* PASO 2: BODY PANEL (Determine sample size)           */}
          {/* =================================================== */}
          {panelStep !== "intro" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              
              <div>
                <label style={{ fontSize: "13px", color: "#202124", display: "block", marginBottom: "6px" }}>
                  Determine sample size
                </label>
                <select
                  value={selectedMethod}
                  onChange={(e) => handleMethodChange(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "7px 10px",
                    border: "1px solid #dadce0",
                    borderRadius: "4px",
                    fontSize: "13px",
                    color: "#202124",
                    boxSizing: "border-box",
                    background: "#ffffff",
                  }}
                >
                  <option value="" disabled>Methods</option>
                  <option value="Arbitrary sample size">Arbitrary sample size</option>
                  <option value="Target SE of overall accuracy">Target SE of overall accuracy</option>
                  <option value="Target SE of area of a class">Target SE of area of a class</option>
                </select>
              </div>

              {/* =================================================== */}
              {/* TARGET PANEL: strClassArea() (Captura 3 de usuario) */}
              {/* =================================================== */}
              {panelStep === "target_class" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px", borderTop: "1px solid #f1f3f4", paddingTop: "12px" }}>
                  <div>
                    <label style={{ fontSize: "13px", color: "#202124", display: "block", marginBottom: "6px" }}>
                      Select target class
                    </label>
                    <select
                      value={targetClass}
                      onChange={(e) => setTargetClass(e.target.value)}
                      style={{
                        width: "80px",
                        padding: "6px 8px",
                        border: "1px solid #dadce0",
                        borderRadius: "4px",
                        fontSize: "13px",
                        color: "#202124",
                        background: "#ffffff",
                      }}
                    >
                      <option value="1">1</option>
                      <option value="2">2</option>
                      <option value="3">3</option>
                      <option value="4">4</option>
                      <option value="5">5</option>
                    </select>
                  </div>

                  <div style={{ fontSize: "13px", color: "#202124" }}>
                    Area proportion of class {targetClass}: {currentStratumConfig.weight}
                  </div>

                  <div>
                    <label style={{ fontSize: "13px", color: "#202124", display: "block", marginBottom: "6px" }}>
                      Anticipated users accuracy (0-1) for class {targetClass}:
                    </label>
                    <input
                      type="text"
                      value={userAccClass}
                      onChange={(e) => setUserAccClass(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "7px 10px",
                        border: "1px solid #dadce0",
                        borderRadius: "4px",
                        fontSize: "13px",
                        color: "#202124",
                        boxSizing: "border-box",
                      }}
                      placeholder="Users accuracy"
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: "13px", color: "#202124", display: "block", marginBottom: "6px" }}>
                      Specify anticipated proportion of class {targetClass} in other strata
                    </label>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {STRATA_CONFIG.filter((s) => s.id !== Number(targetClass)).map((s) => (
                        <div key={s.id}>
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
                              padding: "6px 10px",
                              border: "1px solid #dadce0",
                              borderRadius: "4px",
                              fontSize: "13px",
                              color: "#202124",
                              boxSizing: "border-box",
                            }}
                            placeholder={`Stratum: ${s.id}`}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: "13px", color: "#202124", display: "block", marginBottom: "6px" }}>
                      Set target SE of the area of target class {targetClass}
                    </label>
                    <input
                      type="text"
                      value={targetSEClass}
                      onChange={(e) => setTargetSEClass(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "7px 10px",
                        border: "1px solid #dadce0",
                        borderRadius: "4px",
                        fontSize: "13px",
                        color: "#202124",
                        boxSizing: "border-box",
                      }}
                      placeholder="Standard error"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleCalculateClassArea}
                    style={{
                      background: "#f1f3f4",
                      border: "1px solid #dadce0",
                      borderRadius: "4px",
                      padding: "8px 16px",
                      fontSize: "13px",
                      color: "#202124",
                      cursor: "pointer",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                      alignSelf: "flex-start",
                      marginTop: "6px",
                    }}
                  >
                    Calculate Sample Size
                  </button>
                </div>
              )}

              {/* =================================================== */}
              {/* TARGET PANEL: strSE() (Target SE overall accuracy)  */}
              {/* =================================================== */}
              {panelStep === "target_se" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px", borderTop: "1px solid #f1f3f4", paddingTop: "12px" }}>
                  <div style={{ fontSize: "13px", color: "#202124", fontWeight: 500 }}>
                    Defining sample size based on target SE for overall accuracy
                  </div>

                  <div>
                    <label style={{ fontSize: "13px", color: "#202124", display: "block", marginBottom: "6px" }}>
                      Specify anticipated users accuracies (0-1)
                    </label>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {STRATA_CONFIG.map((s) => (
                        <div key={s.id}>
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
                              width: "100%",
                              padding: "6px 10px",
                              border: "1px solid #dadce0",
                              borderRadius: "4px",
                              fontSize: "13px",
                              color: "#202124",
                              boxSizing: "border-box",
                            }}
                            placeholder={`Users acc for stratum: ${s.id}`}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: "13px", color: "#202124", display: "block", marginBottom: "6px" }}>
                      Specify target SE of overall accuracy (0-1)
                    </label>
                    <input
                      type="text"
                      value={targetSEOverall}
                      onChange={(e) => setTargetSEOverall(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "7px 10px",
                        border: "1px solid #dadce0",
                        borderRadius: "4px",
                        fontSize: "13px",
                        color: "#202124",
                        boxSizing: "border-box",
                      }}
                      placeholder="SE of overall accuracy"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleCalculateSEOverall}
                    style={{
                      background: "#f1f3f4",
                      border: "1px solid #dadce0",
                      borderRadius: "4px",
                      padding: "8px 16px",
                      fontSize: "13px",
                      color: "#202124",
                      cursor: "pointer",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                      alignSelf: "flex-start",
                      marginTop: "6px",
                    }}
                  >
                    Calculate Sample Size
                  </button>
                </div>
              )}

              {/* =================================================== */}
              {/* TARGET PANEL: strArbitrary()                        */}
              {/* =================================================== */}
              {panelStep === "arbitrary" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px", borderTop: "1px solid #f1f3f4", paddingTop: "12px" }}>
                  <label style={{ fontSize: "13px", color: "#202124", display: "block" }}>
                    Allocate sample size to strata
                  </label>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {STRATA_CONFIG.map((s) => (
                      <div key={s.id}>
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
                            width: "100%",
                            padding: "6px 10px",
                            border: "1px solid #dadce0",
                            borderRadius: "4px",
                            fontSize: "13px",
                            color: "#202124",
                            boxSizing: "border-box",
                          }}
                          placeholder={`Sample size in stratum: ${s.id}`}
                        />
                      </div>
                    ))}
                  </div>

                  <div>
                    <label style={{ fontSize: "13px", color: "#202124", display: "block", marginBottom: "6px" }}>
                      Create sample
                    </label>
                    <button
                      type="button"
                      onClick={handleCreateSample}
                      style={{
                        background: "#f1f3f4",
                        border: "1px solid #dadce0",
                        borderRadius: "4px",
                        padding: "7px 16px",
                        fontSize: "13px",
                        color: "#202124",
                        cursor: "pointer",
                        boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                      }}
                    >
                      Create sample
                    </button>
                  </div>
                </div>
              )}

              {/* =================================================== */}
              {/* SAMPLE SIZE PANEL: Resultados (Captura 4 de usuario) */}
              {/* =================================================== */}
              {(panelStep === "calculated" || panelStep === "sample_created") && (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px", borderTop: "1px solid #f1f3f4", paddingTop: "12px" }}>
                  
                  <div style={{ fontSize: "13px", color: "#202124", fontWeight: 500 }}>
                    Recommended sample size: {sampleSize}
                  </div>

                  <div style={{ fontSize: "13px", color: "#202124" }}>
                    Equal allocation: {equalAllocation}
                  </div>

                  <div style={{ fontSize: "13px", color: "#202124" }}>
                    Proportional allocation: {propAllocation.join(",")}
                  </div>

                  <div>
                    <label style={{ fontSize: "13px", color: "#202124", display: "block", marginBottom: "6px", fontWeight: 500 }}>
                      Allocate sample to strata
                    </label>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {STRATA_CONFIG.map((s) => (
                        <div key={s.id}>
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
                              width: "100%",
                              padding: "6px 10px",
                              border: "1px solid #dadce0",
                              borderRadius: "4px",
                              fontSize: "13px",
                              color: "#202124",
                              boxSizing: "border-box",
                            }}
                            placeholder={`Sample size in stratum: ${s.id}`}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: "13px", color: "#202124", display: "block", marginBottom: "6px" }}>
                      Create sample
                    </label>
                    <button
                      type="button"
                      onClick={handleCreateSample}
                      style={{
                        background: "#f1f3f4",
                        border: "1px solid #dadce0",
                        borderRadius: "4px",
                        padding: "7px 16px",
                        fontSize: "13px",
                        color: "#202124",
                        cursor: "pointer",
                        boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                      }}
                    >
                      Create sample
                    </button>
                  </div>
                </div>
              )}

              {/* =================================================== */}
              {/* ALLOCATION PANEL: Add to map & Export (Captura 4)    */}
              {/* =================================================== */}
              {panelStep === "sample_created" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px", borderTop: "1px solid #f1f3f4", paddingTop: "12px" }}>
                  
                  <div>
                    <label style={{ fontSize: "13px", color: "#202124", display: "block", marginBottom: "6px" }}>
                      Add to map
                    </label>
                    <button
                      type="button"
                      onClick={handleAddToMap}
                      style={{
                        background: "#f1f3f4",
                        border: "1px solid #dadce0",
                        borderRadius: "4px",
                        padding: "7px 16px",
                        fontSize: "13px",
                        color: "#202124",
                        cursor: "pointer",
                        boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                      }}
                    >
                      Add
                    </button>
                  </div>

                  <div>
                    <label style={{ fontSize: "13px", color: "#202124", display: "block", marginBottom: "6px" }}>
                      Export sample
                    </label>
                    <button
                      type="button"
                      onClick={handleExportSample}
                      style={{
                        background: "#f1f3f4",
                        border: "1px solid #dadce0",
                        borderRadius: "4px",
                        padding: "7px 16px",
                        fontSize: "13px",
                        color: "#202124",
                        cursor: "pointer",
                        boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                      }}
                    >
                      Export sample
                    </button>
                  </div>

                  {/* Integración Adicional Nativa con INAB SIG */}
                  <div style={{ marginTop: "10px", paddingTop: "14px", borderTop: "1px dashed #d0d0d0" }}>
                    <button
                      type="button"
                      onClick={handleCreateInabProject}
                      style={{
                        width: "100%",
                        background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                        border: "none",
                        borderRadius: "6px",
                        padding: "10px 14px",
                        fontSize: "13px",
                        fontWeight: 600,
                        color: "#ffffff",
                        cursor: "pointer",
                        boxShadow: "0 2px 6px rgba(16, 185, 129, 0.3)",
                      }}
                    >
                      ✓ Crear Proyecto INAB con este Muestreo
                    </button>
                  </div>
                </div>
              )}

            </div>
          )}

        </div>
      </div>

    </div>
  );
};
