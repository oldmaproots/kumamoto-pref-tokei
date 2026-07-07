// ============================================================
// 熊本県都市計画区域マップ v2
// v1からの主な改善点:
//  - レイヤーデータ(GeoJSON)を「表示チェックを入れたとき」に初めて
//    ダウンロードする遅延読み込み方式に変更(初期通信量 約24MB→約7MB)
//  - 現在地ボタン(ブラウザの位置情報APIを使用)
//  - 住所・地名検索(国土地理院の住所検索API。無料・キー不要)
//  - スケールバー(縮尺)の表示
//  - 読み込みエラーを画面に通知(以前はconsoleにしか出なかった)
// データは親フォルダの data/ を共用する(重複コピーしない)
// ============================================================

const KUMAMOTO_CENTER = [32.7898, 130.7417];
const INITIAL_ZOOM = 9;
const DATA_BASE = "../data/";

// Googleマップを背景に使うためのAPIキー(リファラー制限・API制限・
// 割り当て上限をGoogle Cloud側で設定済み。ブラウザ配布前提の公開可能な値)
const GOOGLE_MAPS_API_KEY = "AIzaSyCtL-wwxXA-7Ag6ucXyguE8KH7HZtN9Fjk";

const map = L.map("map", { zoomControl: false }).setView(KUMAMOTO_CENTER, INITIAL_ZOOM);

// 縮尺(スケールバー)。都市計画の確認では距離感が重要なため常時表示
L.control.scale({ imperial: false, position: "bottomleft" }).addTo(map);

// 国土地理院(地理院地図)の標準地図タイル。
// Googleマップ読み込み失敗時の保険も兼ねて、起動直後はこちらを表示する
const gsiLayer = L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png", {
  attribution:
    '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank">地理院タイル</a>',
  maxZoom: 18,
}).addTo(map);

const baseLayers = {
  "地理院地図（標準）": gsiLayer,
};

// 都市計画データの出典表示(国土数値情報の利用条件・CC BY 4.0 表示義務に基づく)
map.attributionControl.addAttribution(
  '都市計画データ: <a href="https://nlftp.mlit.go.jp/ksj/" target="_blank">国土数値情報（国土交通省）</a>を加工して作成'
);

// 頂点数の多いポリゴンが多数あるため、SVGより高速なCanvasで描画する
const sharedRenderer = L.canvas({ padding: 0.5 });

// ---- 画面下に一時的に出る通知(トースト) ----
let toastTimer = null;
function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 4000);
}

// 属性値(区域区分・用途地域など)の名称ごとの色分け
const CATEGORY_COLORS = {
  // 区域区分
  市街化区域: { color: "#d94b3f", fillColor: "#f2a89e" },
  市街化調整区域: { color: "#3f7fd9", fillColor: "#a9c8f2" },
  // 用途地域(実データの表記に合わせ、数字は全角の「１」「２」を使用)
  第１種低層住居専用地域: { color: "#2f7d32", fillColor: "#bfe3b4" },
  第２種低層住居専用地域: { color: "#4f9d4f", fillColor: "#cdeccb" },
  第１種中高層住居専用地域: { color: "#5a8f3c", fillColor: "#d3e8bf" },
  第２種中高層住居専用地域: { color: "#7ba648", fillColor: "#e0edc9" },
  第１種住居地域: { color: "#c9a227", fillColor: "#f2e3a3" },
  第２種住居地域: { color: "#d9b23f", fillColor: "#f5ecc0" },
  準住居地域: { color: "#d9c23f", fillColor: "#f5efc0" },
  田園住居地域: { color: "#8fae3f", fillColor: "#e3edc0" },
  近隣商業地域: { color: "#e08a2b", fillColor: "#f7cfa0" },
  商業地域: { color: "#d94b3f", fillColor: "#f2a89e" },
  準工業地域: { color: "#a15fc9", fillColor: "#dfc3f2" },
  工業地域: { color: "#6b5fc9", fillColor: "#c8c3f2" },
  工業専用地域: { color: "#3f4fc9", fillColor: "#b8c0f2" },
  // 防火地域
  防火地域: { color: "#b3271e", fillColor: "#e8a29c" },
  準防火地域: { color: "#d98c1f", fillColor: "#f2d19c" },
};

// 種類ごとの色分けを持たないレイヤー用の既定色
const FALLBACK_PALETTE = [
  { color: "#888888", fillColor: "#cccccc" },
  { color: "#c9691f", fillColor: "#f0cba0" },
  { color: "#1f8fc9", fillColor: "#a7dcf2" },
  { color: "#8f1fc9", fillColor: "#dba7f2" },
  { color: "#1fc98f", fillColor: "#a7f2d3" },
  { color: "#c91f5f", fillColor: "#f2a7c3" },
];

