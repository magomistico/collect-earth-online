-- NAMESPACE: dev-data

-- Adds an administrator and users for INAB-SIG
INSERT INTO users
    (user_uid, email, password, administrator, reset_key, verified)
VALUES
    (1, 'admin@inab.gob.gt', crypt('admin123', gen_salt('bf')), TRUE, null, TRUE),
    (2, 'tecnico@inab.gob.gt', crypt('inab2026', gen_salt('bf')), FALSE, null, TRUE),
    (3, 'sig@inab.gob.gt', crypt('sig2026', gen_salt('bf')), FALSE, null, TRUE);

SELECT setval(pg_get_serial_sequence('users', 'user_uid'), (SELECT MAX(user_uid) FROM users) + 1);

-- Adds INAB institution
INSERT INTO institutions
    (institution_uid, name, description, url)
VALUES
    (1, 'INAB - SIG', 'Instituto Nacional de Bosques - Sistema de Información Geográfica', 'http://www.inab.gob.gt');

SELECT setval(pg_get_serial_sequence('institutions', 'institution_uid'), (SELECT MAX(institution_uid) FROM institutions) + 1);

-- Adds administrator and technical users to INAB institution
INSERT INTO institution_users
    (inst_user_uid, institution_rid, user_rid, role_rid)
VALUES
    (1, 1, 1, 1),
    (2, 1, 2, 2),
    (3, 1, 3, 2);

SELECT setval(pg_get_serial_sequence('institution_users', 'inst_user_uid'), (SELECT MAX(inst_user_uid) FROM institution_users) + 1);

-- Adds default imagery for validation
INSERT INTO imagery
    (imagery_uid, institution_rid, visibility, title, attribution, extent, source_config)
VALUES
    (1, 1, 'public', 'OpenStreetMap', 'OpenStreetMap contributors', null, '{"type": "OSM"}'),
    (2, 1, 'public', 'Esri World Imagery (Satélite)', 'Esri, Maxar, Earthstar Geographics', null, '{"type": "xyz", "url": "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"}'),
    (3, 1, 'public', 'Google Satélite (Alta Resolución)', 'Google Maps Satellite', null, '{"type": "xyz", "url": "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}", "maxZoom": 22}'),
    (4, 1, 'public', 'Google Satélite Híbrido (Rutas y Nombres)', 'Google Maps Hybrid', null, '{"type": "xyz", "url": "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}", "maxZoom": 22}');

SELECT setval(pg_get_serial_sequence('imagery', 'imagery_uid'), (SELECT MAX(imagery_uid) FROM imagery) + 1);

-- Adds default INAB forest validation project
INSERT INTO projects (
    project_uid,
    institution_rid,
    availability,
    name,
    description,
    privacy_level,
    boundary,
    plot_distribution,
    num_plots,
    plot_shape,
    plot_size,
    sample_distribution,
    samples_per_plot,
    survey_questions,
    survey_rules,
    published_date,
    created_date,
    options,
    imagery_rid,
    allow_drawn_samples,
    aoi_features
) VALUES (
    1,
    1,
    'published',
    'Validación de Cobertura Forestal y Uso de la Tierra',
    'Proyecto piloto de validación e interpretación espacial de cobertura forestal en Guatemala - INAB SIG.',
    'public',
    ST_SetSRID(ST_GeomFromGeoJSON('{"type":"Polygon","coordinates":[[[-92.24,13.73],[-92.24,17.82],[-88.22,17.82],[-88.22,13.73],[-92.24,13.73]]]}'), 4326),
    'random',
    3,
    'circle',
    200,
    'random',
    10,
    '{"1": {"answers": {"1": {"color": "#1b4332", "answer": "Bosque Latifoliado"}, "2": {"color": "#2d6a4f", "answer": "Bosque de Coníferas"}, "3": {"color": "#40916c", "answer": "Bosque Mixto"}, "4": {"color": "#0077b6", "answer": "Bosque Mangle"}, "5": {"color": "#d4a373", "answer": "Pastos y Cultivos Agrícolas"}, "6": {"color": "#023e8a", "answer": "Humedal / Agua"}, "7": {"color": "#d90429", "answer": "Asentamiento Humano / Infraestructura"}, "8": {"color": "#6c584c", "answer": "Suelo Desnudo"}}, "dataType": "text", "question": "Tipo de Cobertura de la Tierra", "cardOrder": 1, "componentType": "button", "parentAnswerIds": [], "parentQuestionId": -1}, "2": {"answers": {"1": {"color": "#e63946", "answer": "Sí (Deforestación observada)"}, "2": {"color": "#2a9d8f", "answer": "No (Sin cambio aparente)"}}, "dataType": "text", "question": "¿Evidencia de Pérdida o Cambio Forestal?", "cardOrder": 2, "componentType": "button", "parentAnswerIds": [], "parentQuestionId": -1}, "3": {"answers": {"1": {"color": "#132a13", "answer": "Denso (> 70%)"}, "2": {"color": "#31572c", "answer": "Semidenso (40% - 70%)"}, "3": {"color": "#4f772d", "answer": "Abierto (10% - 39%)"}, "4": {"color": "#90a955", "answer": "No Bosque (< 10%)"}}, "dataType": "text", "question": "Porcentaje de Cobertura de Copa", "cardOrder": 3, "componentType": "button", "parentAnswerIds": [], "parentQuestionId": -1}}',
    '[]',
    Now(),
    Now(),
    '{"showGEEScript": false, "autoLaunchGeoDash": false, "collectConfidence": true, "showPlotInformation": false}',
    3,
    FALSE,
    '[{"type": "Polygon", "coordinates": [[[-92.24, 13.73], [-92.24, 17.82], [-88.22, 17.82], [-88.22, 13.73], [-92.24, 13.73]]]}]'
);

