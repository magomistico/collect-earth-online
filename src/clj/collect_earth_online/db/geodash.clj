(ns collect-earth-online.db.geodash
  (:require [triangulum.database :refer [call-sql]]
            [triangulum.type-conversion :as tc]
            [triangulum.config :refer [get-config]]
            [triangulum.response :refer [data-response]]
            [clojure.string :as str]))

;;; Constants

(def ^:private max-age (* 24 60 60 1000)) ; Once a day

;;; GEE Python interface (carga diferida/resiliente para evitar caídas si libpython C no está disponible)

(defonce ^:private last-initialized (atom 0))
(defonce ^:private init-lock (Object.))
(defonce ^:private python-available? (atom nil))
(defonce ^:private python-init-error (atom nil))

(defn- init-python! []
  (when (nil? @python-available?)
    (locking init-lock
      (when (nil? @python-available?)
        (try
          (require '[libpython-clj2.require :refer [require-python]])
          (require '[libpython-clj2.python :as py :refer [py. get-attr]])
          (eval '(do
                   (require-python '[sys :bind-ns])
                   (py. (get-attr sys "path") "append" "src/py")
                   (require-python '[gee.routes :as gee :reload]
                                   '[gee.utils :as utils :reload])))
          (reset! python-available? true)
          (println "[INFO] Python/GEE interop cargado exitosamente.")
          (catch Throwable t
            (let [msg (or (.getMessage t) (str t))]
              (println "[WARN] GeoDash Python/GEE no disponible:" msg)
              (reset! python-available? false)
              (reset! python-init-error msg))))))))

(defn- stale? []
  (> (- (System/currentTimeMillis) @last-initialized) max-age))

;; Serializes Python initialization so concurrent first requests don't initialize at once.
(defn- check-initialized []
  (init-python!)
  (when (and @python-available? (stale?))
    (locking init-lock
      (when (stale?)
        (try
          (let [{:keys [ee-account ee-key-path]} (get-config :py-interop)
                init-fn (ns-resolve 'gee.utils (symbol "initialize"))]
            (when init-fn
              (init-fn ee-account ee-key-path))
            (reset! last-initialized (System/currentTimeMillis)))
          (catch Throwable t
            (println "[WARN] Error al inicializar credenciales GEE:" (.getMessage t))))))))

(defn- parse-py-errors [e]
  (let [error-parts (as-> e %
                      (ex-message %)
                      (str/split % #"\n")
                      (last %)
                      (str/split % #": "))]
    {:errType  (first error-parts)
     :errMsg   (->> error-parts
                    (rest)
                    (str/join ": "))}))

(def ^:private valid-gee-paths
  #{"degradationTimeSeries"
    "degradationTileUrl"
    "featureCollection"
    "filteredLandsat"
    "filteredNicfi"
    "filteredSentinel2"
    "filteredSentinelSAR"
    "getAvailableBands"
    "getPlanetTile"
    "image"
    "imageCollection"
    "imageCollectionByIndex"
    "statistics"
    "timeSeriesByIndex"
    "dynamicWorld"})

(defn gateway-request [{:keys [params json-params]}]
  (check-initialized)
  (if-not @python-available?
    (data-response {:errMsg (str "El servicio de GeoDash/Python no está disponible: " @python-init-error)})
    (let [path-name (:path params)]
      (if (contains? valid-gee-paths path-name)
        (if-let [py-fn (ns-resolve 'gee.routes (symbol path-name))]
          (data-response
           (try
             (if-let [cutoff-var (resolve 'libpython-clj2.python.copy/*item-tuple-cutoff*)]
               (with-bindings {cutoff-var 0}
                 (py-fn json-params))
               (py-fn json-params))
             (catch Exception e
               (parse-py-errors e))))
          (data-response {:errMsg (str "Función GEE no resuelta para la ruta: " path-name)}))
        (data-response {:errMsg (str "No GEE function defined for path " path-name ".")})))))

(defn validate-vis-params [{:keys [params]}]
  (check-initialized)
  (if-not @python-available?
    (data-response {:errMsg (str "El servicio de GeoDash/Python no está disponible: " @python-init-error)})
    (if-let [validate-fn (ns-resolve 'gee.utils (symbol "validateJSON"))]
      (try
        (let [img-path    (:imgPath params)
              vis-params  (tc/json->clj (:visParams params))
              _vis-errors (validate-fn img-path vis-params)]
          (data-response "" {:status 200}))
        (catch Exception e
          (data-response (parse-py-errors e) {:status 400})))
      (data-response "" {:status 200}))))

;;; Widget Routes

(defn- return-widgets [project-id]
  (mapv (fn [{:keys [widget_id widget]}]
          (-> widget
              (tc/jsonb->clj)
              (assoc :id widget_id)))
        (call-sql "get_project_widgets_by_project_id" project-id)))

(defn- split-widget-json [widget-json]
  (let [widget (tc/json->clj widget-json)]
    [(:id widget) (-> widget (dissoc :id) (tc/clj->jsonb))]))

(defn get-project-widgets [{:keys [params]}]
  (let [project-id (tc/val->int (:projectId params))]
    (data-response (return-widgets project-id))))

(defn create-dashboard-widget-by-id [{:keys [params]}]
  (let [project-id (tc/val->int (:projectId params))
        widget     (tc/json->jsonb (:widgetJSON params))]
    (call-sql "add_project_widget"
              project-id
              widget)
    (data-response (return-widgets project-id))))

(defn update-dashboard-widget-by-id [{:keys [params]}]
  (let [project-id (tc/val->int (:projectId params))
        [widget-id widget] (split-widget-json (:widgetJSON params))]
    (call-sql "update_project_widget_by_widget_id" widget-id widget)
    (data-response (return-widgets project-id))))

(defn delete-dashboard-widget-by-id [{:keys [params]}]
  (let [project-id (tc/val->int (:projectId params))
        [widget-id _] (split-widget-json (:widgetJSON params))]
    (call-sql "delete_project_widget_by_widget_id" widget-id)
    (data-response (return-widgets project-id))))

(defn copy-project-widgets [{:keys [params]}]
  (let [project-id  (tc/val->int (:projectId params))
        template-id (tc/val->int (:templateId params))]
    (call-sql "delete_project_widgets" project-id)
    (call-sql "copy_project_widgets" template-id project-id)
    (data-response (return-widgets project-id))))
