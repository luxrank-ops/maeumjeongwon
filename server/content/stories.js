'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadStories() {
  const filePath = path.join(__dirname, '..', '..', 'js', 'data-stories.js');
  const code = fs.readFileSync(filePath, 'utf-8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return {
    stories: sandbox.window.STORIES || [],
    soon: sandbox.window.STORY_SOON || []
  };
}

const { stories, soon } = loadStories();
const byId = Object.fromEntries(stories.map(s => [s.id, s]));

function listStories() {
  return stories;
}

function findStory(id) {
  return byId[id] || null;
}

function listSoon() {
  return soon;
}

module.exports = {
  listStories,
  findStory,
  listSoon
};
