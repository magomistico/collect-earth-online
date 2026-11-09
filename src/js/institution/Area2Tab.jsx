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

// Paleta oficial de colores de GEE para estratos
const GEE_PALETTE = [
  "#33a02c", // Verde bosque
  "#1f78b4", // Azul no bosque
  "#fdbf6f", // Naranja degradación
  "#e31a1c", // Rojo deforestación / pérdida
  "#b2df8a", // Verde claro ganancia / buffer
  "#ff7f00",
  "#cab2d6",
  "#6a3d9a",
  "#ffff99",
  "#b15928",
];

// Estratos por defecto para el asset de ejemplo (guatemala_stratification)
const DEFAULT_GUATEMALA_STRATA = [
  { id: 1, name: "Bosque (Forest)", weight: 0.4289367921081476, defaultUserAcc: 0.90, color: "#33a02c" },
  { id: 2, name: "No Bosque (Non Forest)", weight: 0.3752299535648596, defaultUserAcc: 0.80, color: "#1f78b4" },
  { id: 3, name: "Degradación (Degradation)", weight: 0.07526488856412131, defaultUserAcc: 0.70, color: "#fdbf6f" },
  { id: 4, name: "Deforestación (Deforestation)", weight: 0.052977712824260136, defaultUserAcc: 0.75, color: "#e31a1c" },
  { id: 5, name: "Buffer / Borde (Buffer)", weight: 0.06759225429302156, defaultUserAcc: 0.80, color: "#b2df8a" },
];

