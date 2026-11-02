// server/init-postgis-geoserver.cjs — 自动初始化 PostGIS 空间数据库并向 GeoServer 发布 WMS/WFS 图层
const fs = require('fs');
const path = require('path');
const { PgClient } = require('./pg-wire.cjs');

const ROOT = path.join(__dirname, '..');
const DB_NAME = process.env.PGDATABASE || 'webgis_history';
const PG_CFG = {
  host: process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || '',
};

const GS_BASE = (process.env.GEOSERVER_URL || 'http://127.0.0.1:4000/geoserver').replace(/\/+$/, '');
const GS_USER = process.env.GEOSERVER_USER || 'admin';
const GS_PASS = process.env.GEOSERVER_PASS || 'geoserver';
const GS_WORKSPACE = 'webgis';
const GS_STORE = 'postgis_history';

function readJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relPath), 'utf8'));
}

async function initPostGIS() {
  const sysDb = new PgClient({ ...PG_CFG, database: 'template1', timeout: 5000 });
  const check = await sysDb.query('SELECT 1 AS ok FROM pg_database WHERE datname = $1;', [DB_NAME]);
  if (!check.rows.length) {
    await sysDb.query(`CREATE DATABASE ${DB_NAME} ENCODING 'UTF8';`);
  }

  const db = new PgClient({ ...PG_CFG, database: DB_NAME, timeout: 15000 });
  const verRes = await db.query('CREATE EXTENSION IF NOT EXISTS postgis; SELECT PostGIS_Full_Version() AS ver;');
  const postgisVersion = (verRes.rows[0] && verRes.rows[0].ver) || 'PostGIS Enabled';

  // 执行建表与空间索引脚本
  const sqlScript = fs.readFileSync(path.join(__dirname, 'sql', 'init_postgis.sql'), 'utf8');
  await db.query(sqlScript);

  // 1. 导入文化遗产点 (heritage.geojson)
  const heritageFc = readJson('data/heritage.geojson');
  for (const f of heritageFc.features || []) {
    const p = f.properties || {};
    const [lng, lat] = (f.geometry && f.geometry.coordinates) || [0, 0];
    await db.query(
      `INSERT INTO heritage_sites (id, name, category, city, period, description, image, source, source_url, gallery, image_credit, geom)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, ST_SetSRID(ST_MakePoint($12, $13), 4326))
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         category = EXCLUDED.category,
         city = EXCLUDED.city,
         period = EXCLUDED.period,
         description = EXCLUDED.description,
         image = EXCLUDED.image,
         source = EXCLUDED.source,
         source_url = EXCLUDED.source_url,
         gallery = EXCLUDED.gallery,
         geom = EXCLUDED.geom;`,
      [
        p.id, p.name, p.category, p.city || '', p.period || '', p.description || '',
        p.image || null, p.source || '', p.sourceUrl || '', JSON.stringify(p.gallery || []),
        p.imageCredit || '百度百科 · 词条配图', Number(lng), Number(lat),
      ]
    );
  }

  // 2. 导入改革开放事件点 (reform-events.json)
  const reformData = readJson('data/reform-events.json');
  for (const e of reformData.events || []) {
    const [lng, lat] = e.coordinates || [0, 0];
    await db.query(
      `INSERT INTO reform_events (id, year, title, city, type, description, significance, image, source, source_url, geom)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, ST_SetSRID(ST_MakePoint($11, $12), 4326))
       ON CONFLICT (id) DO UPDATE SET
         year = EXCLUDED.year,
         title = EXCLUDED.title,
         city = EXCLUDED.city,
         type = EXCLUDED.type,
         description = EXCLUDED.description,
         significance = EXCLUDED.significance,
         image = EXCLUDED.image,
         geom = EXCLUDED.geom;`,
      [
        e.id, Number(e.year), e.title, e.city || '', e.type || '',
        e.description || '', e.significance || '', e.image || null,
        e.source || '', e.sourceUrl || '', Number(lng), Number(lat),
      ]
    );
  }

  // 3. 导入重点城市及统计序列 (cities.json + city-statistics.json)
  const citiesList = readJson('data/cities.json');
  const cityStats = readJson('data/city-statistics.json');
  for (const c of citiesList || []) {
    const [lng, lat] = c.center || [0, 0];
    const st = (cityStats.series && cityStats.series[c.key]) || {};
    await db.query(
      `INSERT INTO cities (key, name, en, period, short_desc, zoom, cover, cover_category, description, heritage_ids, reform_highlights, population_series, gdp_series, geom)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb, $13::jsonb, ST_SetSRID(ST_MakePoint($14, $15), 4326))
       ON CONFLICT (key) DO UPDATE SET
         name = EXCLUDED.name,
         short_desc = EXCLUDED.short_desc,
         zoom = EXCLUDED.zoom,
         cover = EXCLUDED.cover,
         description = EXCLUDED.description,
         reform_highlights = EXCLUDED.reform_highlights,
         population_series = EXCLUDED.population_series,
         gdp_series = EXCLUDED.gdp_series,
         geom = EXCLUDED.geom;`,
      [
        c.key, c.name, c.en || '', c.period || '', c.short || '', Number(c.zoom || 9),
        c.cover || '', c.coverCategory || 'building', c.description || '',
        JSON.stringify(c.heritageIds || []), JSON.stringify(c.reformHighlights || []),
        JSON.stringify(st.population || []), JSON.stringify(st.gdp || []),
        Number(lng), Number(lat),
      ]
    );
  }

  // 4. 导入四城多时期建成区 (urban-expansion/*.geojson)，由 PostGIS ST_Union 去重合并并计算 ST_Area(geom::geography)
  const urbanIdx = readJson('data/urban-expansion/urban-index.json');
  const existingBu = await db.query('SELECT id FROM urban_builtup;');
  const existingBuIds = new Set(existingBu.rows.map((r) => r.id));

  for (const [cityKey, meta] of Object.entries(urbanIdx.cities || {})) {
    for (const yr of meta.years || []) {
      const rowId = `${cityKey}_${yr}`;
      if (existingBuIds.has(rowId)) continue;
      const fcPath = `data/urban-expansion/${cityKey}_${yr}.geojson`;
      if (!fs.existsSync(path.join(ROOT, fcPath))) continue;
      const fc = readJson(fcPath);
      const geoms = (fc.features || []).map((f) => f.geometry).filter(Boolean);
      if (!geoms.length) continue;
      // 构造 GeometryCollection 交由 PostGIS ST_CollectionExtract + ST_MakeValid + ST_UnaryUnion 合并为无重叠 MultiPolygon
      const gcJson = JSON.stringify({ type: 'GeometryCollection', geometries: geoms });
      await db.query(
        `WITH merged AS (
           SELECT ST_Multi(ST_CollectionExtract(ST_UnaryUnion(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($5), 4326))), 3)) AS g
         )
         INSERT INTO urban_builtup (id, city, year, resolution, source, area_sqm, geom)
         SELECT $1, $2, $3, $4, $6, ST_Area(g::geography), g FROM merged
         ON CONFLICT (id) DO UPDATE SET area_sqm = EXCLUDED.area_sqm, geom = EXCLUDED.geom;`,
        [rowId, cityKey, Number(yr), meta.resolution || '', gcJson, meta.source || '']
      );
    }
  }

  // 5. 导入省级行政区划 (china-provinces.geojson)
  const provCountRes = await db.query('SELECT COUNT(*)::int AS cnt FROM china_provinces;');
  if (!provCountRes.rows[0] || provCountRes.rows[0].cnt < 30) {
    const provFc = readJson('data/china-provinces.geojson');
    for (let i = 0; i < (provFc.features || []).length; i++) {
      const f = provFc.features[i];
      const p = f.properties || {};
      const adcode = String(p.adcode || p.id || (110000 + i));
      const name = p.name || `Province_${i}`;
      if (!f.geometry) continue;
      await db.query(
        `INSERT INTO china_provinces (adcode, name, geom)
         VALUES ($1, $2, ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($3), 4326)), 3)))
         ON CONFLICT (adcode) DO NOTHING;`,
        [adcode, name, JSON.stringify(f.geometry)]
      );
    }
  }

  const counts = await db.query(`
    SELECT
      (SELECT COUNT(*)::int FROM heritage_sites) AS heritage,
      (SELECT COUNT(*)::int FROM reform_events) AS reform,
      (SELECT COUNT(*)::int FROM cities) AS cities,
      (SELECT COUNT(*)::int FROM urban_builtup) AS builtup,
      (SELECT COUNT(*)::int FROM china_provinces) AS provinces;
  `);

  return {
    ok: true,
    database: DB_NAME,
    host: `${PG_CFG.host}:${PG_CFG.port}`,
    version: postgisVersion,
    counts: counts.rows[0] || {},
  };
}

