'use strict';

// 회원 소통 게시판 — 글(카테고리·제목·본문)과 댓글.
//
// 권한 규칙
//  - 읽기: 누구나 (로그인하지 않아도 볼 수 있다)
//  - 쓰기(글·댓글): 회원만. 익명 세션으로는 쓸 수 없다 (호출부가 req.memberUid 로 판단)
//  - 수정·삭제: 작성자 본인만. 다른 사람 글은 403
//  - 본문은 저장할 때 HTML 로 해석하지 않는다 — 화면에서 항상 이스케이프해서 그린다.
//
// 아직 없는 것: 신고·운영자 삭제·욕설 필터. 글이 쌓이기 전에 운영 규칙과 함께 붙이는 것을 권장한다.

const CATEGORIES = [
  { id: 'free', label: '자유 이야기', hint: '일상과 마음 이야기' },
  { id: 'visit', label: '순례 후기', hint: '다녀온 사찰의 기억' },
  { id: 'question', label: '질문·답변', hint: '궁금한 점을 물어보세요' }
];
const CAT_IDS = new Set(CATEGORIES.map(c => c.id));
const CAT_LABEL = Object.fromEntries(CATEGORIES.map(c => [c.id, c.label]));

const PAGE_SIZE = 20;
const TITLE_MAX = 80;
const BODY_MAX = 2000;
const COMMENT_MAX = 300;
const PREVIEW_LEN = 90;
const SEARCH_MAX = 40;

function clean(v) {
  return String(v == null ? '' : v).normalize('NFC').replace(/\r\n?/g, '\n').trim();
}

function validatePost(raw) {
  const category = String(raw.category || '');
  if (!CAT_IDS.has(category)) return { ok: false, field: 'category', message: '글 종류를 골라 주세요.' };
  const title = clean(raw.title).replace(/\s*\n\s*/g, ' ');
  if (!title) return { ok: false, field: 'title', message: '제목을 적어 주세요.' };
  if (title.length > TITLE_MAX) return { ok: false, field: 'title', message: `제목은 ${TITLE_MAX}자 이내로 적어 주세요.` };
  const body = clean(raw.body);
  if (!body) return { ok: false, field: 'body', message: '내용을 적어 주세요.' };
  if (body.length > BODY_MAX) return { ok: false, field: 'body', message: `내용은 ${BODY_MAX}자 이내로 적어 주세요.` };
  return { ok: true, value: { category, title, body } };
}

function validateComment(raw) {
  const body = clean(raw.body);
  if (!body) return { ok: false, field: 'body', message: '댓글 내용을 적어 주세요.' };
  if (body.length > COMMENT_MAX) return { ok: false, field: 'body', message: `댓글은 ${COMMENT_MAX}자 이내로 적어 주세요.` };
  return { ok: true, value: { body } };
}

function parsePage(v) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 100000) : 1;
}