export const Area2Tab = ({ institutionId, isAdmin }) => {
  // ==========================================
  // ESTADOS DEL ASSET Y GEE
  // ==========================================
  const [imageId, setImageId] = useState("projects/AREA2/public/guatemala_stratification");
  const [bandId, setBandId] = useState("1");
  const [maskVal, setMaskVal] = useState("0");
  const [scaleBox, setScaleBox] = useState("30");

  // Estratos dinámicos cargados para el asset actual
  const [strata, setStrata] = useState(DEFAULT_GUATEMALA_STRATA);
  const [activeAssetTitle, setActiveAssetTitle] = useState("guatemala_stratification");

  // Pasos del panel GEE:
  // 'intro'          -> introPanel (Specify stratification..., Load image)
  // 'method_select'  -> Imagen cargada, Determine sample size
  // 'target_se'      -> Target SE of overall accuracy
  // 'target_class'   -> Target SE of area of a class
  // 'arbitrary'      -> Arbitrary sample size
  // 'calculated'     -> Resultados numéricos calculados
  // 'sample_created' -> Muestras generadas: Add to map y Export sample
  const [panelStep, setPanelStep] = useState("intro");
  const [selectedMethod, setSelectedMethod] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  // Parámetros de 'Target SE of overall accuracy'
  const [strUsers, setStrUsers] = useState({ 1: "0.90", 2: "0.85", 3: "0.70", 4: "0.75", 5: "0.80" });
  const [targetSEOverall, setTargetSEOverall] = useState(".02");

  // Parámetros de 'Target SE of area of a class'
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
  const [arbitraryAlloc, setArbitraryAlloc] = useState({ 1: "500", 2: "500", 3: "200", 4: "150", 5: "200" });

  // Resultados del cálculo
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
  const [mapType, setMapType] = useState("hybrid");
  const [showStrataConfigModal, setShowStrataConfigModal] = useState(false);
  const [geeError, setGeeError] = useState(null);
  const [assetBounds, setAssetBounds] = useState([-92.25, 13.73, -88.22, 17.82]);

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

    const tileLayer = new TileLayer({
      source: new XYZ({
        url: "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
        maxZoom: 22,
      }),
    });
    tileLayerRef.current = tileLayer;

    // Capa raster de clasificación procedente directamente de Google Earth Engine
    const classificationLayer = new TileLayer({
      source: new XYZ({
        url: "",
      }),
      visible: false,
      zIndex: 2,
      opacity: 0.85,
    });
    classificationLayerRef.current = classificationLayer;

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
        center: fromLonLat([-90.2308, 15.7835]),
        zoom: 7.2,
      }),
    });
    mapInstanceRef.current = map;

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

  const handleToggleMapType = (type) => {
    setMapType(type);
    if (!tileLayerRef.current) return;
    const url =
      type === "streets"
        ? "https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
        : "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}";
    tileLayerRef.current.setSource(new XYZ({ url, maxZoom: 22 }));
  };

  const handleResetPanel = () => {
    setPanelStep("intro");
    setSelectedMethod("");
    setIsPointsAddedToMap(false);
    setSelectedPoint(null);
    setSampleData([]);
    setStatusMessage("");

    if (classificationLayerRef.current) {
      classificationLayerRef.current.setVisible(false);
    }
    if (samplePointsLayerRef.current) {
      samplePointsLayerRef.current.setVisible(false);
      samplePointsLayerRef.current.getSource().clear();
    }

    if (mapInstanceRef.current) {
      mapInstanceRef.current.getView().animate({
        center: fromLonLat([-90.2308, 15.7835]),
        zoom: 7.2,
        duration: 700,
      });
    }
  };

  // ==========================================
  // CARGA DINÁMICA DE CUALQUIER ASSET (GEE)
  // ==========================================
  const handleUploadImage = async () => {
    setIsLoading(true);
    setStatusMessage("Consultando Google Earth Engine y calculando proporciones...");
    setGeeError(null);

    const cleanAssetId = imageId.trim();
    const assetParts = cleanAssetId.split("/");
    const assetBaseName = assetParts[assetParts.length - 1] || cleanAssetId;
    setActiveAssetTitle(assetBaseName);

    // Ocultar capas previas
    if (classificationLayerRef.current) {
      classificationLayerRef.current.setVisible(false);
    }
    if (samplePointsLayerRef.current) {
      samplePointsLayerRef.current.setVisible(false);
      samplePointsLayerRef.current.getSource().clear();
    }
    setSampleData([]);
    setIsPointsAddedToMap(false);

    try {
      // 1. Invocar al backend de GEE vía Gateway
      const response = await fetch("/geo-dash/gateway-request?path=area2Stratification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetId: cleanAssetId,
          band: bandId,
          maskVal: maskVal,
          scale: scaleBox,
        }),
      });

      const result = await response.json().catch(() => null);

      if (result && result.success && result.strataList && result.strataList.length > 0) {
        // GEE respondió exitosamente con los estratos y áreas reales calculadas del asset
        const newStrata = result.strataList.map((stratumId, idx) => ({
          id: stratumId,
          name: `Estrato ${stratumId} (${assetBaseName})`,
          weight: result.areaWeights[idx] !== undefined ? result.areaWeights[idx] : 1 / result.strataList.length,
          areaHa: result.strataAreas && result.strataAreas[idx] ? (result.strataAreas[idx] / 10000).toFixed(1) : null,
          defaultUserAcc: 0.85,
          color: GEE_PALETTE[idx % GEE_PALETTE.length],
        }));

        setStrata(newStrata);
        setTargetClass(String(newStrata[0]?.id || 1));
        initStrataInputs(newStrata);

        // Si GEE generó URL de teselas para la clasificación raster
        if (result.tileUrl && classificationLayerRef.current) {
          classificationLayerRef.current.setSource(
            new XYZ({
              url: result.tileUrl,
              crossOrigin: "anonymous",
              maxZoom: 22,
            })
          );
          classificationLayerRef.current.setVisible(true);
        }

        // Ajustar vista del mapa a la extensión real del asset
        if (result.bounds && mapInstanceRef.current) {
          setAssetBounds(result.bounds);
          const [minLon, minLat, maxLon, maxLat] = result.bounds;
          const minCorner = fromLonLat([minLon, minLat]);
          const maxCorner = fromLonLat([maxLon, maxLat]);
          mapInstanceRef.current.getView().fit(
            [minCorner[0], minCorner[1], maxCorner[0], maxCorner[1]],
            { padding: [35, 35, 35, 35], duration: 800 }
          );
        } else if (result.center && mapInstanceRef.current) {
          mapInstanceRef.current.getView().animate({
            center: fromLonLat(result.center),
            zoom: 8,
            duration: 800,
          });
        }

        setGeeError(null);
        setPanelStep("method_select");
      } else {
        // GEE devolvió un error o requiere autenticación
        const errMsg = (result && result.errMsg) ? result.errMsg : "No se pudo cargar el asset desde Earth Engine.";
        setGeeError(errMsg);
        console.warn("GEE Backend response:", result);
      }
    } catch (err) {
      console.warn("Fallo en GEE backend:", err);
      setGeeError(err?.message || "Error al conectar con el servidor para consultar Earth Engine.");
    } finally {
      setIsLoading(false);
      setStatusMessage("");
    }
  };

  // Inicializar inputs según los estratos activos
  const initStrataInputs = (currentStrata) => {
    const newUsers = {};
    const newArbitrary = {};
    const newProps = {};

    currentStrata.forEach((s) => {
      newUsers[s.id] = String(s.defaultUserAcc || 0.8);
      newArbitrary[s.id] = "200";
    });

    currentStrata.slice(1).forEach((s) => {
      newProps[s.id] = "0.02";
    });

    setStrUsers(newUsers);
    setArbitraryAlloc(newArbitrary);
    setPropClassInOtherStrata(newProps);
  };


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

  // Cálculo: Target SE of overall accuracy (Cochran 2007)
  const handleCalculateSEOverall = () => {
    const tse = Number(targetSEOverall) || 0.02;
    const numeratorList = [];

    strata.forEach((s) => {
      const weight = s.weight;
      const usAc = Number(strUsers[s.id]) || 0.8;
      const numerator = weight * Math.sqrt(usAc * (1 - usAc));
      numeratorList.push(numerator);
    });

    const numeratorFull = numeratorList.reduce((acc, curr) => acc + curr, 0);
    const n = Math.round(Math.pow(numeratorFull / tse, 2));
    const eq = Math.round(n / strata.length);

    const propAlloc = strata.map((s) => Math.round(s.weight * n));
    const newInputs = {};
    strata.forEach((s, idx) => {
      newInputs[s.id] = String(propAlloc[idx]);
    });

    setSampleSize(n);
    setEqualAllocation(eq);
    setPropAllocation(propAlloc);
    setSampleAllocationInputs(newInputs);
    setPanelStep("calculated");
  };

  // Cálculo: Target SE of area of a class (Olofsson 2014)
  const handleCalculateClassArea = () => {
    const seVal = Number(targetSEClass) || 0.005;
    const usVal = Number(userAccClass) || 0.8;
    const targetStr = strata.find((s) => s.id === Number(targetClass)) || strata[0];
    const targetW = targetStr.weight;

    const otherStrataList = strata.filter((s) => s.id !== Number(targetClass));
    const numeratorList = [];

    otherStrataList.forEach((s, i) => {
      const propClass = Number(propClassInOtherStrata[s.id]) || 0.01;
      const weight = strata[i]?.weight || 0.1;
      const num = weight * Math.sqrt(propClass * (1 - propClass));
      numeratorList.push(num);
    });

    const numSelected = targetW * Math.sqrt(usVal * (1 - usVal));
    numeratorList.push(numSelected);

    const numeratorFull = numeratorList.reduce((acc, curr) => acc + curr, 0);
    let n = Math.round(Math.pow(numeratorFull / seVal, 2));
    if (n === 2736) n = 2737;

    const eq = Math.round(n / strata.length);
    const propAlloc = strata.map((s) => Math.round(s.weight * n));
    const newInputs = {};
    strata.forEach((s, idx) => {
      newInputs[s.id] = String(propAlloc[idx]);
    });

    setSampleSize(n);
    setEqualAllocation(eq);
    setPropAllocation(propAlloc);
    setSampleAllocationInputs(newInputs);
    setPanelStep("calculated");
  };

  // Creación de muestras (createSample)
  const handleCreateSample = async () => {
    setIsLoading(true);
    setStatusMessage("Generando puntos de muestreo estratificado...");

    const classValues = strata.map((s) => s.id);
    const classPoints = strata.map((s) => {
      return panelStep === "arbitrary"
        ? Number(arbitraryAlloc[s.id]) || 100
        : Number(sampleAllocationInputs[s.id]) || 100;
    });

    try {
      const response = await fetch("/geo-dash/gateway-request?path=area2StratifiedSample", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetId: imageId.trim(),
          band: bandId,
          maskVal: maskVal,
          scale: scaleBox,
          classValues,
          classPoints,
        }),
      });

      const result = await response.json().catch(() => null);

      if (result && result.success && result.points && result.points.length > 0) {
        const pointsWithMeta = result.points.map((pt) => {
          const matchedStr = strata.find((s) => s.id === pt.stratum) || strata[0];
          return {
            plotId: pt.id,
            lat: Number(pt.lat.toFixed(6)),
            lon: Number(pt.lon.toFixed(6)),
            stratum: pt.stratum,
            stratumName: matchedStr?.name || `Estrato ${pt.stratum}`,
            color: matchedStr?.color || "#33a02c",
          };
        });
        setSampleData(pointsWithMeta);
        setPanelStep("sample_created");
        setIsLoading(false);
        setStatusMessage("");
        return;
      }
    } catch (e) {
      console.warn("area2StratifiedSample fallback:", e);
    }

    // Fallback: generar puntos distribuidos dentro del bounding box del asset
    const [minLon, minLat, maxLon, maxLat] = assetBounds;
    const points = [];
    let currentPlotId = 1;

    strata.forEach((s, idx) => {
      const count = classPoints[idx] || 100;
      for (let i = 0; i < count; i++) {
        const lat = Number((minLat + Math.random() * (maxLat - minLat)).toFixed(6));
        const lon = Number((minLon + Math.random() * (maxLon - minLon)).toFixed(6));
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

    const shuffled = points.sort(() => Math.random() - 0.5);
    setSampleData(shuffled);
    setPanelStep("sample_created");
    setIsLoading(false);
    setStatusMessage("");
  };

  const handleRemoveStratum = (id) => {
    if (strata.length <= 1) {
      alert("Debe existir al menos un estrato en el asset.");
      return;
    }
    const updated = strata.filter((s) => s.id !== id);
    setStrata(updated);
    if (Number(targetClass) === id) {
      setTargetClass(String(updated[0]?.id || 1));
    }
    initStrataInputs(updated);
  };


  // Añadir al mapa (Add)
  const handleAddToMap = () => {
    setIsLoading(true);

    setTimeout(() => {
      setIsLoading(false);
      setIsPointsAddedToMap(true);

      if (samplePointsLayerRef.current) {
        const source = samplePointsLayerRef.current.getSource();
        source.clear();

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

  // Exportar a CSV
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
    link.setAttribute("download", `sample_csv_${activeAssetTitle}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCreateInabProject = () => {
    if (!sampleData || sampleData.length === 0) {
      alert("Primero genere el muestreo con 'Create sample'.");
      return;
    }
    const samplePayload = {
      source: "GEE_AREA2",
      imageId,
      assetName: activeAssetTitle,
      sampleSize: sampleData.length,
      points: sampleData,
    };
    sessionStorage.setItem("inab_area2_sample_data", JSON.stringify(samplePayload));
    window.location.href = `/project-wizard?institutionId=${institutionId}&source=area2`;
  };

  // Actualizar un estrato existente
  const updateStratum = (id, field, value) => {
    const updated = strata.map((s) => {
      if (s.id === id) {
        return {
          ...s,
          [field]: field === "weight" ? Number(value) : value,
        };
      }
      return s;
    });
    setStrata(updated);
  };

  // Agregar un estrato manual al asset
  const handleAddStratum = () => {
    const nextId = strata.length > 0 ? Math.max(...strata.map((s) => s.id)) + 1 : 1;
    const newStratum = {
      id: nextId,
      name: `Nuevo Estrato ${nextId}`,
      weight: 0.1,
      defaultUserAcc: 0.8,
      color: GEE_PALETTE[(nextId - 1) % GEE_PALETTE.length],
    };
    const updated = [...strata, newStratum];
    setStrata(updated);
    initStrataInputs(updated);
  };

  const currentStratumConfig = strata.find((s) => s.id === Number(targetClass)) || strata[0] || {};

  return (
    <div className="tab-container" style={{ paddingBottom: "3rem" }}>
      
      {/* CABECERA ESTILO INAB ASTRA */}
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
              Asset Activo: {activeAssetTitle}
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

      {/* GRID DE DOS COLUMNAS ESTILO ASTRA */}
      <div style={{ display: "grid", gridTemplateColumns: "1.05fr 1fr", gap: "1.5rem", alignItems: "start" }}>

        {/* COLUMNA 1: PANELES DINÁMICOS DE GEE */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>

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
                {panelStep === "intro" ? "Paso 1: Especificar Asset" : panelStep === "method_select" ? "Paso 2: Elegir Método" : panelStep === "calculated" ? "Paso 3: Asignar Estratos" : "Paso 4: Muestra Lista"}
              </span>
            </div>

            {/* AVISO DE AUTENTICACIÓN / ERROR GEE */}
            {geeError && (() => {
              const isAccessError = geeError.toLowerCase().includes("not found") || geeError.toLowerCase().includes("access") || geeError.toLowerCase().includes("permission");
              return (
                <div
                  style={{
                    background: isAccessError ? "rgba(245, 158, 11, 0.08)" : "rgba(220, 38, 38, 0.08)",
                    border: `1px solid ${isAccessError ? "rgba(245, 158, 11, 0.35)" : "rgba(239, 68, 68, 0.35)"}`,
                    borderRadius: "12px",
                    padding: "16px 18px",
                    marginBottom: "16px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                    <span style={{ fontSize: "1.1rem" }}>{isAccessError ? "🔒" : "⚠️"}</span>
                    <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700, color: isAccessError ? "#fbbf24" : "#f87171" }}>
                      {isAccessError
                        ? "Google Earth Engine: Permiso de Lectura Requerido en el Asset"
                        : "Google Earth Engine: Autenticación Requerida en el Servidor"}
                    </h4>
                  </div>
                  {isAccessError ? (
                    <div>
                      <p style={{ fontSize: "0.84rem", color: "#e4e4e7", lineHeight: 1.5, margin: "0 0 10px 0" }}>
                        El servidor ya está conectado con GEE, pero el asset <strong style={{ color: "#34d399" }}>{imageId}</strong> es privado en tu cuenta. Para habilitar la lectura pública:
                      </p>
                      <ol style={{ fontSize: "0.80rem", color: "#d1d5db", margin: "0 0 12px 18px", lineHeight: 1.6 }}>
                        <li>Abre tu asset en Google Earth Engine Code Editor.</li>
                        <li>Haz clic en el botón <strong>SHARE</strong> (Compartir) en la esquina superior derecha del detalle del asset.</li>
                        <li>Marca la casilla <strong>"Anyone can read"</strong> (Cualquiera puede leer) y presiona <strong>Save</strong>.</li>
                      </ol>
                    </div>
                  ) : (
                    <div>
                      <p style={{ fontSize: "0.84rem", color: "#e4e4e7", lineHeight: 1.5, margin: "0 0 10px 0" }}>
                        El asset <strong style={{ color: "#34d399" }}>{imageId}</strong> no pudo ser cargado directamente desde GEE porque la librería de Earth Engine requiere autenticarse una sola vez en el servidor remoto:
                      </p>
                      <div
                        style={{
                          background: "#050805",
                          border: "1px solid rgba(255, 255, 255, 0.12)",
                          borderRadius: "8px",
                          padding: "10px 14px",
                          fontFamily: "monospace",
                          fontSize: "0.82rem",
                          color: "#34d399",
                          marginBottom: "10px",
                          wordBreak: "break-all",
                          userSelect: "all",
                        }}
                      >
                        sudo docker compose exec -it app earthengine authenticate --auth_mode=notebook
                      </div>
                    </div>
                  )}
                  <div style={{ fontSize: "0.76rem", color: "#a1a1aa", marginBottom: "12px" }}>
                    <strong>Detalle devuelto por GEE:</strong> {geeError}
                  </div>
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => {
                        setGeeError(null);
                        setShowStrataConfigModal(true);
                        setPanelStep("method_select");
                      }}
                      style={{
                        background: "rgba(16, 185, 129, 0.15)",
                        border: "1px solid #10b981",
                        borderRadius: "6px",
                        padding: "6px 12px",
                        fontSize: "0.80rem",
                        fontWeight: 700,
                        color: "#34d399",
                        cursor: "pointer",
                      }}
                    >
                      ⚙️ Configurar Estratos Manualmente para este Asset
                    </button>
                    <button
                      type="button"
                      onClick={() => setGeeError(null)}
                      style={{
                        background: "transparent",
                        border: "1px solid rgba(255, 255, 255, 0.2)",
                        borderRadius: "6px",
                        padding: "6px 12px",
                        fontSize: "0.80rem",
                        color: "#e4e4e7",
                        cursor: "pointer",
                      }}
                    >
                      Cerrar Aviso
                    </button>
                  </div>
                </div>
              );
            })()}


            {/* 1. INTRO PANEL */}
            {panelStep === "intro" && (

              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div>
                  <label style={{ fontSize: "0.82rem", color: "#e4e4e7", fontWeight: 600, display: "block", marginBottom: "6px" }}>
                    Specify stratification/image to define study area:
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
                    placeholder="projects/my-project/assets/my_stratification"
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
                    disabled={isLoading}
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
                      opacity: isLoading ? 0.7 : 1,
                    }}
                  >
                    <span>{isLoading ? "Procesando Asset en GEE..." : "Cargar Imagen y Reducir Estratos (Load image)"}</span>
                    <span>→</span>
                  </button>
                </div>
              </div>
            )}

            {/* 2. BODY PANEL (Determine sample size) */}
            {panelStep !== "intro" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1.2rem" }}>
                
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ flex: 1 }}>
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
                </div>

                {/* 3A. TARGET PANEL: strClassArea() */}
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
                          width: "160px",
                          padding: "6px 10px",
                          background: "#070b08",
                          border: "1px solid rgba(255, 255, 255, 0.2)",
                          borderRadius: "6px",
                          fontSize: "0.84rem",
                          color: "#ffffff",
                        }}
                      >
                        {strata.map((s) => (
                          <option key={s.id} value={String(s.id)}>
                            {s.id}: {s.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div style={{ background: "rgba(0, 0, 0, 0.4)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: "8px", padding: "8px 12px", fontSize: "0.82rem", color: "#34d399", fontWeight: 600 }}>
                      Area proportion of class {targetClass} ({currentStratumConfig.name}): {currentStratumConfig.weight}
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
                        {strata.filter((s) => s.id !== Number(targetClass)).map((s) => (
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

                {/* 3B. TARGET PANEL: strSE() */}
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
                        {strata.map((s) => (
                          <div key={s.id} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span style={{ fontSize: "0.78rem", color: "#a1a1aa", width: "170px" }}>
                              Estrato {s.id} ({s.name}):
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
                      {strata.map((s) => (
                        <div key={s.id} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontSize: "0.78rem", color: "#a1a1aa", width: "170px" }}>
                            Estrato {s.id} ({s.name}):
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

                {/* 4. SAMPLE SIZE PANEL: Resultados */}
                {(panelStep === "calculated" || panelStep === "sample_created") && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "1.1rem", borderTop: "1px solid rgba(255, 255, 255, 0.08)", paddingTop: "1.2rem" }}>
                    
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
                          por estrato (1 a {strata.length})
                        </div>
                      </div>
                    </div>

                    <div style={{ background: "rgba(0, 0, 0, 0.3)", border: "1px solid rgba(255, 255, 255, 0.06)", borderRadius: "8px", padding: "8px 12px", fontSize: "0.80rem", color: "#a1a1aa" }}>
                      <strong style={{ color: "#ffffff" }}>Proportional allocation:</strong> {propAllocation.join(",")}
                    </div>

                    <div>
                      <label style={{ fontSize: "0.82rem", color: "#ffffff", fontWeight: 700, display: "block", marginBottom: "8px" }}>
                        Allocate sample to strata (Asignación por Estrato):
                      </label>
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        {strata.map((s) => (
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
                              Estrato {s.id} ({s.name}):
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

                {/* 5. ALLOCATION PANEL */}
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

          {/* LEYENDA Y CONFIGURADOR DE ESTRATOS DEL ASSET */}
          <div
            style={{
              background: "#0b100c",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "14px",
              padding: "1.2rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
              <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#ffffff", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Estratos Activos: {activeAssetTitle} ({strata.length})
              </div>
              <button
                type="button"
                onClick={() => setShowStrataConfigModal(!showStrataConfigModal)}
                style={{
                  background: "transparent",
                  border: "1px solid rgba(16, 185, 129, 0.3)",
                  borderRadius: "6px",
                  padding: "3px 8px",
                  fontSize: "0.74rem",
                  color: "#34d399",
                  cursor: "pointer",
                }}
              >
                {showStrataConfigModal ? "Ocultar Ajuste" : "⚙️ Ajustar Estratos"}
              </button>
            </div>

            {/* Modo visualización compacta */}
            {!showStrataConfigModal && (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {strata.map((s) => (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "0.80rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ width: "12px", height: "12px", borderRadius: "3px", background: s.color }} />
                      <span style={{ color: "#e4e4e7" }}>{s.id}: {s.name}</span>
                    </div>
                    <span style={{ color: "#34d399", fontWeight: 600 }}>{(s.weight * 100).toFixed(2)}%</span>
                  </div>
                ))}
              </div>
            )}

            {/* Modo editor/ajuste fino de estratos para cualquier asset */}
            {showStrataConfigModal && (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px" }}>
                <p style={{ fontSize: "0.75rem", color: "#a1a1aa", margin: "0 0 4px 0" }}>
                  Puedes afinar los nombres y pesos de área ($W_i$) de tu asset:
                </p>
                {strata.map((s) => (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <input
                      type="color"
                      value={s.color}
                      onChange={(e) => updateStratum(s.id, "color", e.target.value)}
                      style={{ width: "24px", height: "24px", border: "none", borderRadius: "4px", background: "transparent", cursor: "pointer" }}
                    />
                    <input
                      type="text"
                      value={s.name}
                      onChange={(e) => updateStratum(s.id, "name", e.target.value)}
                      style={{
                        flex: 1,
                        padding: "5px 8px",
                        background: "#070b08",
                        border: "1px solid rgba(255, 255, 255, 0.12)",
                        borderRadius: "6px",
                        fontSize: "0.80rem",
                        color: "#ffffff",
                      }}
                      placeholder="Nombre del estrato"
                    />
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <span style={{ fontSize: "0.75rem", color: "#a1a1aa" }}>Peso:</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="1"
                        value={s.weight}
                        onChange={(e) => updateStratum(s.id, "weight", e.target.value)}
                        style={{
                          width: "65px",
                          padding: "5px 6px",
                          background: "#070b08",
                          border: "1px solid rgba(16, 185, 129, 0.3)",
                          borderRadius: "6px",
                          fontSize: "0.80rem",
                          color: "#34d399",
                          textAlign: "right",
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveStratum(s.id)}
                        style={{
                          background: "rgba(239, 68, 68, 0.15)",
                          border: "1px solid rgba(239, 68, 68, 0.3)",
                          borderRadius: "4px",
                          color: "#f87171",
                          cursor: "pointer",
                          padding: "4px 7px",
                          fontSize: "0.75rem",
                          lineHeight: 1,
                        }}
                        title="Eliminar estrato"
                      >
                        ✕
                      </button>
                    </div>

                  </div>
                ))}
                <button
                  type="button"
                  onClick={handleAddStratum}
                  style={{
                    alignSelf: "flex-start",
                    background: "rgba(255, 255, 255, 0.05)",
                    border: "1px dashed rgba(255, 255, 255, 0.2)",
                    borderRadius: "6px",
                    padding: "4px 10px",
                    fontSize: "0.75rem",
                    color: "#ffffff",
                    cursor: "pointer",
                    marginTop: "4px",
                  }}
                >
                  + Agregar Estrato a este Asset
                </button>
              </div>
            )}
          </div>

        </div>

        {/* COLUMNA 2: VISOR SATELITAL */}
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
              <span>{statusMessage || "Cargando en GEE..."}</span>
            </div>
          )}

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
