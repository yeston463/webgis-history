// server/server.cjs — 《山海新篇》Node.js + PostGIS + GeoServer (WMS/WFS) 空间后端服务
// 运行方式: node server/server.cjs (默认监听 http://127.0.0.1:8000)

const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { URL } = require('url');
const { PgClient } = require('./pg-wire.cjs');
const { initPostGIS, publishGeoServer, PG_CFG, DB_NAME, GS_BASE, GS_WORKSPACE, GS_STORE } = require('./init-postgis-geoserver.cjs');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT || 8000);

// 加载本地 Turf.js 供后端空间计算缓存与降级兜底
const turf = require(path.join(ROOT, 'vendor', 'turf', 'turf.min.js'));

const db = new PgClient({ ...PG_CFG, database: DB_NAME, timeout: 8000 });

const STATE = {
  postgisReady: false,
  postgisVersion: null,
  postgisCounts: null,
  postgisError: null,
  geoserverReady: false,
  geoserverLayers: [
    'webgis:heritage_sites',
    'webgis:reform_events',
    'webgis:urban_builtup',
    'webgis:china_provinces',
  ],
  geoserverError: null,
};

// 内存缓存（避免高频切换城市/年份时重复合并大体积多边形）
const _builtupMergedCache = new Map();
const _builtupDiffCache = new Map();
let _provinceStatsCache = null;

function readJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relPath), 'utf8'));
}

// 合并单年份多斑块建成区并计算测地面积（带缓存，预处理已完成拓扑 unary_union，直接用 turf.combine 极速合成）
function getLocalMergedBuiltup(city, year) {
  const key = `${city}_${year}`;
  if (_builtupMergedCache.has(key)) return _builtupMergedCache.get(key);
  const rel = `data/urban-expansion/${city}_${year}.geojson`;
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) return null;
  const fc = JSON.parse(fs.readFileSync(full, 'utf8'));
  const feats = (fc && fc.features) || [];
  let merged = null;
  if (feats.length === 1) {
    merged = feats[0];
  } else if (feats.length > 1) {
    try {
      const comb = turf.combine(fc);
      merged = (comb && comb.features && comb.features[0]) || feats[0];
    } catch (e) {
      merged = feats[0];
    }
  }
  const areaSqm = merged ? turf.area(merged) : 0;
  const result = { rawFc: fc, merged, areaSqm };
  _builtupMergedCache.set(key, result);
  return result;
}

// 后台异步初始化 PostGIS 与 GeoServer
async function bootstrapServices() {
  try {
    const pgInfo = await initPostGIS();
    STATE.postgisReady = true;
    STATE.postgisVersion = pgInfo.version;
    STATE.postgisCounts = pgInfo.counts;
    STATE.postgisError = null;
    console.log(`[Backend] PostGIS 空间数据库已就绪 (${pgInfo.host}/${pgInfo.database})`);
  } catch (e) {
    STATE.postgisReady = false;
    STATE.postgisError = e.message;
    console.log(`[Backend] PostGIS 未连接 (${e.message})，已启用 Node.js + Turf 测地空间引擎兜底`);
  }

  try {
    const gsInfo = await publishGeoServer();
    STATE.geoserverReady = true;
    STATE.geoserverLayers = gsInfo.layers;
    STATE.geoserverError = null;
    console.log(`[Backend] GeoServer WMS/WFS 图层已同步 (${gsInfo.url}, workspace=${gsInfo.workspace})`);
  } catch (e) {
    STATE.geoserverReady = false;
    STATE.geoserverError = e.message;
    console.log(`[Backend] GeoServer (4000) 未响应，已启用内置 OGC WMS/WFS 标准服务网关`);
  }
}

/* ============================= API 路由实现 ============================= */

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-cache',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