SELECT setval(pg_get_serial_sequence('projects', 'project_uid'), (SELECT MAX(project_uid) FROM projects) + 1);

-- Adds imagery associated with project (Google Satellite, Google Hybrid, OSM, Esri)
INSERT INTO project_imagery
    (project_rid, imagery_rid)
VALUES
    (1, 3),
    (1, 4),
    (1, 1),
    (1, 2);

-- Add 3 sample plots in Guatemala
INSERT INTO plots
    (plot_uid, project_rid, plot_geom, visible_id)
VALUES
    (1, 1, ST_SetSRID(ST_GeomFromGeoJSON('{"type":"Point","coordinates":[-89.8988, 16.9248]}'), 4326), 1),
    (2, 1, ST_SetSRID(ST_GeomFromGeoJSON('{"type":"Point","coordinates":[-91.4700, 15.3500]}'), 4326), 2),
    (3, 1, ST_SetSRID(ST_GeomFromGeoJSON('{"type":"Point","coordinates":[-90.8000, 14.1500]}'), 4326), 3);

SELECT setval(pg_get_serial_sequence('plots', 'plot_uid'), (SELECT MAX(plot_uid) FROM plots) + 1);

-- Add 5 sample points per plot
INSERT INTO samples
    (plot_rid, sample_geom, visible_id)
VALUES
    -- Plot 1 (Petén)
    (1, ST_SetSRID(ST_GeomFromGeoJSON('{"type":"Point","coordinates":[-89.8988, 16.9248]}'), 4326), 1),
    (1, ST_SetSRID(ST_GeomFromGeoJSON('{"type":"Point","coordinates":[-89.8985, 16.9250]}'), 4326), 2),
    (1, ST_SetSRID(ST_GeomFromGeoJSON('{"type":"Point","coordinates":[-89.8991, 16.9246]}'), 4326), 3),
    (1, ST_SetSRID(ST_GeomFromGeoJSON('{"type":"Point","coordinates":[-89.8986, 16.9245]}'), 4326), 4),
    (1, ST_SetSRID(ST_GeomFromGeoJSON('{"type":"Point","coordinates":[-89.8990, 16.9251]}'), 4326), 5),
    -- Plot 2 (Occidente / Altiplano)
    (2, ST_SetSRID(ST_GeomFromGeoJSON('{"type":"Point","coordinates":[-91.4700, 15.3500]}'), 4326), 1),
    (2, ST_SetSRID(ST_GeomFromGeoJSON('{"type":"Point","coordinates":[-91.4697, 15.3502]}'), 4326), 2),
    (2, ST_SetSRID(ST_GeomFromGeoJSON('{"type":"Point","coordinates":[-91.4703, 15.3498]}'), 4326), 3),
    (2, ST_SetSRID(ST_GeomFromGeoJSON('{"type":"Point","coordinates":[-91.4698, 15.3497]}'), 4326), 4),
    (2, ST_SetSRID(ST_GeomFromGeoJSON('{"type":"Point","coordinates":[-91.4702, 15.3503]}'), 4326), 5),
    -- Plot 3 (Costa Sur)
    (3, ST_SetSRID(ST_GeomFromGeoJSON('{"type":"Point","coordinates":[-90.8000, 14.1500]}'), 4326), 1),
    (3, ST_SetSRID(ST_GeomFromGeoJSON('{"type":"Point","coordinates":[-90.7997, 14.1502]}'), 4326), 2),
    (3, ST_SetSRID(ST_GeomFromGeoJSON('{"type":"Point","coordinates":[-90.8003, 14.1498]}'), 4326), 3),
    (3, ST_SetSRID(ST_GeomFromGeoJSON('{"type":"Point","coordinates":[-90.7998, 14.1497]}'), 4326), 4),
    (3, ST_SetSRID(ST_GeomFromGeoJSON('{"type":"Point","coordinates":[-90.8002, 14.1503]}'), 4326), 5);

SELECT setval(pg_get_serial_sequence('samples', 'sample_uid'), (SELECT MAX(sample_uid) FROM samples) + 1);
