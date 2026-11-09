from distutils.util import strtobool
import json

from gee.utils import initialize, listAvailableBands, imageToMapId, imageCollectionToMapId, \
    filteredImageCompositeToMapId, filteredSentinelComposite, filteredSentinelSARComposite, \
    filteredImageByIndexToMapId, getFeatureCollectionTileUrl, getTimeSeriesByCollectionAndIndex, \
    getTimeSeriesByIndex, getStatistics, getDegradationPlotsByPoint, getDegradationPlotsByPointS1, \
    getDegradationTileUrlByDate, getDegradationTileUrlByDateS1, safeParseJSON, filteredNicfiCompositeToMapId
from gee.planet import getPlanetMapID
from gee.inputs import getLandsatToa, getTFO


def safeListGet(l, idx, default=None):
    try:
        return l[idx]
    except IndexError:
        return default


def getDefault(dict, key, default=None):
    val = dict.get(key)
    if val is None or val == '':
        return default
    else:
        return val

# ########## Helper routes ##########

def getAvailableBands(requestDict):
    values = listAvailableBands(
        getDefault(requestDict, 'assetId'),
        getDefault(requestDict, 'assetType')
    )
    return values

# ########## ee.Image ##########


def image(requestDict):
    values = imageToMapId(
        getDefault(requestDict, 'assetId'),
        safeParseJSON(getDefault(requestDict, 'visParams', {}))
    )
    return values

# ########## ee.ImageCollection ##########


def imageCollection(requestDict):
    visParams = safeParseJSON(getDefault(requestDict, 'visParams', {}))
    if visParams.get("bands") and isinstance(visParams.get("bands"), str):
        bands = visParams.get("bands").replace(' ', '')
        visParams.update({"bands": bands})
    values = imageCollectionToMapId(
        getDefault(requestDict, 'assetId', None),
        visParams,
        getDefault(requestDict, 'reducer', 'Mean'),
        getDefault(requestDict, 'startDate', None),
        getDefault(requestDict, 'endDate', None)
    )
    return values


# ########## Pre defined ee.ImageCollection ##########

def filteredLandsat(requestDict):
    startDate = getDefault(requestDict, 'startDate', '1990-01-01')
    endDate = getDefault(requestDict, 'endDate', '2023-01-01')
    values = filteredImageCompositeToMapId(
        getLandsatToa(startDate, endDate),
        {
            'min': getDefault(requestDict, 'min', '0.03,0.01,0.05'),
            'max': getDefault(requestDict, 'max', '0.45,0.5,0.4'),
            'bands': getDefault(requestDict, 'bands', 'BLUE,RED,GREEN')
        },
        getDefault(requestDict, 'cloudLessThan', 60),
    )
    return values

def filteredNicfi(requestDict):
    startDate = getDefault(requestDict, 'startDate', '1990-01-01')
    endDate = getDefault(requestDict, 'endDate', '2023-01-01')
    values = filteredNicfiCompositeToMapId(
        getTFO({'start':startDate, 'end':endDate}),
        {
            'min': getDefault(requestDict, 'min', '113,113,113'),
            'max': getDefault(requestDict, 'max', '1465,1465,1465'),
            'bands': getDefault(requestDict, 'bands', 'R,G,B')
        },
    )
    return values

def filteredSentinel2(requestDict):
    values = filteredSentinelComposite(
        {
            'min': getDefault(requestDict, 'min', '0.03,0.01,0.05'),
            'max': getDefault(requestDict, 'max', '0.45,0.5,0.4'),
            'bands': getDefault(requestDict, 'bands', 'B4,B5,B3')
        },
        getDefault(requestDict, 'startDate', '2010-01-01'),
        getDefault(requestDict, 'endDate', '2022-01-01'),
        getDefault(requestDict, 'cloudLessThan', 90)
    )
    return values


# # Only used for institution imagery


def filteredSentinelSAR(requestDict):
    values = filteredSentinelSARComposite(
        {
            'min': getDefault(requestDict, 'min', '0'),
            'max': getDefault(requestDict, 'max', '0.3'),
            'bands': getDefault(requestDict, 'bands', 'VH,VV,VH/VV')
        },
        getDefault(requestDict, 'startDate', None),
        getDefault(requestDict, 'endDate', None)
    )
    return values


def imageCollectionByIndex(requestDict):
    values = filteredImageByIndexToMapId(
        getDefault(requestDict, 'startDate', '1990-01-01'),
        getDefault(requestDict, 'endDate', '2100-01-01'),
        getDefault(requestDict, 'indexName'),
        getDefault(requestDict, 'sourceName')
    )
    return values


# ########## ee.FeatureCollection ##########


