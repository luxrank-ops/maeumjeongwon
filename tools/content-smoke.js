'use strict';

const { listTemples } = require('../server/content/temples');
const { listStories } = require('../server/content/stories');

const temples = listTemples();
const stories = listStories();
const templeIds = new Set(temples.map(temple => temple.id));
const checks = [];

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isHttpUrl(value) {
  if (!nonEmpty(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch (_) {
    return false;
  }
}

function check(condition, message) {
  checks.push({ passed: Boolean(condition), message });
}

const uniqueStoryIds = new Set(stories.map(story => story.id)).size === stories.length;
check(uniqueStoryIds, `story IDs are unique (${stories.length} stories)`);

const storiesValid = stories.length > 0 && stories.every(story =>
  nonEmpty(story.id) &&
  nonEmpty(story.tid) && templeIds.has(story.tid) &&
  nonEmpty(story.title) &&
  nonEmpty(story.hook) &&
  Array.isArray(story.chapters) && story.chapters.length > 0 &&
  story.chapters.every(chapter =>
    nonEmpty(chapter.h) &&
    Array.isArray(chapter.body) && chapter.body.length > 0 &&
    chapter.body.every(nonEmpty)
  ) &&
  Array.isArray(story.sources) && story.sources.length > 0 &&
  story.sources.every(source => nonEmpty(source.t) && isHttpUrl(source.u))
);
check(storiesValid, 'stories reference curated temples and have complete chapters and source links');

const legendsValid = temples.every(temple => {
  if (temple.legend && (!nonEmpty(temple.legend.title) || !nonEmpty(temple.legend.text))) return false;
  if (temple.legends != null && (!Array.isArray(temple.legends) || !temple.legends.every(legend =>
    nonEmpty(legend.title) && nonEmpty(legend.text)
  ))) return false;
  return true;
});
check(legendsValid, 'all legend entries have a title and story text');

const fengshuiValid = temples.every(temple => {
  if (temple.fengshui != null && (!Array.isArray(temple.fengshui) || !temple.fengshui.every(nonEmpty))) return false;
  if (temple.fengshuiAtlas != null) {
    const atlas = temple.fengshuiAtlas;
    if (!nonEmpty(atlas.region) || !nonEmpty(atlas.name) || !nonEmpty(atlas.hyeong) || !nonEmpty(atlas.story)) return false;
    if (!Array.isArray(atlas.power) || atlas.power.length === 0 || !atlas.power.every(nonEmpty)) return false;
  }
  return true;
});
check(fengshuiValid, 'fengshui explanations and atlas entries have complete text');

const prayerValid = temples.every(temple => {
  if (temple.prayer == null) return true;
  const prayer = temple.prayer;
  return nonEmpty(prayer.target) &&
    Array.isArray(prayer.why) && prayer.why.length > 0 && prayer.why.every(nonEmpty) &&
    Array.isArray(prayer.how) && prayer.how.every(nonEmpty) &&
    Array.isArray(prayer.src) && prayer.src.length > 0 &&
    prayer.src.every(source => nonEmpty(source.t) && isHttpUrl(source.u));
});
check(prayerValid, 'prayer guides have target, guidance, and valid source links');

const failed = checks.filter(result => !result.passed);
for (const result of checks) {
  console.log(`${result.passed ? 'PASS' : 'FAIL'} ${result.message}`);
}
console.log(`\nContent validation summary: ${checks.length - failed.length} passed, ${failed.length} failed`);
if (failed.length) process.exitCode = 1;
