# 熊本県 都市計画区域マップ

熊本県全域の都市計画区域・区域区分・用途地域などを、ズーム可能な地図上に色分け表示するWebサイト。

## 動かし方

- `serve.py`（簡易サーバー）で配信する。`.claude/launch.json`に設定済みなので、Preview系ツールの`preview_start`（name: "kumamoto-cityplanning-server"）で起動できる。
- 手動で動かす場合は `python serve.py` を実行し、`http://localhost:5501` を開く。
- `index.html` + `script.js` のみ。ビルド不要。外部ライブラリはLeaflet（地図表示）とleaflet.gridlayer.googlemutant（Googleマップ切替用）をCDNから読み込む。

## データについて

- 出典: [国土数値情報](https://nlftp.mlit.go.jp/ksj/)（国土交通省）の都市計画決定情報（A55）。CC BY 4.0ライセンス。
- 元データは熊本県のシェープファイル一式を `都市計画区域/` フォルダ（Git管理外）に配置し、`scripts/convert_shp_to_geojson.py` でGeoJSON化して `data/` フォルダに出力している。
- 変換時に `data/metadata.json`（変換日・レイヤーごとの件数）が自動生成され、v2サイトのレイヤーパネル下部に「データ変換日」として表示される。

## データの更新手順

### パターンA: 既存レイヤーの中身が変わった（市街化区域の拡大、地区計画の追加指定など）

1. 新しいシェープファイル（.shp/.dbf/.prj/.shx/.cpg の一式）を、`都市計画区域/` フォルダに**同じ名前で上書き**する
   - 国土数値情報の年次更新版をダウンロードした場合も、QGISで自分で編集・エクスポートした場合も同じ
   - QGISからエクスポートする場合: 文字コードUTF-8、座標系はJGD2011またはWGS84の緯度経度
2. プロジェクト直下の **`データ更新.bat` をダブルクリック**（`python scripts/convert_shp_to_geojson.py` の実行と同じ）
3. 表示される「変換完了: ○○ (△件)」の件数が想定どおり増えているか確認する
4. 公開する場合は `git add data/ && git commit && git push`（またはClaudeに「公開して」と依頼）

サイト側（script.js）の変更は**一切不要**。ファイル名と列名（AreaType等）が同じであれば、データを差し替えるだけで地図に反映される。

### パターンB: 新しい種類のレイヤーを増やす（例: 臨港地区を追加したい）

1. シェープファイル一式を `都市計画区域/` に配置（例: `臨港地区.shp` ほか）
2. `scripts/convert_shp_to_geojson.py` の `NAME_MAP` に1行追記（例: `"臨港地区": "rinko_chiku",`）
3. `データ更新.bat` をダブルクリック
4. `script.js`（v1）と `v2/script.js` の `LAYER_DEFS` にレイヤー定義を1ブロック追記
5. commit & push

手順4はコード編集になるので、Claudeに「臨港地区のレイヤーを追加して」と頼めばよい。

## 背景地図（Googleマップ）を使う場合

`script.js` 冒頭の `GOOGLE_MAPS_API_KEY` にGoogle Cloudで取得したAPIキーを設定すると、レイヤー一覧に「Googleマップ」が追加される。未設定の場合は地理院地図のみで動作する。
