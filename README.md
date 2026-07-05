# 熊本県 都市計画区域マップ

熊本県全域の都市計画区域・区域区分・用途地域などを、ズーム可能な地図上に色分け表示するWebサイト。

## 動かし方

- `serve.py`（簡易サーバー）で配信する。`.claude/launch.json`に設定済みなので、Preview系ツールの`preview_start`（name: "kumamoto-cityplanning-server"）で起動できる。
- 手動で動かす場合は `python serve.py` を実行し、`http://localhost:5501` を開く。
- `index.html` + `script.js` のみ。ビルド不要。外部ライブラリはLeaflet（地図表示）とleaflet.gridlayer.googlemutant（Googleマップ切替用）をCDNから読み込む。

## データについて

- 出典: [国土数値情報](https://nlftp.mlit.go.jp/ksj/)（国土交通省）の都市計画決定情報（A55）。CC BY 4.0ライセンス。
- 元データは熊本県のシェープファイル一式を `都市計画区域/` フォルダ（Git管理外）に配置し、`scripts/convert_shp_to_geojson.py` でGeoJSON化して `data/` フォルダに出力している。
- 新しい種類のデータ（例: 別のレイヤー）を追加する場合:
  1. 国土数値情報から該当シェープファイルをダウンロードし、`都市計画区域/` に配置
  2. `scripts/convert_shp_to_geojson.py` の `NAME_MAP` にファイル名を追記
  3. `python scripts/convert_shp_to_geojson.py` を実行
  4. `script.js` の `LAYER_DEFS` にレイヤー定義を追記

## 背景地図（Googleマップ）を使う場合

`script.js` 冒頭の `GOOGLE_MAPS_API_KEY` にGoogle Cloudで取得したAPIキーを設定すると、レイヤー一覧に「Googleマップ」が追加される。未設定の場合は地理院地図のみで動作する。
