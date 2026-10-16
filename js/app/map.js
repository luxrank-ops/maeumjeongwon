/* 사찰 지도 전용 UI — 홈의 첫 화면 예산에서 빼고 지도·순례 화면에 들어갈 때만 불러온다. */
(function (root) {
  'use strict';

  function listHTML(filter, options) {
    const rows = options.temples.filter(t => !filter || (filter === 'visited'
      ? options.visited.has(t.id)
      : t.lists.includes(filter)));
    return `<p class="map-list-summary">${rows.length}곳${filter === 'visited' ? '을 방문했어요' : '의 사찰'}</p>${rows.length
      ? `<div class="tlist">${rows.map(t => options.templeItem(t, `${options.esc(t.sido)} ${options.esc(t.sgg)}`)).join('')}</div>`
      : `<div class="empty">${options.ic('map')}<b>아직 방문한 사찰이 없어요</b><p>다른 분류를 보거나 사찰을 둘러보세요.</p><a class="btn" style="text-decoration:none" href="#/explore">사찰 탐색</a></div>`}`;
  }

  function init(options) {
    const L = options.L;
    const elId = options.elId || 'map';
    if (!L) {
      root.document.getElementById(elId).innerHTML = '<p class="notice">지도를 불러오지 못했어요.</p>';
      return null;
    }
    const m = L.map(elId, { zoomControl: true }).setView([36.3, 127.9], 7);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; OpenStreetMap contributors' }).addTo(m);
    const v = options.visited();
    const layer = L.layerGroup().addTo(m);
    let active = '';
    function rowsFor(filter) {
      return options.temples.filter(t => !filter || (filter === 'visited' ? v.has(t.id) : t.lists.includes(filter)))
        .filter(t => !options.onlyVisited || v.has(t.id));
    }
    function addTemple(t) {
      const got = v.has(t.id);
      L.circleMarker([t.lat, t.lng], { radius: got ? 9 : 7, color: got ? '#4f6a33' : '#8a6b3a', fillColor: got ? '#7a8f5c' : (options.onlyVisited ? '#d9d0bf' : '#e0a77e'), fillOpacity: .9, weight: 2 })
        .bindPopup(`<b>${options.esc(t.name)}</b><br>${options.esc(t.sido)} ${options.esc(t.sgg)}<br><a href="#/temple/${encodeURIComponent(t.id)}">상세 보기 →</a>`).addTo(layer);
    }
    function draw(filter) {
      active = filter || '';
      layer.clearLayers();
      const rows = rowsFor(active);
      const zoom = typeof m.getZoom === 'function' ? m.getZoom() : 7;
      if (zoom >= 11 || typeof m.latLngToLayerPoint !== 'function' || typeof L.marker !== 'function' || typeof L.divIcon !== 'function') {
        rows.forEach(addTemple);
        return;
      }
      const buckets = new Map();
      rows.forEach(t => {
        const p = m.latLngToLayerPoint([t.lat, t.lng]);
        const key = `${Math.floor(p.x / 52)}:${Math.floor(p.y / 52)}`;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(t);
      });
      buckets.forEach(group => {
        if (group.length === 1) { addTemple(group[0]); return; }
        const lat = group.reduce((sum, t) => sum + t.lat, 0) / group.length;
        const lng = group.reduce((sum, t) => sum + t.lng, 0) / group.length;
        const links = group.slice(0, 8).map(t => `<li><a href="#/temple/${encodeURIComponent(t.id)}">${options.esc(t.name)} · ${options.esc(t.sido)} ${options.esc(t.sgg)}</a></li>`).join('');
        const more = group.length > 8 ? `<li class="sub">외 ${group.length - 8}곳</li>` : '';
        L.marker([lat, lng], { icon: L.divIcon({ className: 'temple-cluster', html: `<span role="img" aria-label="사찰 ${group.length}곳">${group.length}</span>`, iconSize: [42, 42], iconAnchor: [21, 21] }) })
          .bindPopup(`<b>가까운 사찰 ${group.length}곳</b><ul class="cluster-list">${links}${more}</ul>`).addTo(layer);
      });
    }
    if (options.focusId && options.byId[options.focusId]) {
      const t = options.byId[options.focusId];
      m.setView([t.lat, t.lng], 13);
    }
    draw('');
    if (typeof m.on === 'function') m.on('zoomend moveend', () => draw(active));
    m._draw = draw;
    root.setTimeout(() => m.invalidateSize(), 50);
    root.setTimeout(() => { if (options.isCurrent(m)) m.invalidateSize({ animate: false }); }, 380);
    return m;
  }

  root.MJ_MAP_UI = { listHTML, init };
})(window);
