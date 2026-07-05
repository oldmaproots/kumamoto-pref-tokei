// 熊本県中心・全域が収まるズームレベルで初期表示
const KUMAMOTO_CENTER = [32.7898, 130.7417];
const INITIAL_ZOOM = 9;

// Googleマップを背景に使う場合はここにAPIキーを入れる（Google Cloudで取得、要ビリング設定）。
// 空のままなら地理院地図のみで動作する。
const GOOGLE_MAPS_API_KEY = "";

const map = L.map("map", { zoomControl: true }).setView(KUMAMOTO_CENTER, INITIAL_ZOOM);

// 国土地理院（地理院地図）の標準地図タイルをベースマップに使用
const gsiLayer = L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png", {
  attribution:
    '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank">地理院タイル</a>',
  maxZoom: 18,
}).addTo(map);

const baseLayers = {
  "地理院地図（標準）": gsiLayer,
};

// 都市計画データの出典表示（国土数値情報の利用条件・CC BY 4.0 表示義務に基づく）
map.attributionControl.addAttribution(
  '都市計画データ: <a href="https://nlftp.mlit.go.jp/ksj/" target="_blank">国土数値情報（国土交通省）</a>を加工して作成'
);

// 頂点数の多いポリゴン（行政境界など）が多数あるため、SVGより高速なCanvasで描画する
const sharedRenderer = L.canvas({ padding: 0.5 });

// 属性値（区域区分・用途地域など）の名称ごとの色分け。
// 複数のレイヤーで同じ名称が出てきても共通の色になるようにフラットな辞書にしている。
const CATEGORY_COLORS = {
  // 区域区分
  市街化区域: { color: "#d94b3f", fillColor: "#f2a89e" },
  市街化調整区域: { color: "#3f7fd9", fillColor: "#a9c8f2" },
  // 用途地域（実データの表記に合わせ、数字は全角の「１」「２」を使用）
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

// 「種類ごとの色分け」を持たないレイヤー（境界線や単一種別のレイヤー）用の既定色
const FALLBACK_PALETTE = [
  { color: "#888888", fillColor: "#cccccc" },
  { color: "#c9691f", fillColor: "#f0cba0" },
  { color: "#1f8fc9", fillColor: "#a7dcf2" },
  { color: "#8f1fc9", fillColor: "#dba7f2" },
  { color: "#1fc98f", fillColor: "#a7f2d3" },
  { color: "#c91f5f", fillColor: "#f2a7c3" },
];

// 表示するレイヤーの定義。新しいシェープファイルを追加したときは、
// scripts/convert_shp_to_geojson.py で変換してから、この配列にエントリを足す。
//   key: 内部識別用
//   file: data/ 以下のGeoJSONファイル名
//   label: レイヤー一覧に表示する名前
//   categoryFields: 色分け・グループ分けに使う可能性のある属性名（見つかった順に使う）
//   defaultOn: 初期表示するか
//   fillOpacity: 塗りの透明度（境界線だけ見せたいレイヤーは0にする）
//   splitByCategory: true にすると、種別ごとに個別のON/OFFレイヤーとして登録する
const LAYER_DEFS = [
  {
    key: "toshikeikaku_kuiki",
    file: "toshikeikaku_kuiki.geojson",
    label: "都市計画区域（境界）",
    categoryFields: [],
    defaultOn: true,
    fillOpacity: 0,
    weight: 2,
    dashArray: "6 4",
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
    defaultOn: true,
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

function styleForCategory(layerKey, categoryName, fallbackIndex) {
  return categoryName
    ? CATEGORY_COLORS[categoryName] || colorForUnknownCategory(layerKey, categoryName)
    : FALLBACK_PALETTE[fallbackIndex % FALLBACK_PALETTE.length];
}

function buildInfoHtml(properties) {
  const rows = Object.entries(properties || {})
    .filter(([key]) => key !== "layer" && key !== "path")
    .map(([key, value]) => `<tr><td class="label">${key}</td><td>${value ?? ""}</td></tr>`)
    .join("");
  return `<table>${rows}</table>`;
}

function showInfoPanel(properties) {
  document.getElementById("info-content").innerHTML = buildInfoHtml(properties);
  document.getElementById("info-panel").classList.remove("hidden");
}

document.getElementById("info-close").addEventListener("click", () => {
  document.getElementById("info-panel").classList.add("hidden");
});

// overlayLabel(レイヤー一覧に出す名前) -> { layer, categoryNames: Set }
const overlayRegistry = new Map();
function renderLegend() {
  const legend = document.getElementById("legend");
  legend.innerHTML = "";
  const shown = new Set();
  overlayRegistry.forEach(({ layer, categoryNames }) => {
    if (!map.hasLayer(layer)) return;
    categoryNames.forEach((name) => shown.add(name));
  });
  shown.forEach((name) => {
    const style = CATEGORY_COLORS[name];
    if (!style) return; // 動的割当ての色は凡例が煩雑になるため省略
    const item = document.createElement("div");
    item.className = "legend-item";
    item.innerHTML = `<span class="legend-swatch" style="background:${style.fillColor};border-color:${style.color}"></span>${name}`;
    legend.appendChild(item);
  });
}

function makeFeatureLayer(features, def, fallbackIndex, fixedCategoryName) {
  return L.geoJSON(
    { type: "FeatureCollection", features },
    {
      renderer: sharedRenderer,
      style: (feature) => {
        const categoryName =
          fixedCategoryName ?? findCategoryName(feature.properties, def.categoryFields);
        const style = styleForCategory(def.key, categoryName, fallbackIndex);
        return {
          color: style.color,
          fillColor: style.fillColor,
          weight: def.weight ?? 1,
          dashArray: def.dashArray,
          fillOpacity: def.fillOpacity,
        };
      },
      onEachFeature: (feature, lyr) => {
        lyr.on("click", () => showInfoPanel(feature.properties));
      },
    }
  );
}

let pendingLayers = LAYER_DEFS.length;
const bounds = L.latLngBounds([]);
let layersControl = null;

function registerOverlay(label, layer, categoryNames, defaultOn) {
  overlayRegistry.set(label, { layer, categoryNames });
  if (defaultOn) {
    layer.addTo(map);
    bounds.extend(layer.getBounds());
  }
}

LAYER_DEFS.forEach((def, defIndex) => {
  fetch(`data/${def.file}`)
    .then((res) => {
      if (!res.ok) throw new Error(`${def.file} が見つかりません（${res.status}）`);
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
            registerOverlay(`${def.label}：${categoryName}`, layer, new Set([categoryName]), def.defaultOn);
            return { categoryName, layer };
          });
      } else {
        const usedCategories = new Set();
        const layer = L.geoJSON(geojson, {
          renderer: sharedRenderer,
          style: (feature) => {
            const categoryName = findCategoryName(feature.properties, def.categoryFields);
            if (categoryName) usedCategories.add(categoryName);
            const style = styleForCategory(def.key, categoryName, defIndex);
            return {
              color: style.color,
              fillColor: style.fillColor,
              weight: def.weight ?? 1,
              dashArray: def.dashArray,
              fillOpacity: def.fillOpacity,
            };
          },
          onEachFeature: (feature, lyr) => {
            lyr.on("click", () => showInfoPanel(feature.properties));
          },
        });
        def._layer = layer;
        registerOverlay(def.label, layer, usedCategories, def.defaultOn);
      }
      renderLegend();
    })
    .catch((err) => {
      console.warn(`[レイヤー未配置] ${def.label}: ${err.message}`);
    })
    .finally(() => {
      pendingLayers -= 1;
      if (pendingLayers === 0) {
        if (bounds.isValid()) map.fitBounds(bounds);
        layersControl = L.control
          .layers(baseLayers, null, { collapsed: false, position: "topleft" })
          .addTo(map);
        new LayerPanelControl({ position: "topleft" }).addTo(map);
        setUpGoogleMapsBaseLayer();
      }
    });
});