// 表示するレイヤーの定義(内容はv1と同じ。読み込み方だけが遅延方式に変わった)
const LAYER_DEFS = [
  {
    key: "toshikeikaku_kuiki",
    file: "toshikeikaku_kuiki.geojson",
    label: "都市計画区域（境界）",
    categoryFields: [],
    defaultOn: true,
    fillOpacity: 0,
    weight: 3,
    dashArray: "10 6",
    color: "#283593",
  },
  {
    key: "kuiki_kubun",
    file: "kuiki_kubun.geojson",
    label: "区域区分（市街化区域・調整区域）",
    categoryFields: ["AreaType"],
    defaultOn: true,
    fillOpacity: 0.35,
  },
  {
    key: "youto_chiiki",
    file: "youto_chiiki.geojson",
    label: "用途地域",
    categoryFields: ["YoutoName", "AreaType"],
    defaultOn: false,
    fillOpacity: 0.45,
    splitByCategory: true,
  },
  {
    key: "bouka_chiiki",
    file: "bouka_chiiki.geojson",
    label: "防火地域・準防火地域",
    categoryFields: ["AreaType"],
    defaultOn: false,
    fillOpacity: 0.35,
  },
  {
    key: "chiku_keikaku",
    file: "chiku_keikaku.geojson",
    label: "地区計画",
    categoryFields: ["DistName"],
    defaultOn: false,
    fillOpacity: 0.3,
  },
  {
    key: "tokubetsu_youto_chiku",
    file: "tokubetsu_youto_chiku.geojson",
    label: "特別用途地区",
    categoryFields: ["YoutoName"],
    defaultOn: false,
    fillOpacity: 0.3,
  },
  {
    key: "tokutei_youto_seigen",
    file: "tokutei_youto_seigen.geojson",
    label: "特定用途制限地域",
    categoryFields: ["DistName"],
    defaultOn: false,
    fillOpacity: 0.3,
  },
  {
    key: "ricchi_tekiseika_keikaku",
    file: "ricchi_tekiseika_keikaku.geojson",
    label: "立地適正化計画区域",
    categoryFields: ["AreaType"],
    defaultOn: false,
    fillOpacity: 0.2,
  },
  {
    key: "toshikeikaku_koen",
    file: "toshikeikaku_koen.geojson",
    label: "都市計画公園・緑地",
    categoryFields: ["ParkType"],
    defaultOn: false,
    fillOpacity: 0.4,
  },
  {
    key: "toshikeikaku_douro",
    file: "toshikeikaku_douro.geojson",
    label: "都市計画道路",
    categoryFields: [],
    defaultOn: false,
    fillOpacity: 0,
    weight: 2,
  },
  {
    key: "fuuchi_chiku",
    file: "fuuchi_chiku.geojson",
    label: "風致地区",
    categoryFields: [],
    defaultOn: false,
    fillOpacity: 0.25,
  },
  {
    key: "koudo_riyou_chiku",
    file: "koudo_riyou_chiku.geojson",
    label: "高度利用地区",
    categoryFields: [],
    defaultOn: false,
    fillOpacity: 0.3,
  },
  {
    key: "tochikukaku_seiri",
    file: "tochikukaku_seiri.geojson",
    label: "土地区画整理事業",
    categoryFields: ["DistName"],
    defaultOn: false,
    fillOpacity: 0.3,
  },
];

// レイヤーごとに、カテゴリ未定義の値へ一貫した色を割り当てるためのキャッシュ
const dynamicColorCache = new Map();
function colorForUnknownCategory(layerKey, name) {
  const cacheKey = `${layerKey}::${name}`;
  if (!dynamicColorCache.has(cacheKey)) {
    const idx = dynamicColorCache.size % FALLBACK_PALETTE.length;
    dynamicColorCache.set(cacheKey, FALLBACK_PALETTE[idx]);
  }
  return dynamicColorCache.get(cacheKey);
}

function findCategoryName(properties, categoryFields) {
  for (const key of categoryFields) {
    if (properties && properties[key]) return String(properties[key]);
  }
  return null;
}

function styleForCategory(layerKey, categoryName, fallbackIndex, overrideColor) {
  if (overrideColor) return { color: overrideColor, fillColor: overrideColor };
  return categoryName
    ? CATEGORY_COLORS[categoryName] || colorForUnknownCategory(layerKey, categoryName)
    : FALLBACK_PALETTE[fallbackIndex % FALLBACK_PALETTE.length];
}