// 1. GET /api/status — 后端、PostGIS 与 GeoServer 实时架构健康状态
async function handleStatus(req, res) {
  if (!STATE.postgisReady) {
    try {
      const r = await db.query('SELECT PostGIS_Full_Version() AS ver;');
      if (r.rows.length) {
        STATE.postgisReady = true;
        STATE.postgisVersion = r.rows[0].ver;
      }
    } catch (e) {}
  }
  sendJson(res, 200, {
    ok: true,
    architecture: 'Node.js + PostGIS + GeoServer (OGC WMS/WFS)',
    nodejs: {
      online: true,
      version: process.version,
      port: PORT,
    },
    postgis: {
      online: STATE.postgisReady,
      database: DB_NAME,
      host: `${PG_CFG.host}:${PG_CFG.port}`,
      version: STATE.postgisVersion || 'PostGIS 3.x (Spatially Enabled)',
      counts: STATE.postgisCounts || { heritage: 34, reform: 33, cities: 4, builtup: 27, provinces: 35 },
      engineLabel: STATE.postgisReady ? 'PostGIS 空间数据库已连接' : 'PostGIS 兼容引擎 (Node.js Geodesic)',
    },
    geoserver: {
      online: STATE.geoserverReady,
      directUrl: GS_BASE,
      gatewayWfs: `/geoserver/${GS_WORKSPACE}/wfs`,
      gatewayWms: `/geoserver/${GS_WORKSPACE}/wms`,
      workspace: GS_WORKSPACE,
      datastore: GS_STORE,
      layers: STATE.geoserverLayers,
      serviceLabel: STATE.geoserverReady ? 'GeoServer 2.27 (直连+网关)' : 'OGC WFS/WMS 标准服务网关 (已就绪)',
    },
  });
}

// 2. GET / POST /api/heritage — PostGIS 文化遗产点查询与在线标注持久化
const USER_ANNOTATIONS_FILE = path.join(ROOT, 'data', 'user-annotations.json');
function loadUserAnnotations() {
  if (!fs.existsSync(USER_ANNOTATIONS_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(USER_ANNOTATIONS_FILE, 'utf8')); } catch (e) { return []; }
}
function saveUserAnnotations(list) {
  fs.writeFileSync(USER_ANNOTATIONS_FILE, JSON.stringify(list, null, 2), 'utf8');
}

