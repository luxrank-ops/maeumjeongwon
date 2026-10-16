'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'js/app/map.js'), 'utf8');

function loadMapUi() {
  const root = {
    document: { getElementById: () => ({ innerHTML: '' }) },
    setTimeout: fn => fn()
  };
  const sandbox = { window: root, console, Map };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'js/app/map.js' });
  return root.MJ_MAP_UI;
}

function makeMap() {
  const state = { zoom: 7, events: {}, layers: [] };
  const map = {
    setView(center, zoom) { this.center = center; if (zoom) state.zoom = zoom; return this; },
    getZoom() { return state.zoom; },
    latLngToLayerPoint([lat, lng]) { return { x: lng * 10, y: lat * 10 }; },
    on(names, fn) { names.split(' ').forEach(name => { state.events[name] = fn; }); return this; },
    invalidateSize() {},
    remove() {}
  };
  const layer = {
    items: [],
    addTo() { return this; },
    clearLayers() { this.items = []; }
  };
  const L = {
    map: () => map,
    tileLayer: () => ({ addTo() {} }),
    layerGroup: () => layer,
    circleMarker: (coords, options) => ({
      type: 'circle', coords, options,
      bindPopup(html) { this.popup = html; return this; },
      addTo(target) { target.items.push(this); return this; }
    }),
    marker: (coords, options) => ({
      type: 'cluster', coords, options,
      bindPopup(html) { this.popup = html; return this; },
      addTo(target) { target.items.push(this); return this; }
    }),
    divIcon: options => options
  };
  return { L, map, layer, state };
}

const temples = [
  { id: 'a', name: '사찰 가', sido: '부산', sgg: '해운대구', lat: 35.1, lng: 129.1, lists: ['quiet'] },
  { id: 'b', name: '사찰 나', sido: '부산', sgg: '금정구', lat: 35.2, lng: 129.2, lists: ['quiet'] },
  { id: 'c', name: '사찰 다', sido: '경남', sgg: '양산시', lat: 35.3, lng: 130.0, lists: ['history'] }
];
const esc = value => String(value ?? '');

function initOptions(overrides = {}) {
  const fake = makeMap();
  return {
    ...fake,
    ui: loadMapUi(),
    options: {
      L: fake.L,
      temples,
      byId: Object.fromEntries(temples.map(t => [t.id, t])),
      visited: () => new Set(['a']),
      esc,
      isCurrent: () => true,
      ...overrides
    }
  };
}

test('지도 목록은 분류·방문 필터를 반영한다', () => {
  const ui = loadMapUi();
  const render = t => `<a>${t.name}</a>`;
  const options = { temples, visited: new Set(['a']), templeItem: render, ic: () => '지도', esc };
  const all = ui.listHTML('', options);
  const visited = ui.listHTML('visited', options);
  const quiet = ui.listHTML('quiet', options);
  assert.match(all, /3곳의 사찰/);
  assert.match(visited, /1곳을 방문했어요/);
  assert.match(visited, /사찰 가/);
  assert.doesNotMatch(visited, /사찰 나/);
  assert.match(quiet, /2곳의 사찰/);
});

test('전국 축척에서는 클러스터, 확대하면 개별 마커를 그리고 필터를 다시 적용한다', () => {
  const { ui, options, map, layer, state } = initOptions();
  const result = ui.init(options);
  assert.equal(result, map);
  assert.equal(layer.items.length, 2, '서로 다른 화면 셀은 개별 마커, 가까운 곳은 클러스터');
  assert.equal(layer.items.filter(x => x.type === 'cluster').length, 1);
  assert.match(layer.items.find(x => x.type === 'cluster').popup, /사찰 가/);

  state.zoom = 11;
  state.events.zoomend();
  assert.equal(layer.items.length, temples.length, '줌 11부터 개별 사찰 마커');
  assert.ok(layer.items.every(x => x.type === 'circle'));

  map._draw('visited');
  assert.equal(layer.items.length, 1, '방문 필터를 지도 마커에도 적용');
  assert.equal(layer.items[0].type, 'circle');
});