function makeFeatureLayer(features, def, fallbackIndex, fixedCategoryName) {
  return L.geoJSON(
    { type: "FeatureCollection", features },
    {
      renderer: sharedRenderer,
      style: (feature) => {
        const categoryName =
          fixedCategoryName ?? findCategoryName(feature.properties, def.categoryFields);
        const style = styleForCategory(def.key, categoryName, fallbackIndex, def.color);
        return {
          color: style.color,
          fillColor: style.fillColor,
          weight: def.weight ?? 1,
          dashArray: def.dashArray,
          fillOpacity: def.fillOpacity,
        };
      },
    }
  );
}

// overlayLabel -> { layer, categoryFields } タップ時の識別に使う台帳
const overlayRegistry = new Map();

// ---- 遅延読み込み ----
// チェックを入れたとき(または用途地域を展開したとき)に初めてGeoJSONを取得する。
// 一度読み込んだら使い回す。失敗したらトーストで知らせ、次回チェック時に再試行する。
function ensureLoaded(def) {
  if (def._loadPromise) return def._loadPromise;
  const defIndex = LAYER_DEFS.indexOf(def);
  def._loadPromise = fetch(DATA_BASE + def.file)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then((geojson) => {
      if (def.splitByCategory) {
        const groups = new Map(); // categoryName -> features[]
        geojson.features.forEach((feature) => {
          const name = findCategoryName(feature.properties, def.categoryFields) || "その他";
          if (!groups.has(name)) groups.set(name, []);
          groups.get(name).push(feature);
        });
        def._subLayers = [...groups.entries()]
          .sort(([a], [b]) => a.localeCompare(b, "ja"))
          .map(([categoryName, features], i) => {
            const layer = makeFeatureLayer(features, def, defIndex + i, categoryName);
            overlayRegistry.set(`${def.label}：${categoryName}`, { layer, categoryFields: [] });
            return { categoryName, layer };
          });
      } else {
        def._layer = makeFeatureLayer(geojson.features, def, defIndex, null);
        overlayRegistry.set(def.label, { layer: def._layer, categoryFields: def.categoryFields });
      }
    })
    .catch((err) => {
      def._loadPromise = null; // 次回の操作で再試行できるようにする
      showToast(`「${def.label}」の読み込みに失敗しました`);
      throw err;
    });
  return def._loadPromise;
}

// ---- 初期表示レイヤーの読み込みと画面フィット ----
const defaultDefs = LAYER_DEFS.filter((def) => def.defaultOn);
Promise.allSettled(
  defaultDefs.map((def) =>
    ensureLoaded(def).then(() => {
      def._layer.addTo(map);
      return def._layer.getBounds();
    })
  )
).then((results) => {
  const bounds = L.latLngBounds([]);
  results.forEach((r) => {
    if (r.status === "fulfilled") bounds.extend(r.value);
  });
  if (bounds.isValid()) map.fitBounds(bounds);
});

// ---- タップ(クリック)した地点にある、表示中の全レイヤーの情報をまとめて表示 ----
function pointInRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInGeometry(lng, lat, geometry) {
  if (!geometry) return false;
  if (geometry.type === "Polygon") {
    const rings = geometry.coordinates;
    if (!pointInRing(lng, lat, rings[0])) return false;
    for (let k = 1; k < rings.length; k++) {
      if (pointInRing(lng, lat, rings[k])) return false; // 穴(内側の輪)の中
    }
    return true;
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((poly) =>
      pointInGeometry(lng, lat, { type: "Polygon", coordinates: poly })
    );
  }
  return false;
}

function findMatchesAtPoint(latlng) {
  const matches = [];
  overlayRegistry.forEach(({ layer, categoryFields }, label) => {
    if (!map.hasLayer(layer)) return;
    layer.eachLayer((featureLayer) => {
      const feature = featureLayer.feature;
      if (!feature || !pointInGeometry(latlng.lng, latlng.lat, feature.geometry)) return;
      const categoryName = findCategoryName(feature.properties, categoryFields);
      matches.push(categoryName ? `${label}: ${categoryName}` : label);
    });
  });
  return matches;
}

map.on("click", (e) => {
  const matches = findMatchesAtPoint(e.latlng);
  if (matches.length === 0) return;
  const html = `<div class="tap-popup">${matches
    .map((line) => `<div>${line}</div>`)
    .join("")}</div>`;
  L.popup({ maxWidth: 280 }).setLatLng(e.latlng).setContent(html).openOn(map);
});