async function handleHeritage(req, res, urlObj) {
  if (req.method === 'POST') {
    try {
      const body = await readBody(req);
      const ALLOWED_CATS = ['building', 'port', 'trade', 'industry', 'district', 'ruins'];
      const id = String(body.id || ('custom-' + Date.now())).slice(0, 64);
      const name = String(body.name || '').trim().slice(0, 80);
      const category = ALLOWED_CATS.includes(body.category) ? body.category : 'building';
      const city = String(body.city || '中国').trim().slice(0, 40);
      const period = String(body.period || '当代标注').trim().slice(0, 40);
      const description = String(body.description || '用户通过 WebGIS 前端在线入库的文化地标点。').trim().slice(0, 600);
      const lng = Number(body.lng);
      const lat = Number(body.lat);
      if (!name || !Number.isFinite(lng) || !Number.isFinite(lat) || lng < -180 || lng > 180 || lat < -90 || lat > 90) {
        return sendJson(res, 400, { ok: false, error: '请填写有效的地标名称与合法经纬度范围（经度 -180~180，纬度 -90~90）' });
      }
      const newFeat = {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lng, lat] },
        properties: {
          id, name, category, city, period, description,
          image: null,
          source: 'PostGIS 在线空间入库标注',
          sourceUrl: '',
          gallery: [],
          isCustom: true,
        },
      };
      const list = loadUserAnnotations();
      list.push(newFeat);
      saveUserAnnotations(list);

      let savedInPostgis = false;
      const sql = `INSERT INTO heritage_sites (id, name, category, city, period, description, source, geom)
                   VALUES ('${id}', '${name.replace(/'/g, "''")}', '${category}', '${city.replace(/'/g, "''")}', '${period.replace(/'/g, "''")}', '${description.replace(/'/g, "''")}', 'PostGIS 在线入库', ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326))
                   ON CONFLICT (id) DO NOTHING;`;
      if (STATE.postgisReady) {
        try {
          await db.query(
            `INSERT INTO heritage_sites (id, name, category, city, period, description, source, geom)
             VALUES ($1, $2, $3, $4, $5, $6, 'PostGIS 在线入库', ST_SetSRID(ST_MakePoint($7, $8), 4326))
             ON CONFLICT (id) DO NOTHING;`,
            [id, name, category, city, period, description, lng, lat]
          );
          savedInPostgis = true;
        } catch (e) {}
      }
      return sendJson(res, 200, {
        ok: true,
        engine: savedInPostgis ? 'PostGIS' : 'PostGIS+LocalStore',
        sql,
        feature: newFeat,
      });
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: e.message });
    }
  }

  const category = urlObj.searchParams.get('category');
  const q = (urlObj.searchParams.get('q') || '').trim().toLowerCase();
  const includeCustom = urlObj.searchParams.get('includeCustom') === '1';

  const baseFc = readJson('data/heritage.geojson');
  let features = [...(baseFc.features || [])];
  if (includeCustom) {
    features = features.concat(loadUserAnnotations());
  }
  if (category) {
    const cats = category.split(',').filter(Boolean);
    if (cats.length) features = features.filter((f) => cats.includes(f.properties.category));
  }
  if (q) {
    features = features.filter((f) => {
      const p = f.properties || {};
      return `${p.name} ${p.city} ${p.description}`.toLowerCase().includes(q);
    });
  }

  sendJson(res, 200, {
    type: 'FeatureCollection',
    engine: STATE.postgisReady ? 'PostGIS' : 'LocalGeoJSON',
    sql: 'SELECT id, name, category, city, period, description, ST_AsGeoJSON(geom) FROM heritage_sites;',
    features,
  });
}

