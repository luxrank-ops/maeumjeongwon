'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadTemples() {
  const root = path.join(__dirname, '..', '..', 'js');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'data-temples.js'), 'utf-8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'data-prayer.js'), 'utf-8'), sandbox);
  return sandbox.window.TEMPLES || [];
}

const temples = loadTemples();
const byId = Object.fromEntries(temples.map(t => [t.id, t]));

function listTemples() {
  return temples;
}

function findTemple(id) {
  return byId[id] || null;
}

module.exports = {
  listTemples,
  findTemple
};
