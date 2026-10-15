// 일회성 구조 감사 도구 — app.js 섹션별 외부 참조(결합도)를 계산한다.
const fs = require('fs');
const path = require('path');

function audit(file) {
  const src = fs.readFileSync(file, 'utf8').split('\n');
  const syms = [];
  src.forEach((l, i) => {
    const m = /^\s{2}(?:async )?function ([A-Za-z_$][\w$]*)|^\s{2}(?:const|let|var) ([A-Za-z_$][\w$]*)/.exec(l);
    if (m) syms.push({ n: m[1] || m[2], line: i + 1 });
  });
  const secs = [];
  src.forEach((l, i) => {
    const m = /^\s{2}\/\/ -{5,} (.*?) -{5,}/.exec(l);
    if (m) secs.push({ name: m[1], start: i + 1 });
  });
  secs.unshift({ name: '(도입부: 데이터·상태)', start: 1 });
  secs.push({ name: 'END', start: src.length + 1 });

  const ALL = new Set(syms.map(s => s.n));
  const defLine = {};
  syms.forEach(s => { if (defLine[s.n] == null) defLine[s.n] = s.line; });

  const rows = [];
  for (let k = 0; k < secs.length - 1; k++) {
    const a = secs[k].start, b = secs[k + 1].start;
    const own = new Set(), used = new Set();
    for (let i = a; i < b; i++) {
      const line = src[i - 1];
      const m = /^\s{2}(?:async )?function ([A-Za-z_$][\w$]*)|^\s{2}(?:const|let|var) ([A-Za-z_$][\w$]*)/.exec(line);
      if (m) own.add(m[1] || m[2]);
      (line.match(/[A-Za-z_$][\w$]*/g) || []).forEach(id => used.add(id));
    }
    const deps = [];
    for (const u of used) {
      if (own.has(u)) continue;
      if (!ALL.has(u)) continue;
      const d = defLine[u];
      if (d >= a && d < b) continue;
      deps.push(u);
    }
    rows.push({ sec: secs[k].name, a, b, len: b - a, deps: deps.sort() });
  }
  return { src, rows };
}

const file = process.argv[2] || 'js/app.js';
const { src, rows } = audit(file);
console.log(`# ${file} — 총 ${src.length}줄\n`);
console.log('| 섹션 | 줄 범위 | 길이 | 외부 참조 수 |');
console.log('| --- | --- | --- | --- |');
for (const r of rows) {
  if (r.len < 8) continue;
  console.log(`| ${r.sec} | ${r.a}–${r.b - 1} | ${r.len} | ${r.deps.length} |`);
}
console.log('\n## 섹션별 상세\n');
for (const r of rows) {
  if (r.len < 8) continue;
  console.log(`### ${r.sec}  (${r.a}–${r.b - 1}, ${r.len}줄)`);
  console.log(r.deps.length ? r.deps.join(', ') : '  (없음 — 완전 독립)');
  console.log('');
}
