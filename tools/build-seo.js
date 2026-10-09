'use strict';

const fs = require('fs');
const path = require('path');
const { listStories } = require('../server/content/stories');
const { publicStory } = require('../server/content/project');

const outDir = path.join(__dirname, '..', 'seo');
fs.mkdirSync(outDir, { recursive: true });

const publicStories = listStories().map(publicStory);
fs.writeFileSync(
  path.join(outDir, 'stories-public.json'),
  JSON.stringify(publicStories, null, 2),
  'utf-8'
);

console.log(`Generated SEO public story data (${publicStories.length} stories) in ${outDir}`);