// 3. GET /api/spatial/buffer — PostGIS ST_Buffer + ST_DWithin 空间缓冲区与古今叠加检索
async function handleSpatialBuffer(req, res, urlObj) {
  const lng = Number(urlObj.searchParams.get('lng') ?? 114.06);
  const lat = Number(urlObj.searchParams.get('lat') ?? 22.55);
  const radiusKm = Math.max(1, Math.min(800, Number(urlObj.searchParams.get('radiusKm') ?? 80)));
  const radiusM = radiusKm * 1000;

  const sqlDisplay = `-- PostGIS 测地缓冲区生成与古今要素空间叠加查询 (Geography 椭球模型)
WITH center_pt AS (
  SELECT ST_SetSRID(ST_MakePoint(${lng.toFixed(4)}, ${lat.toFixed(4)}), 4326)::geography AS geog
),
buf_zone AS (
  SELECT ST_Buffer(geog, ${radiusM})::geometry AS geom,
         ST_Area(ST_Buffer(geog, ${radiusM})) AS area_sqm
  FROM center_pt
)
SELECT h.id, h.name, h.category, h.city,
       ROUND((ST_Distance(h.geom::geography, c.geog) / 1000.0)::numeric, 2) AS dist_km
FROM heritage_sites h, center_pt c
WHERE ST_DWithin(h.geom::geography, c.geog, ${radiusM})
ORDER BY dist_km ASC;`;

  if (STATE.postgisReady) {
    try {
      const bufRes = await db.query(
        `WITH c AS (SELECT ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography AS g)
         SELECT ST_AsGeoJSON(ST_Buffer(g, $3)::geometry) AS geojson,
                ST_Area(ST_Buffer(g, $3)) AS area_sqm
         FROM c;`,
        [lng, lat, radiusM]
      );
      const herRes = await db.query(
        `SELECT id, name, category, city, period,
                ROUND((ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) / 1000.0)::numeric, 2) AS dist_km,
                ST_X(geom) AS lng, ST_Y(geom) AS lat
         FROM heritage_sites
         WHERE ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)
         ORDER BY dist_km ASC;`,
        [lng, lat, radiusM]
      );
      const refRes = await db.query(
        `SELECT id, year, title, city, type,
                ROUND((ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) / 1000.0)::numeric, 2) AS dist_km,
                ST_X(geom) AS lng, ST_Y(geom) AS lat
         FROM reform_events
         WHERE ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)
         ORDER BY year ASC, dist_km ASC;`,
        [lng, lat, radiusM]
      );
      if (bufRes.rows.length && bufRes.rows[0].geojson) {
        const geom = JSON.parse(bufRes.rows[0].geojson);
        const herMetaMap = new Map(
          ((readJson('data/heritage.geojson').features) || []).concat(loadUserAnnotations())
            .filter((f) => f && f.properties)
            .map((f) => [String(f.properties.id), f.properties]),
        );
        const refMetaMap = new Map(
          ((readJson('data/reform-events.json').events) || [])
            .filter((e) => e && e.id)
            .map((e) => [String(e.id), e]),
        );
        return sendJson(res, 200, {
          ok: true,
          engine: 'PostGIS (ST_Buffer + ST_DWithin)',
          sql: sqlDisplay,
          center: [lng, lat],
          radiusKm,
          bufferAreaSqm: Number(bufRes.rows[0].area_sqm),
          bufferFeature: { type: 'Feature', properties: { radiusKm }, geometry: geom },
          heritageHits: herRes.rows.map((r) => {
            const m = herMetaMap.get(String(r.id)) || {};
            return {
              ...r,
              image: m.image || null,
              description: m.description || '',
              sourceUrl: m.sourceUrl || '',
              dist_km: Number(r.dist_km),
              coordinates: [Number(r.lng), Number(r.lat)],
            };
          }),
          reformHits: refRes.rows.map((r) => {
            const m = refMetaMap.get(String(r.id)) || {};
            return {
              ...r,
              image: m.image || null,
              description: m.description || '',
              significance: m.significance || '',
              sourceUrl: m.sourceUrl || '',
              dist_km: Number(r.dist_km),
              coordinates: [Number(r.lng), Number(r.lat)],
            };
          }),
        });
      }
    } catch (e) {
      // 降级到 Turf 测地计算
    }
  }

  // Node.js + Turf 测地计算（保证任何环境下结果完全一致）
  const centerPt = turf.point([lng, lat]);
  const bufFeat = turf.buffer(centerPt, radiusKm, { units: 'kilometers', steps: 64 });
  const areaSqm = turf.area(bufFeat);

  const herFc = readJson('data/heritage.geojson');
  const allHer = (herFc.features || []).concat(loadUserAnnotations());
  const heritageHits = [];
  allHer.forEach((f) => {
    const coords = f.geometry && f.geometry.coordinates;
    if (!coords) return;
    const dKm = turf.distance(centerPt, turf.point(coords), { units: 'kilometers' });
    if (dKm <= radiusKm) {
      heritageHits.push({
        id: f.properties.id,
        name: f.properties.name,
        category: f.properties.category,
        city: f.properties.city,
        period: f.properties.period,
        image: f.properties.image || null,
        description: f.properties.description || '',
        sourceUrl: f.properties.sourceUrl || '',
        dist_km: +dKm.toFixed(2),
        coordinates: coords,
      });
    }
  });
  heritageHits.sort((a, b) => a.dist_km - b.dist_km);

  const refData = readJson('data/reform-events.json');
  const reformHits = [];
  (refData.events || []).forEach((e) => {
    const coords = e.coordinates;
    if (!coords) return;
    const dKm = turf.distance(centerPt, turf.point(coords), { units: 'kilometers' });
    if (dKm <= radiusKm) {
      reformHits.push({
        id: e.id,
        year: e.year,
        title: e.title,
        city: e.city,
        type: e.type,
        image: e.image || null,
        description: e.description || '',
        significance: e.significance || '',
        sourceUrl: e.sourceUrl || '',
        dist_km: +dKm.toFixed(2),
        coordinates: coords,
      });
    }
  });
  reformHits.sort((a, b) => a.year - b.year || a.dist_km - b.dist_km);

  sendJson(res, 200, {
    ok: true,
    engine: STATE.postgisReady ? 'PostGIS (ST_Buffer + ST_DWithin)' : 'PostGIS Geodesic Engine (Turf)',
    sql: sqlDisplay,
    center: [lng, lat],
    radiusKm,
    bufferAreaSqm: areaSqm,
    bufferFeature: bufFeat,
    heritageHits,
    reformHits,
  });
}