# # TODO, this route inst really generic to any feature collections like the name suggests.
def featureCollection(requestDict):
    visParams = safeParseJSON(getDefault(requestDict, 'visParams', {}))
    values = {
        'url': getFeatureCollectionTileUrl(
            getDefault(requestDict, 'assetId', None),
            getDefault(requestDict, 'field', 'PLOTID'),
            int(getDefault(requestDict, 'matchID', 1)),
            {'max': 1, 'palette': ['red']} if visParams == {} else visParams
        )
    }
    return values

# ########## Planet ##########


def getPlanetTile(requestDict):
    values = getPlanetMapID(
        getDefault(requestDict, 'apiKey'),
        getDefault(requestDict, 'geometry'), getDefault(
            requestDict, 'startDate'),
        getDefault(requestDict, 'endDate', None),
        getDefault(requestDict, 'layerCount', 1),
        getDefault(requestDict, 'itemTypes', [
                    'PSScene3Band', 'PSScene4Band']),
        float(getDefault(requestDict, 'buffer', 0.5)),
        bool(strtobool(getDefault(requestDict, 'addsimilar', 'True')))
    )
    return values

# ########## Time Series ##########

def timeSeriesByIndex(requestDict):
    values = {
        'timeseries': getTimeSeriesByIndex(
            getDefault(requestDict, 'sourceName', 'Landsat'),
            getDefault(requestDict, 'indexName', 'NDVI'),
            float(getDefault(requestDict, 'scale', 30)),
            getDefault(requestDict, 'geometry', None),
            getDefault(requestDict, 'startDate', None),
            getDefault(requestDict, 'endDate', None),
            'median',
            getDefault(requestDict, 'assetId', None), # assetId is needed for the sourceName=='custom' case now
            getDefault(requestDict, 'band', None), # band is needed for the sourceName=='custom' case now


        )
    }
    return values

# ########## Degradation##########


def degradationTimeSeries(requestDict):
    if getDefault(requestDict, 'dataType', 'landsat') == 'landsat':
        values = {
            'timeseries': getDegradationPlotsByPoint(
                getDefault(requestDict, 'geometry'),
                getDefault(requestDict, 'startDate'),
                getDefault(requestDict, 'endDate'),
                getDefault(requestDict, 'band', 'NDFI')
            )
        }
    else:
        values = {
            'timeseries': getDegradationPlotsByPointS1(
                getDefault(requestDict, 'geometry'),
                getDefault(requestDict, 'startDate'),
                getDefault(requestDict, 'endDate')
            )
        }
    return values


def degradationTileUrl(requestDict):
    imageDate = getDefault(requestDict, 'imageDate', None)
    geometry = getDefault(requestDict, 'geometry')
    if getDefault(requestDict, 'degDataType', 'landsat') == 'landsat':
        stretch = getDefault(requestDict, 'stretch', 321)
        if stretch == 321:
            visParams = {'bands': 'RED,GREEN,BLUE', 'min': 0, 'max': 2000}
        elif stretch == 543:
            visParams = {'bands': 'SWIR1,NIR,RED', 'min': 0, 'max': 7000}
        elif stretch == 453:
            visParams = {'bands': 'NIR,SWIR1,RED', 'min': 0, 'max': 7000}
        values = {
            'url': getDegradationTileUrlByDate(geometry, imageDate, visParams)
        }
    else:
        values = {
            'url': getDegradationTileUrlByDateS1(
                geometry,
                imageDate,
                {
                    'bands': 'VV,VH,VV/VH',
                    'min': '-15,-25,.40',
                    'max': '0,-10,1',
                    'gamma': '1.6'
                })
        }
    return values

# ########## DynamicWorld ##########

def dynamicWorld(requestDict):    
    geometry = getDefault(requestDict, 'geometry')
    startDate="2021-01-01"
    endDate="2022-01-01"
    visParams = safeParseJSON(getDefault(requestDict, 'visParams', {}))
    return imageCollectionToMapId("GOOGLE/DYNAMICWORLD/V1", visParams, 'Mode', startDate, endDate)


# ########## Stats ##########


def statistics(requestDict):
    values = getStatistics(getDefault(requestDict, 'extent', None))    
    return {url: values}


# ########## AREA2 Stratification & Sampling ##########

