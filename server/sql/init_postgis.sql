-- =============================================================================
-- 《山海新篇》WebGIS 空间数据库初始化脚本 (PostgreSQL + PostGIS)
-- 数据库名: webgis_history
-- 坐标参考系: WGS 84 (EPSG:4326)，空间量算统一转型为 GEOGRAPHY 椭球测地模型
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS postgis;

-- 1. 中国历史文化遗产点表 (Point, EPSG:4326)
CREATE TABLE IF NOT EXISTS heritage_sites (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  category VARCHAR(32) NOT NULL,
  city VARCHAR(64) NOT NULL,
  period VARCHAR(128),
  description TEXT,
  image VARCHAR(256),
  source VARCHAR(256),
  source_url VARCHAR(512),
  gallery JSONB DEFAULT '[]'::jsonb,
  image_credit VARCHAR(128),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  geom GEOMETRY(Point, 4326) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_heritage_sites_geom ON heritage_sites USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_heritage_sites_category ON heritage_sites (category);

-- 2. 改革开放关键空间事件表 (Point, EPSG:4326)
CREATE TABLE IF NOT EXISTS reform_events (
  id VARCHAR(64) PRIMARY KEY,
  year INTEGER NOT NULL,
  title VARCHAR(128) NOT NULL,
  city VARCHAR(64) NOT NULL,
  type VARCHAR(64) NOT NULL,
  description TEXT,
  significance TEXT,
  image VARCHAR(256),
  source VARCHAR(256),
  source_url VARCHAR(512),
  geom GEOMETRY(Point, 4326) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reform_events_geom ON reform_events USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_reform_events_year ON reform_events (year);

-- 3. 四座重点城市及统计序列表 (Point, EPSG:4326)
CREATE TABLE IF NOT EXISTS cities (
  key VARCHAR(32) PRIMARY KEY,
  name VARCHAR(64) NOT NULL,
  en VARCHAR(64),
  period VARCHAR(64),
  short_desc TEXT,
  zoom NUMERIC(5,2) DEFAULT 9.0,
  cover VARCHAR(256),
  cover_category VARCHAR(32),
  description TEXT,
  heritage_ids JSONB DEFAULT '[]'::jsonb,
  reform_highlights JSONB DEFAULT '[]'::jsonb,
  population_series JSONB DEFAULT '[]'::jsonb,
  gdp_series JSONB DEFAULT '[]'::jsonb,
  geom GEOMETRY(Point, 4326) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cities_geom ON cities USING GIST (geom);

-- 4. 城市多时期建成区多边形表 (MultiPolygon, EPSG:4326)
CREATE TABLE IF NOT EXISTS urban_builtup (
  id VARCHAR(64) PRIMARY KEY,
  city VARCHAR(32) NOT NULL,
  year INTEGER NOT NULL,
  resolution VARCHAR(128),
  source VARCHAR(256),
  area_sqm DOUBLE PRECISION,
  geom GEOMETRY(MultiPolygon, 4326) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_urban_builtup_geom ON urban_builtup USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_urban_builtup_city_year ON urban_builtup (city, year);

-- 5. 中国省级行政区划表 (MultiPolygon, EPSG:4326)
CREATE TABLE IF NOT EXISTS china_provinces (
  adcode VARCHAR(32) PRIMARY KEY,
  name VARCHAR(64) NOT NULL,
  geom GEOMETRY(MultiPolygon, 4326) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_china_provinces_geom ON china_provinces USING GIST (geom);

-- 6. 省域历史文化与改革开放空间密度统计视图 (PostGIS ST_Intersects 空间连接)
CREATE OR REPLACE VIEW v_province_spatial_stats AS
SELECT
  p.adcode,
  p.name,
  COUNT(DISTINCT h.id) AS heritage_count,
  COUNT(DISTINCT r.id) AS reform_count,
  (COUNT(DISTINCT h.id) + COUNT(DISTINCT r.id)) AS total_score,
  ROUND((ST_Area(p.geom::geography) / 1e6)::numeric, 1) AS area_km2
FROM china_provinces p
LEFT JOIN heritage_sites h ON ST_Intersects(p.geom, h.geom)
LEFT JOIN reform_events r ON ST_Intersects(p.geom, r.geom)
GROUP BY p.adcode, p.name, p.geom;
