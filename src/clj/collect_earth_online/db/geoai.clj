(ns collect-earth-online.db.geoai
  (:require [clj-http.client            :as http]
            [clojure.data.json          :as json]
            [triangulum.type-conversion :as tc]
            [triangulum.config          :refer [get-config]]
            [triangulum.database        :refer [call-sql sql-primitive]]
            [triangulum.response        :refer [data-response]]
            [clj-gcloud.storage         :as st]))

(defn- get-gcs-resource []
  (try
    (let [project-id  (get-config :gcs-integration :project-name)
          credentials (get-config :gcs-integration :credentials)]
      (when (and (seq project-id) (seq credentials))
        (st/init {:project-id  project-id
                  :credentials credentials})))
    (catch Exception e
      (println "[WARN] Error al inicializar GCS para GeoAI:" (.getMessage e))
      nil)))

(defn- get-gs-url []
  (or (get-config :gcs-integration :bucket-url) ""))

(defn generate-geojson [project-id]
  (let [plots (call-sql "get_plots_as_geojson" project-id)]
    {:type "FeatureCollection"
     :name "alerts"
     :crs  {:type "name" :properties {:name "urn:ogc:def:crs:OGC:1.3:CRS84"}}
     :features (mapv (fn [p]
                       (-> p
                           (update-vals tc/jsonb->clj)
                           (assoc-in [:properties :plotid] (:id p))
                           (assoc :type "Feature")
                           (dissoc :id)))
                     plots)}))

(defn- upload-json-to-gcs [project-id file-name year]
  (if-let [storage (get-gcs-resource)]
    (let [geojson      (generate-geojson project-id)
          json-str     (json/write-str geojson)
          tmp-file     (java.io.File/createTempFile file-name ".geojson")
          bq-tablename (format "%s_embed%s_pp" file-name year)
          gs-url       (get-gs-url)]
      (spit tmp-file json-str)
      (st/copy-file-to-storage storage tmp-file (str gs-url file-name ".geojson"))
      (call-sql "update_geoai_assets" (tc/val->int project-id) (tc/clj->jsonb {year bq-tablename}))
      gs-url)
    (throw (ex-info "GCS integration is not configured." {:project-id project-id}))))

(defn clj->int-array-literal
  [arr]
  (str "{" (clojure.string/join "," (map int arr)) "}"))

(defn search-plot-by-similarity
  [project-id plot-id year]
  (let [bq-table          (-> (call-sql "get_bq_table" project-id year)
                              (sql-primitive)
                              (clojure.string/split #"\.")
                              (last))
        api-url           (get-config :gcs-integration :api-url)]
    (if (seq api-url)
      (let [req               (:body (http/get
                                      (str api-url "/search")
                                      {:query-params {:uniqueid plot-id
                                                      :table    bq-table
                                                      :matches  50}}))
            similar-plots-arr (map #(get % :base_plotid) (tc/json->clj req))]
        (call-sql "insert_geoai_cache"
                  project-id
                  plot-id
                  (clj->int-array-literal similar-plots-arr)
                  (tc/clj->jsonb req)))
      (println "[WARN] GCS API URL no configurada para búsqueda de similitud."))))

(defn start-plot-similarity! [{:keys [params]}]
  (let [project-id        (:projectId params)
        reference-plot-id (tc/val->int (:referencePlotId params))
        similarity-years  (:similarityYears params)
        file-name         (str "ceo-" project-id "-plots_" (first similarity-years))
        plot-id           (sql-primitive (call-sql "get_plot_id_by_visible_id" project-id reference-plot-id))]
    (call-sql "update_reference_plot" project-id plot-id)
    (try
      (upload-json-to-gcs project-id file-name (first similarity-years))
      (data-response {:message "calculating plot similarity."})
      (catch Exception e
        (data-response {:message (str "Error en GeoAI: " (.getMessage e))} {:status 500})))))

(defn recalculate-plot-similarity [{:keys [params]}]
  (let [project-id        (:projectId params)
        reference-plot-id (tc/val->int (:referencePlotId params))
        similarity-years  (:similarityYears params)
        file-name         (str "ceo-" project-id "-plots_" (first similarity-years))
        plot-id           (sql-primitive (call-sql "get_plot_id_by_visible_id" project-id reference-plot-id))]
    (try
      (search-plot-by-similarity project-id plot-id (first similarity-years))
      (data-response {:message "successfully reprocessed plot similarity"})
      (catch Exception ex
        (data-response {:message "error recalculating plot similarity"})))))
