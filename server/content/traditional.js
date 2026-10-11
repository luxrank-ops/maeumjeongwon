'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let cache = null;

function loadTraditionalTemples() {
  if (cache) return cache;
  const filePath = path.join(__dirname, '..', '..', 'js', 'data-traditional.js');
  const code = fs.readFileSync(filePath, 'utf-8');
  const ctx = { window: {} };
  vm.runInNewContext(code, ctx);
  const raw = ctx.window.TRADITIONAL_TEMPLES || [];
  cache = raw.map(r => ({
    no: r[0],
    sido: r[1],
    sgg: r[2],
    addr: r[3],
    name: r[4],
    order: r[5]
  }));
  return cache;
}

function listTraditional({ sido, sgg, order, q } = {}) {
  let list = loadTraditionalTemples();
  if (sido) list = list.filter(x => x.sido === sido);
  if (sgg) list = list.filter(x => x.sgg === sgg);
  if (order) list = list.filter(x => x.order === order);
  if (q) {
    const kw = String(q).trim();
    if (kw) list = list.filter(x => x.name.includes(kw) || x.addr.includes(kw) || x.sgg.includes(kw) || x.order.includes(kw));
  }
  return list;
}

function findTraditionalByNo(no) {
  const num = Number(no);
  return loadTraditionalTemples().find(x => x.no === num) || null;
}

module.exports = { loadTraditionalTemples, listTraditional, findTraditionalByNo };
