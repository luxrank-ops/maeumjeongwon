'use strict';

function createStore() {
  const users = new Map();
  const processedEvents = new Set();

  function user(uid) {
    if (!users.has(uid)) {
      users.set(uid, {
        uid,
        plus: { status: 'none', plan: null, expiresAt: 0 },
        adLog: {},
        adUnlocks: {}
      });
    }
    return users.get(uid);
  }

  function setPlus(uid, plusData) {
    const u = user(uid);
    u.plus = Object.assign({}, u.plus, plusData);
    return u.plus;
  }

  function incAdLog(uid, day) {
    const u = user(uid);
    u.adLog[day] = (u.adLog[day] || 0) + 1;
    return u.adLog[day];
  }

  function setAdUnlock(uid, storyId, until) {
    const u = user(uid);
    u.adUnlocks[storyId] = until;
    return until;
  }

  function hasProcessed(eventId) {
    return processedEvents.has(eventId);
  }

  function markProcessed(eventId) {
    processedEvents.add(eventId);
  }

  function clear() {
    users.clear();
    processedEvents.clear();
  }

  return {
    user,
    setPlus,
    incAdLog,
    setAdUnlock,
    hasProcessed,
    markProcessed,
    clear
  };
}

module.exports = { createStore };