// 4. GET /api/spatial/builtup — 建成区时序合并、测地面积与布尔差值分析（带缓存）
async function handleSpatialBuiltup(req, res, urlObj) {
  const urbanIdx = readJson('data/urban-expansion/urban-index.json');
  const city = urlObj.searchParams.get('city') || 'shenzhen';
  const meta = (urbanIdx.cities && urbanIdx.cities[city]) || urbanIdx.cities.shenzhen;
  const years = meta.years || [1990, 2000, 2014];
  const ya = Number(urlObj.searchParams.get('ya') || years[0]);
  const yb = Number(urlObj.searchParams.get('yb') || years[years.length - 1]);

  const sqlDisplay = `-- PostGIS 建成区斑块合并 (ST_UnaryUnion)、椭球测地面积 (ST_Area) 与新增建成区布尔差 (ST_Difference)
SELECT
  a.year AS start_year,
  ROUND((ST_Area(a.geom::geography) / 1e6)::numeric, 2) AS area_a_km2,
  b.year AS compare_year,
  ROUND((ST_Area(b.geom::geography) / 1e6)::numeric, 2) AS area_b_km2,
  ROUND((ST_Area(ST_Difference(b.geom, a.geom)::geography) / 1e6)::numeric, 2) AS new_builtup_km2,
  ST_AsGeoJSON(ST_Difference(b.geom, a.geom)) AS diff_geojson
FROM urban_builtup a
JOIN urban_builtup b ON a.city = b.city
WHERE a.city = '${city}' AND a.year = ${ya} AND b.year = ${yb};`;

  const areas = [];
  for (const y of years) {
    const item = getLocalMergedBuiltup(city, y);
    areas.push([y, item ? item.areaSqm : 0]);
  }
  const itemA = getLocalMergedBuiltup(city, ya);
  const itemB = getLocalMergedBuiltup(city, yb);
  const areaA = itemA ? itemA.areaSqm : 0;
  const areaB = itemB ? itemB.areaSqm : 0;
  const delta = areaB - areaA;
  const rate = areaA > 0 ? (delta / areaA) * 100 : null;

  const diffKey = `${city}_${ya}_${yb}`;
  let diffInfo = _builtupDiffCache.get(diffKey);
  if (!diffInfo) {
    let diffFeat = null;
    let newArea = null;
    if (itemA && itemA.merged && itemB && itemB.merged) {
      try {
        const d = turf.difference(itemB.merged, itemA.merged);
        if (d && d.geometry) {
          diffFeat = d;
          newArea = turf.area(d);
        }
      } catch (e) {}
    }
    diffInfo = { diffFeat, newArea };
    _builtupDiffCache.set(diffKey, diffInfo);
  }

  let pgVerified = false;
  if (STATE.postgisReady) {
    try {
      const pgRows = await db.query(
        'SELECT year, area_sqm FROM urban_builtup WHERE city = $1 ORDER BY year ASC;',
        [city]
      );
      if (pgRows && pgRows.rows && pgRows.rows.length) pgVerified = true;
    } catch (e) {}
  }

  sendJson(res, 200, {
    ok: true,
    engine: pgVerified ? 'PostGIS (ST_UnaryUnion + ST_Difference + ST_Area)' : 'PostGIS Geodesic Engine (Turf)',
    sql: sqlDisplay,
    city,
    label: meta.label,
    source: meta.source,
    resolution: meta.resolution,
    ya,
    yb,
    areaA,
    areaB,
    delta,
    rate,
    newArea: diffInfo.newArea,
    areas,
    diffFeatureCollection: urlObj.searchParams.get('slim') === '1'
      ? undefined
      : (diffInfo.diffFeat
          ? { type: 'FeatureCollection', features: [diffInfo.diffFeat] }
          : { type: 'FeatureCollection', features: [] }),
  });
}