// レイヤー一覧パネル。用途地域のように splitByCategory: true のレイヤーは、
// グループ見出し（一括ON/OFF＋展開/折りたたみ）と、種別ごとの個別チェックボックスを表示する。
const LayerPanelControl = L.Control.extend({
  onAdd() {
    const container = L.DomUtil.create("div", "layer-panel");
    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.disableScrollPropagation(container);
    LAYER_DEFS.forEach((def) => {
      if (def.splitByCategory && def._subLayers) {
        container.appendChild(buildGroupRow(def));
      } else if (def._layer) {
        container.appendChild(buildSimpleRow(def.label, def._layer));
      }
    });
    return container;
  },
});

function buildSimpleRow(label, layer) {
  const row = document.createElement("label");
  row.className = "layer-row";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = map.hasLayer(layer);
  checkbox.addEventListener("change", () => {
    if (checkbox.checked) layer.addTo(map);
    else layer.remove();
    renderLegend();
  });
  row.appendChild(checkbox);
  row.appendChild(document.createTextNode(label));
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

  const childEntries = def._subLayers.map(({ categoryName, layer }) => {
    const row = document.createElement("label");
    row.className = "layer-row";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = map.hasLayer(layer);
    cb.addEventListener("change", () => {
      if (cb.checked) layer.addTo(map);
      else layer.remove();
      updateMasterState();
      renderLegend();
    });
    row.appendChild(cb);
    row.appendChild(document.createTextNode(categoryName));
    childrenContainer.appendChild(row);
    return { cb, layer };
  });

  function updateMasterState() {
    const onCount = childEntries.filter(({ layer }) => map.hasLayer(layer)).length;
    masterCheckbox.checked = onCount === childEntries.length;
    masterCheckbox.indeterminate = onCount > 0 && onCount < childEntries.length;
  }
  updateMasterState();

  masterCheckbox.addEventListener("change", () => {
    const turnOn = masterCheckbox.checked;
    childEntries.forEach(({ cb, layer }) => {
      cb.checked = turnOn;
      if (turnOn) layer.addTo(map);
      else layer.remove();
    });
    masterCheckbox.indeterminate = false;
    renderLegend();
  });

  arrow.addEventListener("click", () => {
    const collapsed = childrenContainer.classList.toggle("collapsed");
    arrow.textContent = collapsed ? "▶" : "▼";
  });

  wrapper.appendChild(header);
  wrapper.appendChild(childrenContainer);
  return wrapper;
}

// GOOGLE_MAPS_API_KEY が設定されている場合のみ、Googleマップをベースレイヤーの
// 選択肢に追加する（leaflet.gridlayer.googlemutant プラグインを使用）。
function setUpGoogleMapsBaseLayer() {
  if (!GOOGLE_MAPS_API_KEY) return;
  const script = document.createElement("script");
  script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}`;
  script.async = true;
  script.onload = () => {
    const googleLayer = L.gridLayer.googleMutant({ type: "roadmap" });
    layersControl.addBaseLayer(googleLayer, "Googleマップ");
  };
  script.onerror = () => {
    console.warn("Google Maps APIの読み込みに失敗しました。APIキーを確認してください。");
  };
  document.head.appendChild(script);
}