async function gsRequest(endpoint, method = 'GET', body = null, contentType = 'application/json') {
  const auth = Buffer.from(`${GS_USER}:${GS_PASS}`).toString('base64');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3500);
  try {
    const res = await fetch(`${GS_BASE}/rest${endpoint}`, {
      method,
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': contentType } : {}),
      },
      body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const text = await res.text();
    return { status: res.status, ok: res.ok, text };
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

async function publishGeoServer() {
  // 1. 探测 GeoServer REST 是否可达
  const about = await gsRequest('/workspaces.json', 'GET');
  if (!about.ok && about.status !== 200) {
    throw new Error(`GeoServer REST status ${about.status}`);
  }

  // 2. 创建工作空间 webgis
  const wsCheck = await gsRequest(`/workspaces/${GS_WORKSPACE}.json`, 'GET');
  if (!wsCheck.ok) {
    await gsRequest('/workspaces', 'POST', {
      workspace: { name: GS_WORKSPACE },
    });
  }

  // 3. 创建 PostGIS 数据存储 postgis_history
  const dsCheck = await gsRequest(`/workspaces/${GS_WORKSPACE}/datastores/${GS_STORE}.json`, 'GET');
  if (!dsCheck.ok) {
    await gsRequest(`/workspaces/${GS_WORKSPACE}/datastores`, 'POST', {
      dataStore: {
        name: GS_STORE,
        description: '山海新篇 PostGIS 空间数据库存储',
        type: 'PostGIS',
        enabled: true,
        connectionParameters: {
          entry: [
            { '@key': 'dbtype', $: 'postgis' },
            { '@key': 'host', $: PG_CFG.host },
            { '@key': 'port', $: String(PG_CFG.port) },
            { '@key': 'database', $: DB_NAME },
            { '@key': 'schema', $: 'public' },
            { '@key': 'user', $: PG_CFG.user },
            { '@key': 'passwd', $: PG_CFG.password },
            { '@key': 'Expose primary keys', $: 'true' },
          ],
        },
      },
    });
  }

  // 4. 发布 4 个空间表为 WMS / WFS 图层
  const tables = [
    { name: 'heritage_sites', title: '中国历史文化遗产点 (PostGIS)' },
    { name: 'reform_events', title: '改革开放关键空间事件 (PostGIS)' },
    { name: 'urban_builtup', title: '四城多时期建成区范围 (PostGIS)' },
    { name: 'china_provinces', title: '中国省级行政区划 (PostGIS)' },
  ];

  const published = [];
  for (const t of tables) {
    const ftCheck = await gsRequest(`/workspaces/${GS_WORKSPACE}/datastores/${GS_STORE}/featuretypes/${t.name}.json`, 'GET');
    if (!ftCheck.ok) {
      await gsRequest(`/workspaces/${GS_WORKSPACE}/datastores/${GS_STORE}/featuretypes?recalculate=nativebbox,latlonbbox`, 'POST', {
        featureType: {
          name: t.name,
          nativeName: t.name,
          title: t.title,
          srs: 'EPSG:4326',
          enabled: true,
        },
      });
    } else {
      await gsRequest(`/workspaces/${GS_WORKSPACE}/datastores/${GS_STORE}/featuretypes/${t.name}?recalculate=nativebbox,latlonbbox`, 'PUT', {
        featureType: {
          name: t.name,
          title: t.title,
          srs: 'EPSG:4326',
          enabled: true,
        },
      });
    }
    published.push(`${GS_WORKSPACE}:${t.name}`);
  }

  return {
    ok: true,
    url: GS_BASE,
    workspace: GS_WORKSPACE,
    datastore: GS_STORE,
    layers: published,
  };
}

if (require.main === module) {
  (async () => {
    try {
      const pgRes = await initPostGIS();
      console.log('[PostGIS] 初始化成功:', JSON.stringify(pgRes, null, 2));
    } catch (e) {
      console.warn('[PostGIS] 本地服务未连接（将由后端自动启用本地空间引擎降级）:', e.message);
    }
    try {
      const gsRes = await publishGeoServer();
      console.log('[GeoServer] 图层发布成功:', JSON.stringify(gsRes, null, 2));
    } catch (e) {
      console.warn('[GeoServer] 本地 4000 端口未启动（将由 Node.js 内置 OGC WMS/WFS 网关提供兼容服务）:', e.message);
    }
  })();
}

module.exports = { initPostGIS, publishGeoServer, PG_CFG, DB_NAME, GS_BASE, GS_WORKSPACE, GS_STORE };