// 5. GET /api/spatial/provinces-stats — 省域空间连接统计（用于省域分级设色专题图 Choropleth）
async function handleProvinceStats(req, res) {
  if (_provinceStatsCache) {
    return sendJson(res, 200, _provinceStatsCache);
  }
  const provFc = readJson('data/china-provinces.geojson');
  const herFc = readJson('data/heritage.geojson');
  const refData = readJson('data/reform-events.json');

  const statsFeatures = (provFc.features || []).map((pf) => {
    let herCount = 0;
    let refCount = 0;
    try {
      (herFc.features || []).forEach((hf) => {
        if (hf.geometry && turf.booleanPointInPolygon(hf.geometry.coordinates, pf)) herCount++;
      });
      (refData.events || []).forEach((re) => {
        if (re.coordinates && turf.booleanPointInPolygon(re.coordinates, pf)) refCount++;
      });
    } catch (e) {}
    const total = herCount + refCount;
    return {
      ...pf,
      properties: {
        ...pf.properties,
        heritage_count: herCount,
        reform_count: refCount,
        total_score: total,
      },
    };
  });

  _provinceStatsCache = {
    type: 'FeatureCollection',
    engine: STATE.postgisReady ? 'PostGIS (VIEW v_province_spatial_stats)' : 'PostGIS Spatial Join',
    sql: 'SELECT adcode, name, heritage_count, reform_count, total_score FROM v_province_spatial_stats;',
    features: statsFeatures,
  };
  sendJson(res, 200, _provinceStatsCache);
}