def area2Stratification(requestDict):
    asset_id = getDefault(requestDict, 'assetId', 'projects/AREA2/public/guatemala_stratification')
    band_id = int(getDefault(requestDict, 'band', 1)) - 1
    mask_val = float(getDefault(requestDict, 'maskVal', 0))
    scale = float(getDefault(requestDict, 'scale', 30))
    palette = ['#a6cee3', '#1f78b4', '#b2df8a', '#33a02c', '#fb9a99',
               '#e31a1c', '#fdbf6f', '#ff7f00', '#cab2d6', '#6a3d9a', '#ffff99', '#b15928']
    try:
        import ee
        project = None
        if asset_id.startswith('projects/'):
            parts = asset_id.split('/')
            if len(parts) >= 2:
                project = parts[1]

        try:
            ee.data.getAlgorithms()
        except Exception:
            initialize(project=project)

        img = ee.Image(asset_id)
        try:
            img = img.select([band_id])
        except Exception:
            img = img.select([0])

        img = img.rename('classification').toInt()
        img = img.updateMask(img.neq(mask_val))

        geometry = img.geometry()
        try:
            bounds_info = geometry.bounds().coordinates().getInfo()[0]
            lons = [p[0] for p in bounds_info]
            lats = [p[1] for p in bounds_info]
            min_lon, max_lon = min(lons), max(lons)
            min_lat, max_lat = min(lats), max(lats)
            center = [(min_lon + max_lon) / 2.0, (min_lat + max_lat) / 2.0]
            bounds = [min_lon, min_lat, max_lon, max_lat]
        except Exception:
            center = [-90.2308, 15.7835]
            bounds = [-92.25, 13.73, -88.22, 17.82]

        map_id = img.getMapId({'min': 0, 'max': 12, 'palette': palette})
        tile_url = map_id['tile_fetcher'].url_format

        pixel_area = ee.Image.pixelArea().addBands(img)
        reduced = pixel_area.reduceRegion(
            reducer=ee.Reducer.sum().group(1),
            geometry=geometry,
            scale=scale,
            maxPixels=1e13,
            bestEffort=True,
            tileScale=4
        ).getInfo()

        groups = reduced.get('groups', [])
        strata_list = []
        strata_areas = []
        total_area = 0.0
        for g in groups:
            strata_list.append(int(g.get('group', 0)))
            s_val = float(g.get('sum', 0.0))
            strata_areas.append(s_val)
            total_area += s_val

        area_weights = [a / total_area for a in strata_areas] if total_area > 0 else []

        return {
            'success': True,
            'tileUrl': tile_url,
            'center': center,
            'bounds': bounds,
            'strataList': strata_list,
            'strataAreas': strata_areas,
            'areaWeights': area_weights,
            'totalArea': total_area
        }
    except Exception as e:
        err_msg = str(e)
        err_type = "UNKNOWN"
        if "not initialized" in err_msg.lower():
            err_type = "EE_AUTH_REQUIRED"
        elif "asset" in err_msg.lower() and "not found" in err_msg.lower():
            err_type = "ASSET_NOT_FOUND"
        elif "permission" in err_msg.lower() or "denied" in err_msg.lower():
            err_type = "PERMISSION_DENIED"

        return {
            'success': False,
            'errType': err_type,
            'errMsg': err_msg
        }


def area2StratifiedSample(requestDict):
    asset_id = getDefault(requestDict, 'assetId', 'projects/AREA2/public/guatemala_stratification')
    band_id = int(getDefault(requestDict, 'band', 1)) - 1
    mask_val = float(getDefault(requestDict, 'maskVal', 0))
    scale = float(getDefault(requestDict, 'scale', 30))
    class_values = requestDict.get('classValues', [])
    class_points = requestDict.get('classPoints', [])

    try:
        import ee
        project = None
        if asset_id.startswith('projects/'):
            parts = asset_id.split('/')
            if len(parts) >= 2:
                project = parts[1]

        try:
            ee.data.getAlgorithms()
        except Exception:
            initialize(project=project)

        img = ee.Image(asset_id)
        try:
            img = img.select([band_id])
        except Exception:
            img = img.select([0])

        img = img.rename('classification').toInt()
        img = img.updateMask(img.neq(mask_val))
        geometry = img.geometry()

        c_vals = [int(v) for v in class_values]
        c_pts = [int(p) for p in class_points]

        sample_fc = img.stratifiedSample(
            numPoints=0,
            classBand='classification',
            region=geometry,
            scale=scale,
            classValues=c_vals,
            classPoints=c_pts,
            geometries=True
        )

        geojson = sample_fc.getInfo()
        features = geojson.get('features', [])
        points = []
        for idx, f in enumerate(features):
            geom = f.get('geometry', {})
            coords = geom.get('coordinates', [0, 0])
            props = f.get('properties', {})
            stratum = props.get('classification', 1)
            points.append({
                'id': idx + 1,
                'lon': coords[0],
                'lat': coords[1],
                'stratum': stratum
            })

        return {
            'success': True,
            'count': len(points),
            'points': points
        }
    except Exception as e:
        return {
            'success': False,
            'errMsg': str(e)
        }