// ---- レイヤー一覧パネル(遅延読み込み対応) ----
const LayerPanelControl = L.Control.extend({
  onAdd() {
    const container = L.DomUtil.create("div", "layer-panel");
    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.disableScrollPropagation(container);

    const toggle = L.DomUtil.create("div", "layer-panel-toggle", container);
    toggle.textContent = "☰ レイヤー";

    const content = L.DomUtil.create("div", "layer-panel-content collapsed", container);
    LAYER_DEFS.forEach((def) => {
      content.appendChild(def.splitByCategory ? buildGroupRow(def) : buildSimpleRow(def));
    });

    // データの変換日(scripts/convert_shp_to_geojson.py 実行時に記録される)を表示
    const footer = L.DomUtil.create("div", "layer-panel-footer", content);
    fetch(`${DATA_BASE}metadata.json`)
      .then((res) => (res.ok ? res.json() : null))
      .then((meta) => {
        if (meta && meta["変換日"]) footer.textContent = `データ変換日: ${meta["変換日"]}`;
      })
      .catch(() => {});

    toggle.addEventListener("click", () => {
      content.classList.toggle("collapsed");
    });

    return container;
  },
});

function buildSimpleRow(def) {
  const row = document.createElement("label");
  row.className = "layer-row";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = !!def.defaultOn;
  checkbox.addEventListener("change", async () => {
    if (checkbox.checked) {
      try {
        await ensureLoaded(def);
        // 読み込み中にチェックを外された場合は追加しない
        if (checkbox.checked) def._layer.addTo(map);
      } catch {
        checkbox.checked = false;
      }
    } else if (def._layer) {
      def._layer.remove();
    }
  });
  row.appendChild(checkbox);
  row.appendChild(document.createTextNode(def.label));
  return row;
}

function buildGroupRow(def) {
  const wrapper = document.createElement("div");
  wrapper.className = "layer-group";

  const header = document.createElement("div");
  header.className = "layer-group-header";

  const arrow = document.createElement("span");
  arrow.className = "layer-toggle-arrow";
  arrow.textContent = "▶";

  const masterCheckbox = document.createElement("input");
  masterCheckbox.type = "checkbox";

  const labelSpan = document.createElement("span");
  labelSpan.textContent = def.label;
  labelSpan.className = "layer-group-label";

  header.appendChild(arrow);
  header.appendChild(masterCheckbox);
  header.appendChild(labelSpan);

  const childrenContainer = document.createElement("div");
  childrenContainer.className = "layer-group-children collapsed";

  let childEntries = null; // データ読み込み後に生成する

  async function buildChildrenOnce() {
    await ensureLoaded(def);
    if (childEntries) return;
    childEntries = def._subLayers.map(({ categoryName, layer }) => {
      const row = document.createElement("label");
      row.className = "layer-row";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = map.hasLayer(layer);
      cb.addEventListener("change", () => {
        if (cb.checked) layer.addTo(map);
        else layer.remove();
        updateMasterState();
      });
      row.appendChild(cb);
      row.appendChild(document.createTextNode(categoryName));
      childrenContainer.appendChild(row);
      return { cb, layer };
    });
  }

  function updateMasterState() {
    if (!childEntries) return;
    const onCount = childEntries.filter(({ layer }) => map.hasLayer(layer)).length;
    masterCheckbox.checked = onCount === childEntries.length;
    masterCheckbox.indeterminate = onCount > 0 && onCount < childEntries.length;
  }

  masterCheckbox.addEventListener("change", async () => {
    const turnOn = masterCheckbox.checked;
    try {
      await buildChildrenOnce();
    } catch {
      masterCheckbox.checked = false;
      return;
    }
    childEntries.forEach(({ cb, layer }) => {
      cb.checked = turnOn;
      if (turnOn) layer.addTo(map);
      else layer.remove();
    });
    masterCheckbox.indeterminate = false;
  });

  arrow.addEventListener("click", async () => {
    try {
      await buildChildrenOnce();
    } catch {
      return;
    }
    const collapsed = childrenContainer.classList.toggle("collapsed");
    arrow.textContent = collapsed ? "▶" : "▼";
  });

  wrapper.appendChild(header);
  wrapper.appendChild(childrenContainer);
  return wrapper;
}

// ---- 現在地ボタン ----
let locationMarker = null;
let locationCircle = null;