function createBoard({ getDb, now = () => Date.now() }) {
  const db = () => getDb();

  function tx(fn) {
    const d = db();
    d.exec('BEGIN IMMEDIATE');
    try {
      const out = fn(d);
      d.exec('COMMIT');
      return out;
    } catch (e) {
      d.exec('ROLLBACK');
      throw e;
    }
  }

  function mapPost(row, viewer, { full = false } = {}) {
    const out = {
      id: row.id,
      category: row.category,
      categoryLabel: CAT_LABEL[row.category] || row.category,
      title: row.title,
      nickname: row.nickname || '탈퇴한 회원',
      views: row.views,
      commentCount: row.comment_count || 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      edited: row.updated_at > row.created_at,
      mine: !!viewer && row.author_uid === viewer
    };
    if (full) out.body = row.body;
    else out.preview = row.preview;
    return out;
  }

  // 목록: 카테고리 · 검색어(제목·본문) · 내 글만 · 쪽 번호. 최신순.
  function list({ category, q, page, mine, viewer }) {
    const where = [];
    const args = [];
    if (category && category !== 'all') {
      if (!CAT_IDS.has(category)) return { status: 400, body: { error: 'validation', message: '없는 글 종류예요.' } };
      where.push('p.category = ?');
      args.push(category);
    }
    if (mine) {
      if (!viewer) return { status: 401, body: { error: 'login_required', message: '로그인하면 내 글을 볼 수 있어요.' } };
      where.push('p.author_uid = ?');
      args.push(viewer);
    }
    const term = clean(q).slice(0, SEARCH_MAX);
    if (term) {
      const like = '%' + term.replace(/[\\%_]/g, m => '\\' + m) + '%';
      where.push("(p.title LIKE ? ESCAPE '\\' OR p.body LIKE ? ESCAPE '\\')");
      args.push(like, like);
    }
    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const total = db().prepare(`SELECT COUNT(*) AS n FROM posts p ${w}`).get(...args).n;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const p = Math.min(parsePage(page), pages);
    const rows = db().prepare(`
      SELECT p.id, p.author_uid, p.category, p.title, substr(p.body, 1, ${PREVIEW_LEN}) AS preview,
             p.views, p.created_at, p.updated_at, u.nickname,
             (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count
      FROM posts p LEFT JOIN users u ON u.uid = p.author_uid
      ${w}
      ORDER BY p.created_at DESC, p.id DESC
      LIMIT ? OFFSET ?`).all(...args, PAGE_SIZE, (p - 1) * PAGE_SIZE);
    return {
      status: 200,
      body: {
        items: rows.map(r => mapPost(r, viewer)),
        total,
        page: p,
        pageSize: PAGE_SIZE,
        pages
      }
    };
  }

  function findPost(id) {
    return db().prepare(`
      SELECT p.*, u.nickname,
             (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count
      FROM posts p LEFT JOIN users u ON u.uid = p.author_uid
      WHERE p.id = ?`).get(id) || null;
  }

  // 상세: 조회수는 작성자가 아닌 사람이 볼 때만 올린다.
  function get(id, viewer) {
    const row = findPost(id);
    if (!row) return { status: 404, body: { error: 'not_found' } };
    if (row.author_uid !== viewer) {
      db().prepare('UPDATE posts SET views = views + 1 WHERE id = ?').run(id);
      row.views += 1;
    }
    return { status: 200, body: mapPost(row, viewer, { full: true }) };
  }

  function create(uid, raw) {
    const v = validatePost(raw || {});
    if (!v.ok) return { status: 400, body: { error: 'validation', field: v.field, message: v.message } };
    const t = now();
    const info = db().prepare('INSERT INTO posts (author_uid, category, title, body, views, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)')
      .run(uid, v.value.category, v.value.title, v.value.body, t, t);
    return { status: 201, body: { id: Number(info.lastInsertRowid) } };
  }

  function update(id, uid, raw) {
    const row = findPost(id);
    if (!row) return { status: 404, body: { error: 'not_found' } };
    if (row.author_uid !== uid) return { status: 403, body: { error: 'forbidden', message: '작성자만 고칠 수 있어요.' } };
    const v = validatePost(raw || {});
    if (!v.ok) return { status: 400, body: { error: 'validation', field: v.field, message: v.message } };
    db().prepare('UPDATE posts SET category = ?, title = ?, body = ?, updated_at = ? WHERE id = ?')
      .run(v.value.category, v.value.title, v.value.body, Math.max(now(), row.created_at), id);
    return { status: 200, body: { id } };
  }

  function remove(id, uid) {
    const row = findPost(id);
    if (!row) return { status: 404, body: { error: 'not_found' } };
    if (row.author_uid !== uid) return { status: 403, body: { error: 'forbidden', message: '작성자만 지울 수 있어요.' } };
    tx(d => {
      d.prepare('DELETE FROM comments WHERE post_id = ?').run(id);
      d.prepare('DELETE FROM posts WHERE id = ?').run(id);
    });
    return { status: 200, body: { ok: true } };
  }

  function listComments(postId, viewer) {
    if (!findPost(postId)) return { status: 404, body: { error: 'not_found' } };
    const rows = db().prepare(`
      SELECT c.id, c.author_uid, c.body, c.created_at, u.nickname
      FROM comments c LEFT JOIN users u ON u.uid = c.author_uid
      WHERE c.post_id = ? ORDER BY c.id ASC`).all(postId);
    return {
      status: 200,
      body: {
        items: rows.map(r => ({
          id: r.id,
          body: r.body,
          nickname: r.nickname || '탈퇴한 회원',
          createdAt: r.created_at,
          mine: !!viewer && r.author_uid === viewer
        }))
      }
    };
  }

  function addComment(postId, uid, raw) {
    if (!findPost(postId)) return { status: 404, body: { error: 'not_found' } };
    const v = validateComment(raw || {});
    if (!v.ok) return { status: 400, body: { error: 'validation', field: v.field, message: v.message } };
    const info = db().prepare('INSERT INTO comments (post_id, author_uid, body, created_at) VALUES (?, ?, ?, ?)')
      .run(postId, uid, v.value.body, now());
    return { status: 201, body: { id: Number(info.lastInsertRowid) } };
  }

  function removeComment(commentId, uid) {
    const row = db().prepare('SELECT id, author_uid FROM comments WHERE id = ?').get(commentId);
    if (!row) return { status: 404, body: { error: 'not_found' } };
    if (row.author_uid !== uid) return { status: 403, body: { error: 'forbidden', message: '작성자만 지울 수 있어요.' } };
    db().prepare('DELETE FROM comments WHERE id = ?').run(commentId);
    return { status: 200, body: { ok: true } };
  }

  // 내 활동 요약 (프로필 화면)
  function counts(uid) {
    const posts = db().prepare('SELECT COUNT(*) AS n FROM posts WHERE author_uid = ?').get(uid).n;
    const comments = db().prepare('SELECT COUNT(*) AS n FROM comments WHERE author_uid = ?').get(uid).n;
    return { posts, comments };
  }

  return { list, get, create, update, remove, listComments, addComment, removeComment, counts };
}

module.exports = {
  createBoard,
  validatePost,
  validateComment,
  CATEGORIES,
  PAGE_SIZE,
  TITLE_MAX,
  BODY_MAX,
  COMMENT_MAX
};
