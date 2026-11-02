# gen_urban_aue.py — 统一调用 collect_all_urban.py（自动按 .prj 识别各城 UTM 投影带，不再硬编码 EPSG:32650）
from collect_all_urban import AUE_CITIES, process_aue_city, process_ghsl_xiamen

if __name__ == "__main__":
    process_ghsl_xiamen()
    for city_key, zip_fn, url_fn, tol in AUE_CITIES:
        process_aue_city(city_key, zip_fn, url_fn, simplify_tol=tol)