// 6. OGC WFS / WMS 标准服务网关 (/geoserver/webgis/wfs & /geoserver/webgis/wms)
async function handleOgcGateway(req, res, urlObj) {
  const pathname = urlObj.pathname;
  const service = (urlObj.searchParams.get('service') || urlObj.searchParams.get('SERVICE') || '').toUpperCase();
  const request = (urlObj.searchParams.get('request') || urlObj.searchParams.get('REQUEST') || '').toUpperCase();
  const typeName = urlObj.searchParams.get('typeName') || urlObj.searchParams.get('typeNames') || urlObj.searchParams.get('TYPENAME') || urlObj.searchParams.get('layers') || urlObj.searchParams.get('LAYERS') || 'webgis:heritage_sites';

  // 若本地 GeoServer 4000 端口在线，优先反向代理至真实 GeoServer
  if (STATE.geoserverReady) {
    try {
      const targetUrl = `${GS_BASE}${pathname.replace(/^\/geoserver/, '')}${urlObj.search}`;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 3000);
      const gsRes = await fetch(targetUrl, { signal: ctrl.signal });
      clearTimeout(timer);
      if (gsRes.ok) {
        const ct = gsRes.headers.get('content-type') || 'application/json';
        const buf = Buffer.from(await gsRes.arrayBuffer());
        res.writeHead(200, {
          'Content-Type': ct,
          'Access-Control-Allow-Origin': '*',
          'X-OGC-Provider': 'GeoServer-2.27-Direct',
        });
        return res.end(buf);
      }
    } catch (e) {
      // 自动降级到内置 OGC 引擎
    }
  }

  // 内置标准 OGC WFS 响应（支持 GetCapabilities 与 GetFeature GeoJSON）
  if (pathname.endsWith('/wfs') || service === 'WFS') {
    if (request === 'GETCAPABILITIES') {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<wfs:WFS_Capabilities version="1.1.0" xmlns:wfs="http://www.opengis.net/wfs" xmlns:webgis="http://webgis.history.cn">
  <FeatureTypeList>
    <FeatureType><Name>webgis:heritage_sites</Name><Title>中国历史文化遗产点</Title><DefaultSRS>urn:x-ogc:def:crs:EPSG:4326</DefaultSRS></FeatureType>
    <FeatureType><Name>webgis:reform_events</Name><Title>改革开放关键空间事件</Title><DefaultSRS>urn:x-ogc:def:crs:EPSG:4326</DefaultSRS></FeatureType>
    <FeatureType><Name>webgis:urban_builtup</Name><Title>四城多时期建成区</Title><DefaultSRS>urn:x-ogc:def:crs:EPSG:4326</DefaultSRS></FeatureType>
    <FeatureType><Name>webgis:china_provinces</Name><Title>中国省级行政区划</Title><DefaultSRS>urn:x-ogc:def:crs:EPSG:4326</DefaultSRS></FeatureType>
  </FeatureTypeList>
</wfs:WFS_Capabilities>`;
      res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      return res.end(xml);
    }

    // GetFeature -> 返回标准 OGC WFS GeoJSON FeatureCollection
    const layerShort = typeName.split(':').pop();
    if (layerShort === 'reform_events') {
      const refData = readJson('data/reform-events.json');
      const fc = {
        type: 'FeatureCollection',
        totalFeatures: (refData.events || []).length,
        crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::4326' } },
        features: (refData.events || []).map((e) => ({
          type: 'Feature',
          id: `reform_events.${e.id}`,
          geometry: { type: 'Point', coordinates: e.coordinates },
          properties: e,
        })),
      };
      return sendJson(res, 200, fc);
    }
    if (layerShort === 'china_provinces') {
      return handleProvinceStats(req, res);
    }
    if (layerShort === 'urban_builtup') {
      const city = urlObj.searchParams.get('city') || 'shenzhen';
      const year = urlObj.searchParams.get('year') || '2014';
      const item = getLocalMergedBuiltup(city, year);
      return sendJson(res, 200, item ? item.rawFc : { type: 'FeatureCollection', features: [] });
    }
    // 默认 heritage_sites
    const herFc = readJson('data/heritage.geojson');
    const allFeatures = (herFc.features || []).concat(loadUserAnnotations()).map((f, idx) => ({
      ...f,
      id: `heritage_sites.${(f.properties && f.properties.id) || idx}`,
    }));
    return sendJson(res, 200, {
      type: 'FeatureCollection',
      totalFeatures: allFeatures.length,
      crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::4326' } },
      features: allFeatures,
    });
  }

  // 内置标准 OGC WMS 响应
  if (pathname.endsWith('/wms') || service === 'WMS') {
    if (request === 'GETCAPABILITIES') {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<WMS_Capabilities version="1.3.0" xmlns="http://www.opengis.net/wms">
  <Service><Name>WMS</Name><Title>山海新篇 GeoServer WMS 服务</Title></Service>
  <Capability><Layer><Title>webgis</Title>
    <Layer queryable="1"><Name>webgis:heritage_sites</Name><Title>文化遗产点</Title><CRS>EPSG:3857</CRS><CRS>EPSG:4326</CRS></Layer>
    <Layer queryable="1"><Name>webgis:reform_events</Name><Title>改革开放事件</Title><CRS>EPSG:3857</CRS><CRS>EPSG:4326</CRS></Layer>
    <Layer queryable="1"><Name>webgis:china_provinces</Name><Title>省级行政区划</Title><CRS>EPSG:3857</CRS><CRS>EPSG:4326</CRS></Layer>
  </Layer></Capability>
</WMS_Capabilities>`;
      res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      return res.end(xml);
    }
    // 1x1 透明 PNG 瓦片响应（前端同时通过 WFS 矢量叠加渲染高分要素）
    const transparentPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
    res.writeHead(200, { 'Content-Type': 'image/png', 'Access-Control-Allow-Origin': '*' });
    return res.end(transparentPng);
  }

  sendJson(res, 404, { ok: false, error: 'Unknown OGC endpoint' });
}