const LocateControl = L.Control.extend({
  onAdd() {
    const btn = L.DomUtil.create("button", "locate-btn");
    btn.type = "button";
    btn.textContent = "📍 現在地";
    btn.title = "現在地を表示";
    L.DomEvent.disableClickPropagation(btn);
    btn.addEventListener("click", () => {
      map.locate({ setView: true, maxZoom: 16 });
    });
    return btn;
  },
});

map.on("locationfound", (e) => {
  if (locationMarker) locationMarker.remove();
  if (locationCircle) locationCircle.remove();
  locationMarker = L.marker(e.latlng).addTo(map).bindPopup("現在地");
  // 位置情報の誤差の範囲を円で示す
  locationCircle = L.circle(e.latlng, {
    radius: e.accuracy,
    color: "#4285f4",
    fillColor: "#4285f4",
    fillOpacity: 0.15,
    weight: 1,
  }).addTo(map);
});

map.on("locationerror", () => {
  showToast("現在地を取得できませんでした（位置情報の許可を確認してください）");
});

// ---- 住所・地名検索(国土地理院の住所検索API。無料・キー不要) ----
const searchInput = document.getElementById("search-input");
const searchBtn = document.getElementById("search-btn");
const searchResults = document.getElementById("search-results");
let searchMarker = null;

async function doSearch() {
  const query = searchInput.value.trim();
  if (!query) return;
  searchResults.innerHTML = "<div class='search-result-item'>検索中…</div>";
  searchResults.classList.remove("hidden");
  try {
    const res = await fetch(
      `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(query)}`
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const items = await res.json();
    if (!Array.isArray(items) || items.length === 0) {
      searchResults.innerHTML = "<div class='search-result-item'>見つかりませんでした</div>";
      return;
    }
    searchResults.innerHTML = "";
    items.slice(0, 8).forEach((item) => {
      const [lng, lat] = item.geometry.coordinates;
      const div = document.createElement("div");
      div.className = "search-result-item selectable";
      div.textContent = item.properties.title;
      div.addEventListener("click", () => {
        map.flyTo([lat, lng], 15);
        if (searchMarker) searchMarker.remove();
        searchMarker = L.marker([lat, lng]).addTo(map).bindPopup(item.properties.title);
        searchResults.classList.add("hidden");
      });
      searchResults.appendChild(div);
    });
  } catch (err) {
    console.warn("検索エラー:", err);
    searchResults.classList.add("hidden");
    showToast("検索に失敗しました（通信状態を確認してください）");
  }
}

searchBtn.addEventListener("click", doSearch);
searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") doSearch();
});
// 地図をクリックしたら検索結果一覧を閉じる
map.on("click", () => searchResults.classList.add("hidden"));

// ---- コントロールの配置 ----
const layersControl = L.control
  .layers(baseLayers, null, { collapsed: true, position: "topright" })
  .addTo(map);
new LayerPanelControl({ position: "topleft" }).addTo(map);
new LocateControl({ position: "bottomright" }).addTo(map);

// ---- Googleマップ(地図・航空写真)の組み込みとデフォルト化 ----
// 読み込み成功時にデフォルト背景を地理院地図からGoogleマップへ切り替える。
// 失敗・認証エラー時は地理院地図のまま(地図が真っ白になるのを防ぐ)。
function setUpGoogleMapsBaseLayers() {
  if (!GOOGLE_MAPS_API_KEY) return;
  let googleRoadLayer = null;
  const script = document.createElement("script");
  script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&loading=async&callback=__onGoogleMapsLoaded`;
  script.async = true;
  window.__onGoogleMapsLoaded = () => {
    googleRoadLayer = L.gridLayer.googleMutant({ type: "roadmap" });
    layersControl.addBaseLayer(googleRoadLayer, "Googleマップ");
    layersControl.addBaseLayer(
      L.gridLayer.googleMutant({ type: "hybrid" }),
      "Googleマップ（航空写真）"
    );
    map.removeLayer(gsiLayer);
    googleRoadLayer.addTo(map);
  };
  window.gm_authFailure = () => {
    console.warn("Google Maps 認証エラー（リファラー制限等）。地理院地図に戻します。");
    if (googleRoadLayer && map.hasLayer(googleRoadLayer)) {
      map.removeLayer(googleRoadLayer);
    }
    if (!map.hasLayer(gsiLayer)) gsiLayer.addTo(map);
  };
  script.onerror = () => {
    console.warn("Google Maps APIの読み込みに失敗しました。APIキーを確認してください。");
  };
  document.head.appendChild(script);
}
setUpGoogleMapsBaseLayers();
