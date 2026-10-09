'use strict';

let DatabaseSync = null;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch (e) {}

class Store {
  constructor(dbPath = ':memory:') {
    this.users = new Map();
    this.processedEvents = new Map();
    this.ssvTransactions = new Map();
    if (DatabaseSync) {
      this.db = new DatabaseSync(dbPath);
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS kv_tx (k TEXT PRIMARY KEY);
      `);
    } else {
      this.db = { exec: () => {} };
    }
  }

  tx(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const out = fn();
      this.db.exec('COMMIT');
      return out;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  createUser(uid, nowMs = Date.now()) {
    if (!this.users.has(uid)) {
      this.users.set(uid, {
        uid,
        createdAt: nowMs,
        plus: { plan: null, expiresAt: 0, willRenew: false, trial: false, updatedAt: nowMs },
        packs: [],
        adLog: {},
        adUnlocks: {}
      });
    }
    return this.users.get(uid);
  }

  user(uid) {
    return this.createUser(uid);
  }

  getPlus(uid) {
    return this.user(uid).plus;
  }

  setPlus(uid, plusData, nowMs = Date.now()) {
    const u = this.user(uid);
    u.plus = Object.assign({}, u.plus, plusData, { updatedAt: nowMs });
    return u.plus;
  }

  getPacks(uid) {
    return this.user(uid).packs.slice();
  }

  addPack(uid, packId) {
    const u = this.user(uid);
    if (!u.packs.includes(packId)) u.packs.push(packId);
    return u.packs.slice();
  }

  getAdLog(uid, day) {
    const u = this.user(uid);
    return u.adLog[day] || 0;
  }

  incAdLog(uid, day) {
    const u = this.user(uid);
    u.adLog[day] = (u.adLog[day] || 0) + 1;
    return u.adLog[day];
  }

  setAdUnlock(uid, storyId, until) {
    const u = this.user(uid);
    u.adUnlocks[storyId] = until;
    return until;
  }

  recordSsvTransaction(txId, uid, storyId, nowMs = Date.now()) {
    if (this.ssvTransactions.has(txId)) return false;
    this.ssvTransactions.set(txId, { uid, storyId, at: nowMs });
    return true;
  }

  hasProcessed(eventId) {
    return this.processedEvents.has(eventId);
  }

  markProcessed(eventId, nowMs = Date.now()) {
    this.processedEvents.set(eventId, nowMs);
  }

  clear() {
    this.users.clear();
    this.processedEvents.clear();
    this.ssvTransactions.clear();
  }
}

function createStore(dbPath) {
  return new Store(dbPath);
}

module.exports = { Store, createStore };