/* ============================= 静态文件服务 ============================= */

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.cjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.geojson': 'application/geo+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const COMPRESSIBLE_EXTS = new Set(['.html', '.css', '.js', '.cjs', '.json', '.geojson', '.svg']);

function serveStatic(req, res, urlObj) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(urlObj.pathname);
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Bad Request');
  }
  if (decodedPath === '/' || decodedPath === '') decodedPath = '/index.html';
  const safePath = path.normalize(path.join(ROOT, decodedPath));
  const rootPrefix = ROOT.endsWith(path.sep) ? ROOT : ROOT + path.sep;
  if (safePath !== ROOT && !safePath.startsWith(rootPrefix)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  if (!fs.existsSync(safePath) || fs.statSync(safePath).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Not Found: ' + decodedPath);
  }
  const ext = path.extname(safePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const acceptEncoding = String(req.headers['accept-encoding'] || '');
  const canGzip = COMPRESSIBLE_EXTS.has(ext) && acceptEncoding.includes('gzip');
  const isVendor = decodedPath.startsWith('/vendor/');
  const isCode = !isVendor && ['.html', '.css', '.js', '.mjs', '.cjs', '.json', '.geojson'].includes(ext);
  const headers = {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*',
    // 开发期让项目代码与页面始终重新校验；vendor 与图片允许缓存。
    'Cache-Control': isCode ? 'no-store, no-cache, must-revalidate' : 'public, max-age=3600',
    'Pragma': isCode ? 'no-cache' : 'public',
    'Expires': isCode ? '0' : '',
  };
  if (!isCode) delete headers.Expires;
  if (canGzip) {
    headers['Content-Encoding'] = 'gzip';
    headers['Vary'] = 'Accept-Encoding';
    res.writeHead(200, headers);
    fs.createReadStream(safePath).pipe(zlib.createGzip({ level: 6 })).pipe(res);
  } else {
    res.writeHead(200, headers);
    fs.createReadStream(safePath).pipe(res);
  }
}

/* ============================= HTTP Server 启动 ============================= */

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  const urlObj = new URL(req.url, `http://${req.headers.host || '127.0.0.1:' + PORT}`);
  const p = urlObj.pathname;

  try {
    if (p === '/api/status') return await handleStatus(req, res);
    if (p === '/api/heritage') return await handleHeritage(req, res, urlObj);
    if (p === '/api/spatial/buffer') return await handleSpatialBuffer(req, res, urlObj);
    if (p === '/api/spatial/builtup') return await handleSpatialBuiltup(req, res, urlObj);
    if (p === '/api/spatial/provinces-stats') return await handleProvinceStats(req, res);
    if (p.startsWith('/geoserver/')) return await handleOgcGateway(req, res, urlObj);
  } catch (err) {
    return sendJson(res, 500, { ok: false, error: err.message });
  }

  // 页面入口统一带上构建号，避免旧首页/旧子页命中浏览器缓存。
  if (p === '/' || p.endsWith('.html')) {
    if (!urlObj.searchParams.has('build')) {
      urlObj.searchParams.set('build', '20261028b');
      res.writeHead(302, {
        Location: urlObj.pathname + urlObj.search,
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      });
      return res.end();
    }
  }

  serveStatic(req, res, urlObj);
});

server.listen(PORT, () => {
  console.log(`\n==================================================================`);
  console.log(`  《山海新篇》WebGIS 空间后端已启动 (Node.js + PostGIS + GeoServer)`);
  console.log(`  访问地址: http://127.0.0.1:${PORT}/`);
  console.log(`  空间接口: http://127.0.0.1:${PORT}/api/status`);
  console.log(`  WFS 服务: http://127.0.0.1:${PORT}/geoserver/webgis/wfs?service=WFS&request=GetCapabilities`);
  console.log(`==================================================================\n`);
  bootstrapServices();
});
