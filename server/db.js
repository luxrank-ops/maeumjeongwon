'use strict';

// 회원·게시판 저장소 (SQLite, Node 내장 node:sqlite).
// 왜 파일인가: 계정과 글은 서버를 재시작해도 남아야 한다. 기존 store.js 의 메모리 맵(플러스·광고 상태)과 달리
// 이 데이터는 사용자가 직접 만든 것이라 잃으면 안 된다.
//
// 경로: 환경변수 MJ_DB_PATH, 없으면 저장소 루트의 data/maeumjeongwon.sqlite (git 무시 대상).
// 운영에서는 이 파일이 있는 디스크를 영속 볼륨으로 잡아야 한다 (컨테이너 임시 디스크면 재배포 때 사라진다).

const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_PATH = process.env.VERCEL ? '/tmp/maeumjeongwon.sqlite' : path.join(__dirname, '..', 'data', 'maeumjeongwon.sqlite');
const TMP_FALLBACK_PATH = path.join(os.tmpdir(), 'maeumjeongwon', 'maeumjeongwon.sqlite');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  uid         TEXT PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  nickname    TEXT NOT NULL,
  nick_key    TEXT NOT NULL UNIQUE,
  password    TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT PRIMARY KEY,
  uid         TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_uid ON sessions(uid);
CREATE TABLE IF NOT EXISTS posts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  author_uid  TEXT NOT NULL,
  category    TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  views       INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS posts_recent ON posts(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS posts_author ON posts(author_uid);
CREATE TABLE IF NOT EXISTS comments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id     INTEGER NOT NULL,
  author_uid  TEXT NOT NULL,
  body        TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS comments_post ON comments(post_id, id);
CREATE INDEX IF NOT EXISTS comments_author ON comments(author_uid);
`;

function loadSqlite() {
  try {
    return require('node:sqlite').DatabaseSync;
  } catch (e) {
    throw new Error('회원·게시판 저장에는 Node.js 22.13 이상(node:sqlite)이 필요해요.');
  }
}

// file === ':memory:' 이면 테스트용 임시 DB. 그 밖에는 상위 폴더를 만들고 연다.
// Vercel 등 읽기 전용 서버리스 파일시스템(EROFS/EACCES)에서는 os.tmpdir()(/tmp)로 자동 폴백한다.
function openDatabase(file) {
  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  let target = file || process.env.MJ_DB_PATH || (isServerless ? TMP_FALLBACK_PATH : DEFAULT_PATH);
  const DatabaseSync = loadSqlite();
  let db;
  if (target !== ':memory:') {
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      db = new DatabaseSync(target);
    } catch (err) {
      if (!file && !process.env.MJ_DB_PATH && target !== TMP_FALLBACK_PATH) {
        target = TMP_FALLBACK_PATH;
        fs.mkdirSync(path.dirname(target), { recursive: true });
        db = new DatabaseSync(target);
      } else {
        throw err;
      }
    }
  } else {
    db = new DatabaseSync(target);
  }
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
  if (target !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  return db;
}

// 지연 열기: 회원·게시판 요청이 한 번도 없으면 파일을 만들지 않는다 (테스트·정적 서빙에서 불필요한 파일 방지).
function lazyDatabase(file) {
  let db = null;
  return function get() {
    if (!db) db = openDatabase(file);
    return db;
  };
}

module.exports = { openDatabase, lazyDatabase, DEFAULT_PATH, SCHEMA };

