"""
国土数値情報からダウンロードしたシェープファイル(.shp)一式を、
ブラウザの地図表示用にGeoJSON(EPSG:4326)へ変換するスクリプト。

使い方:
  python scripts/convert_shp_to_geojson.py

- 変換元: プロジェクト直下の "都市計画区域" フォルダ内の *.shp すべて
- 変換先: data/ フォルダに、下記 NAME_MAP に従ったファイル名で出力
- NAME_MAP に無い名前のシェープファイルは、シェープファイル名をそのまま
  ローマ字化していないファイル名(日本語のまま)で出力するので、
  新しい種類のデータが増えたら NAME_MAP に追記するとよい。
"""

import pathlib
from osgeo import gdal, ogr

gdal.UseExceptions()
ogr.UseExceptions()

PROJECT_ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC_DIR = PROJECT_ROOT / "都市計画区域"
OUT_DIR = PROJECT_ROOT / "data"

# 日本語のシェープファイル名 → 出力するGeoJSONファイル名(ローマ字slug)
NAME_MAP = {
    "都市計画区域": "toshikeikaku_kuiki",
    "区域区分": "kuiki_kubun",
    "用途地域": "youto_chiiki",
    "特別用途地区": "tokubetsu_youto_chiku",
    "特定用途制限地域": "tokutei_youto_seigen",
    "立地適正化計画": "ricchi_tekiseika_keikaku",
    "都市計画公園": "toshikeikaku_koen",
    "都市計画道路": "toshikeikaku_douro",
    "風致地区": "fuuchi_chiku",
    "高度利用地区": "koudo_riyou_chiku",
    "土地区画整理事業": "tochikukaku_seiri",
    "防火地域": "bouka_chiiki",
    "地区計画": "chiku_keikaku",
}


def convert_one(shp_path: pathlib.Path) -> str:
    stem = shp_path.stem
    out_name = NAME_MAP.get(stem, stem)
    out_path = OUT_DIR / f"{out_name}.geojson"

    gdal.VectorTranslate(
        str(out_path),
        str(shp_path),
        format="GeoJSON",
        dstSRS="EPSG:4326",
    )
    return out_name


def main():
    OUT_DIR.mkdir(exist_ok=True)
    shp_files = sorted(SRC_DIR.glob("*.shp"))
    if not shp_files:
        print(f"[警告] {SRC_DIR} に .shp が見つかりません")
        return
    for shp_path in shp_files:
        out_name = convert_one(shp_path)
        print(f"変換完了: {shp_path.name} -> data/{out_name}.geojson")


if __name__ == "__main__":
    main()
