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

import datetime
import json
import pathlib
from osgeo import gdal, ogr

gdal.UseExceptions()
ogr.UseExceptions()

PROJECT_ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC_DIR = PROJECT_ROOT / "都市計画区域"
OUT_DIR = PROJECT_ROOT / "data"

# シェープファイルのエクスポート元（QGISプロジェクト）の絶対パスがそのまま入っており、
# 公開時にローカルのユーザー名などが漏れてしまうため、公開用データからは取り除く。
DROP_FIELDS = {"path", "layer"}

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


def convert_one(shp_path: pathlib.Path) -> tuple[str, int]:
    stem = shp_path.stem
    out_name = NAME_MAP.get(stem, stem)
    out_path = OUT_DIR / f"{out_name}.geojson"

    gdal.VectorTranslate(
        str(out_path),
        str(shp_path),
        format="GeoJSON",
        dstSRS="EPSG:4326",
    )
    feature_count = _strip_fields(out_path)
    return out_name, feature_count


def _strip_fields(geojson_path: pathlib.Path) -> int:
    with open(geojson_path, encoding="utf-8") as f:
        data = json.load(f)
    for feature in data["features"]:
        for field in DROP_FIELDS:
            feature["properties"].pop(field, None)
    with open(geojson_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    return len(data["features"])


def main():
    OUT_DIR.mkdir(exist_ok=True)
    shp_files = sorted(SRC_DIR.glob("*.shp"))
    if not shp_files:
        print(f"[警告] {SRC_DIR} に .shp が見つかりません")
        return
    layer_counts = {}
    for shp_path in shp_files:
        out_name, feature_count = convert_one(shp_path)
        layer_counts[shp_path.stem] = feature_count
        print(f"変換完了: {shp_path.name} -> data/{out_name}.geojson ({feature_count}件)")

    # 変換日と各レイヤーの件数を記録する(サイト側で「データ変換日」として表示される)。
    # 前回と件数を見比べれば、更新がちゃんと反映されたか確認しやすい。
    metadata = {
        "変換日": datetime.date.today().isoformat(),
        "レイヤー件数": layer_counts,
    }
    with open(OUT_DIR / "metadata.json", "w", encoding="utf-8") as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)
    print(f"メタ情報を書き出しました: data/metadata.json (変換日: {metadata['変換日']})")


if __name__ == "__main__":
    main()
