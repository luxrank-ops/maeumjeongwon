/* 절로가 회원 · 소통 게시판 — 가입·로그인 화면과 회원 게시판 (지연 로딩 모듈)
 *
 * 왜 따로 두나: 회원 기능은 첫 화면에서 쓰지 않는다. 상단의 로그인 칩만 첫 화면에 있고,
 * #/account · #/board 화면에 들어갈 때만 이 파일을 받는다 (js/lib/loader.js 의 NEEDS).
 *
 * 계약(셸 ↔ 모듈)
 *   MJ_COMMUNITY_FACTORY(ctx) → { view(r, a, b), enter(r, a, b), reset() }
 *   ctx: api(path, opts) → {ok, status, body} · esc · toast · repaint() · goto(hash) · ic(name) ·
 *        getMember() → 회원 정보 | null · applySession(next | null) → Promise · refreshMember() → Promise
 *
 * 상태 관리
 *   · enter() 는 화면이 '바뀌었을 때' 데이터를 받는다. view() 는 가진 상태만 그린다.
 *   · 폼에서 오류가 나도 화면 전체를 다시 쓰지 않고 오류 문구만 바꾼다 — 쓰던 글이 지워지지 않게.
 *   · 모든 사용자 입력(닉네임·제목·본문·댓글)은 esc() 로 이스케이프해서 그린다.
 */
(function (root) {
  'use strict';

  // 글 종류 — 서버(server/board.js)의 CATEGORIES 와 같은 id 를 써야 한다
  const CATS = {
    free: { label: '자유 이야기', hint: '일상과 마음 이야기' },
    visit: { label: '순례 후기', hint: '다녀온 사찰의 기억' },
    question: { label: '질문·답변', hint: '궁금한 점을 물어보세요' }
  };
  const BODY_MAX = 2000;
  const COMMENT_MAX = 300;
  const RULES = '서로를 존중하는 말을 써 주세요. 연락처·주소 같은 개인정보는 올리지 마세요. 신고·운영 기능은 아직 준비 중이에요.';

  function createCommunity(ctx) {
    const { api: rawApi, esc, toast, repaint, goto, ic, getMember, applySession, refreshMember } = ctx;

    const st = {
      enteredKey: '',                                   // 마지막으로 데이터를 받은 해시 (같은 화면을 다시 그릴 때 재요청 방지)
      filter: { cat: 'all', q: '', page: 1, mine: false },
      list: null,                                       // 서버 목록 응답
      listError: '',
      listSeq: 0,
      post: { id: 0, data: null, comments: null, error: '' },
      postSeq: 0,
      returnTo: '#/board'                               // 로그인 뒤 돌아갈 곳
    };

    // fetch 가 끊기면 예외가 나므로, 화면이 깨지지 않게 실패를 응답 모양으로 바꾼다
    async function api(path, opts) {
      try {
        return await rawApi(path, opts);
      } catch (e) {
        return { ok: false, status: 0, body: { message: '연결이 잠깐 끊겼어요. 다시 시도해 주세요.' } };
      }
    }

    const isMember = () => !!getMember();
    const idOf = v => (/^\d{1,12}$/.test(String(v || '')) ? Number(v) : 0);
    const p2 = n => String(n).padStart(2, '0');
    const fmtDay = ms => { const d = new Date(ms); return `${d.getFullYear()}.${p2(d.getMonth() + 1)}.${p2(d.getDate())}`; };
    const fmtWhen = ms => { const d = new Date(ms); return `${fmtDay(ms)} ${p2(d.getHours())}:${p2(d.getMinutes())}`; };

    // ---------- 데이터 ----------

    function listPath() {
      const f = st.filter;
      const qs = new URLSearchParams();
      if (f.cat !== 'all') qs.set('category', f.cat);
      if (f.q) qs.set('q', f.q);
      if (f.page > 1) qs.set('page', String(f.page));
      if (f.mine) qs.set('mine', '1');
      const s = qs.toString();
      return '/api/board/posts' + (s ? '?' + s : '');
    }

    // 이벤트에서 부르는 형태: 상태를 바꾸고 바로 '로딩' 화면을 그린 뒤 받는다
    function refetchList() {
      const p = fetchList();
      repaint();
      return p;
    }

    async function fetchList() {
      const seq = ++st.listSeq;
      st.list = null;                                   // 호출한 쪽이 화면을 다시 그린다 (로딩 표시 포함)
      st.listError = '';
      const r = await api(listPath());
      if (seq !== st.listSeq) return;                   // 더 최근 요청이 있으면 버린다
      if (r.ok) st.list = r.body;
      else st.listError = (r.body && r.body.message) || '목록을 불러오지 못했어요.';
      repaint();
    }

    async function fetchPost(id) {
      const seq = ++st.postSeq;
      st.post = { id, data: null, comments: null, error: '' };
      const [p, c] = await Promise.all([api(`/api/board/posts/${id}`), api(`/api/board/posts/${id}/comments`)]);
      if (seq !== st.postSeq) return;
      if (!p.ok) {
        st.post = { id, data: null, comments: null, error: p.status === 404 ? 'notfound' : ((p.body && p.body.message) || '글을 불러오지 못했어요.') };
      } else {
        st.post = { id, data: p.body, comments: c.ok ? c.body.items : [], error: '' };
      }
      repaint();
    }

    // 댓글만 다시 받는다 — 조회수를 또 올리지 않으려고 글 상세는 다시 받지 않는다
    async function loadComments(id) {
      const c = await api(`/api/board/posts/${id}/comments`);
      if (st.post.id !== id || !st.post.data) return;
      if (c.ok) {
        st.post.comments = c.body.items;
        st.post.data.commentCount = c.body.items.length;
      }
      repaint();
    }

    // 화면에 들어왔을 때 필요한 데이터를 받는다. 같은 해시면 다시 받지 않는다.
    function enter(r, a, b) {
      const key = location.hash;
      if (key === st.enteredKey) return;
      st.enteredKey = key;
      if (r === 'account' || a === 'write') return;
      const id = idOf(a);
      if (id) {
        if (b === 'edit' && st.post.id === id && st.post.data && !st.post.error) return;
        fetchPost(id);
        return;
      }
      if (st.filter.mine && !isMember()) st.filter.mine = false;   // 로그아웃 뒤에는 '내 글만'을 끈다
      fetchList();
    }

    function reset() {
      st.enteredKey = '';
    }

    // ---------- 화면 ----------

    function view(r, a, b) {
      if (r === 'account') {
        if (a === 'signup') return signupView();
        return isMember() ? profileView() : loginView();
      }
      if (a === 'write') return isMember() ? writeView(0) : gateView('글을 쓰려면 로그인해 주세요.', '#/board/write');
      const id = idOf(a);
      if (id && b === 'edit') return isMember() ? writeView(id) : gateView('글을 고치려면 로그인해 주세요.', `#/board/${id}`);
      if (id) return detailView(id);
      return listView();
    }

    function loading(text) {
      return `<p class="notice cm-loading" role="status">${esc(text || '불러오고 있어요…')}</p>`;
    }

    function tabs(active) {
      return `<nav class="seg cm-tabs" aria-label="회원 메뉴">
        <a href="#/account/login" class="${active === 'login' ? 'on' : ''}" ${active === 'login' ? 'aria-current="page"' : ''}>로그인</a>
        <a href="#/account/signup" class="${active === 'signup' ? 'on' : ''}" ${active === 'signup' ? 'aria-current="page"' : ''}>회원가입</a>
      </nav>`;
    }

    function gateView(message, next) {
      return `<section class="cm-page">
        <h1>회원 전용</h1>
        <div class="empty">${ic('lock')}<b>${esc(message)}</b><p>가입은 이메일·비밀번호·닉네임만 있으면 돼요.</p>
          <div class="btn-group"><a class="btn" href="#/account/login" data-cm="login-next" data-next="${esc(next)}">로그인</a><a class="btn ghost" href="#/account/signup" data-cm="login-next" data-next="${esc(next)}">회원가입</a></div>
        </div>
      </section>`;
    }

    function loginView() {
      return `<section class="cm-page">
        ${tabs('login')}
        <h1>로그인</h1>
        <p class="sub">가입한 이메일과 비밀번호로 들어오세요. 글쓰기와 댓글은 회원만 할 수 있어요.</p>
        <form class="card cm-form" data-cm-form="login" novalidate>
          <label for="cm-l-email">이메일</label>
          <input id="cm-l-email" name="email" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" maxlength="254" required>
          <label for="cm-l-pw">비밀번호</label>
          <input id="cm-l-pw" name="password" type="password" autocomplete="current-password" maxlength="100" required>
          <p class="cm-error" role="alert"></p>
          <button class="btn block" type="submit">로그인</button>
        </form>
        <p class="sub cm-center">아직 회원이 아니신가요? <a href="#/account/signup">회원가입</a></p>
      </section>`;
    }

    function signupView() {
      return `<section class="cm-page">
        ${tabs('signup')}
        <h1>회원가입</h1>
        <p class="sub">이메일·닉네임·비밀번호만 있으면 돼요. 가입하면 바로 로그인돼요.</p>
        <form class="card cm-form" data-cm-form="signup" novalidate>
          <label for="cm-s-email">이메일</label>
          <input id="cm-s-email" name="email" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" maxlength="254" required>
          <label for="cm-s-nick">닉네임</label>
          <input id="cm-s-nick" name="nickname" autocomplete="nickname" maxlength="12" required>
          <p class="sub cm-hint">한글·영문·숫자·밑줄(_)로 2~12자. 다른 회원과 겹칠 수 없어요.</p>
          <label for="cm-s-pw">비밀번호</label>
          <input id="cm-s-pw" name="password" type="password" autocomplete="new-password" maxlength="100" required>
          <p class="sub cm-hint">8자 이상, 영문과 숫자를 함께 써 주세요.</p>
          <label for="cm-s-pw2">비밀번호 확인</label>
          <input id="cm-s-pw2" name="password2" type="password" autocomplete="new-password" maxlength="100" required>
          <label class="cm-agree"><input type="checkbox" name="agree"> <span>회원 게시판 규칙(서로 존중하기 · 개인정보 올리지 않기)에 동의해요</span></label>
          <p class="cm-error" role="alert"></p>
          <button class="btn block" type="submit">가입하고 시작하기</button>
        </form>
        <p class="sub cm-center">이미 회원이신가요? <a href="#/account/login">로그인</a></p>
      </section>`;
    }

    function profileView() {
      const m = getMember();
      return `<section class="cm-page">
        <h1>내 정보</h1>
        <div class="card cm-profile">
          <div class="row between">
            <b class="cm-nick">${esc(m.nickname)}</b>
            <span class="tag ok">회원</span>
          </div>
          <p class="sub">${esc(m.email)}<br>${fmtDay(m.createdAt)} 가입</p>
          <div class="cm-stats">
            <div><b>${Number(m.posts) || 0}</b><span>쓴 글</span></div>
            <div><b>${Number(m.comments) || 0}</b><span>댓글</span></div>
          </div>
          <div class="btn-group">
            <button class="btn small" type="button" data-cm="mine">${ic('list')} 내가 쓴 글 보기</button>
            <a class="btn ghost small" href="#/board/write">${ic('pencil')} 글쓰기</a>
          </div>
        </div>
        <p class="notice">순례 기록(방문·수첩·염주)은 지금처럼 이 기기에 남아 있어요. 계정끼리 기록을 맞춰 보는 기능은 다음 단계에서 준비할게요.</p>
        <button class="btn ghost block" type="button" data-cm="logout">로그아웃</button>
      </section>`;
    }

    function postRow(p) {
      return `<li><a class="cm-row" href="#/board/${p.id}">
        <span class="cm-row-top"><span class="tag">${esc(p.categoryLabel)}</span>${p.mine ? '<span class="tag ok">내 글</span>' : ''}</span>
        <b class="cm-row-title">${esc(p.title)}</b>
        <span class="cm-row-preview">${esc(p.preview || '')}</span>
        <span class="cm-row-meta">${esc(p.nickname)} · ${fmtDay(p.createdAt)} · 댓글 ${p.commentCount} · 조회 ${p.views}</span>
      </a></li>`;
    }

    function pager(L) {
      if (!L || L.pages <= 1) return '';
      return `<nav class="cm-pager" aria-label="쪽 이동">
        <button type="button" class="btn ghost small" data-cm="page" data-p="${L.page - 1}" ${L.page <= 1 ? 'disabled' : ''}>이전</button>
        <span>${L.page} / ${L.pages}쪽</span>
        <button type="button" class="btn ghost small" data-cm="page" data-p="${L.page + 1}" ${L.page >= L.pages ? 'disabled' : ''}>다음</button>
      </nav>`;
    }

    function listView() {
      const f = st.filter;
      const member = isMember();
      const L = st.list;
      let body;
      if (st.listError) body = `<p class="notice" role="alert">${esc(st.listError)}</p>`;
      else if (!L) body = loading('글을 불러오고 있어요…');
      else if (!L.items.length) {
        const filtered = f.q || f.cat !== 'all' || f.mine;
        body = `<div class="empty">${ic('chat')}<b>${filtered ? '찾는 글이 없어요' : '아직 글이 없어요'}</b><p>${filtered ? '다른 종류나 검색어로 찾아 보세요.' : '첫 글을 남겨 보세요.'}</p></div>`;
      } else {
        body = `<ul class="cm-list">${L.items.map(postRow).join('')}</ul>${pager(L)}`;
      }
      const catButtons = [['all', '전체'], ...Object.entries(CATS).map(([k, v]) => [k, v.label])]
        .map(([id, label]) => `<button type="button" data-cm="cat" data-id="${id}" class="${f.cat === id ? 'on' : ''}" aria-pressed="${f.cat === id}">${esc(label)}</button>`)
        .join('');
      const action = member
        ? `<a class="btn small" href="#/board/write">${ic('pencil')} 글쓰기</a>`
        : `<a class="btn small ghost" href="#/account/login" data-cm="login-next" data-next="#/board/write">로그인하고 쓰기</a>`;
      return `<section class="cm-page">
        <div class="section-heading">
          <div><h1>이야기 나누기</h1></div>
          ${action}
        </div>
        <p class="sub">${esc(RULES)}</p>
        <div class="seg cm-cats" role="group" aria-label="글 종류">${catButtons}</div>
        <form class="cm-search" data-cm-form="search" role="search">
          <input type="search" name="q" value="${esc(f.q)}" maxlength="40" placeholder="제목·내용으로 찾기" aria-label="게시글 검색">
          <button class="btn ghost small" type="submit">${ic('search')} 찾기</button>
        </form>
        <label class="cm-check"><input type="checkbox" data-cm="mine-toggle" ${f.mine ? 'checked' : ''} ${member ? '' : 'disabled'}> 내 글만 보기${member ? '' : ' (로그인 후 사용)'}</label>
        ${body}
      </section>`;
    }

    function commentForm(id) {
      return `<form class="cm-cform" data-cm-form="comment" data-id="${id}" novalidate>
        <label for="cm-c-body" class="sr">댓글</label>
        <textarea id="cm-c-body" name="body" rows="3" maxlength="${COMMENT_MAX}" placeholder="따뜻한 한마디를 남겨 주세요"></textarea>
        <div class="cm-cform-foot"><span class="cm-count sub">0/${COMMENT_MAX}</span><button class="btn small" type="submit">댓글 달기</button></div>
        <p class="cm-error" role="alert"></p>
      </form>`;
    }

    function detailView(id) {
      const P = st.post;
      const back = `<a class="text-link" href="#/board">${ic('back')} 게시판으로</a>`;
      if (P.id !== id || (!P.data && !P.error)) return `<section class="cm-page">${back}${loading('글을 불러오고 있어요…')}</section>`;
      if (P.error) {
        const msg = P.error === 'notfound' ? '글이 없거나 지워졌어요.' : P.error;
        return `<section class="cm-page">${back}<p class="notice" role="alert">${esc(msg)}</p></section>`;
      }
      const p = P.data;
      const member = isMember();
      const comments = P.comments || [];
      const list = comments.length
        ? `<ul class="cm-clist">${comments.map(c => `<li class="cm-c">
            <div class="row between"><b>${esc(c.nickname)}</b><span class="sub">${fmtWhen(c.createdAt)}</span></div>
            <p>${esc(c.body)}</p>
            ${c.mine ? `<button class="btn text small" type="button" data-cm="comment-del" data-id="${c.id}">지우기</button>` : ''}
          </li>`).join('')}</ul>`
        : '<p class="sub">아직 댓글이 없어요. 첫 댓글을 남겨 보세요.</p>';
      const writeBox = member
        ? commentForm(id)
        : `<div class="notice">댓글은 로그인한 회원만 달 수 있어요. <a href="#/account/login" data-cm="login-next" data-next="#/board/${id}">로그인하기</a></div>`;
      return `<section class="cm-page">
        ${back}
        <article class="card cm-post">
          <div class="row between"><span class="tag">${esc(p.categoryLabel)}</span>${p.mine ? '<span class="tag ok">내 글</span>' : ''}</div>
          <h1 class="cm-post-title">${esc(p.title)}</h1>
          <p class="cm-post-meta">${esc(p.nickname)} · ${fmtWhen(p.createdAt)}${p.edited ? ' · 고침' : ''} · 조회 ${p.views}</p>
          <div class="cm-body">${esc(p.body)}</div>
          ${p.mine ? `<div class="btn-group cm-post-actions">
            <a class="btn ghost small" href="#/board/${id}/edit">${ic('pencil')} 고치기</a>
            <button class="btn danger small" type="button" data-cm="post-del" data-id="${id}">지우기</button>
          </div>` : ''}
        </article>
        <section class="cm-comments" aria-label="댓글">
          <h2>댓글 <span class="sub">${comments.length}</span></h2>
          ${list}
          ${writeBox}
        </section>
      </section>`;
    }

    function writeView(editId) {
      const editing = !!editId;
      if (editing && (st.post.id !== editId || !st.post.data)) {
        return `<section class="cm-page"><a class="text-link" href="#/board/${editId}">${ic('back')} 글로 돌아가기</a>${loading('글을 불러오고 있어요…')}</section>`;
      }
      if (editing && st.post.data && !st.post.data.mine) {
        return `<section class="cm-page"><a class="text-link" href="#/board/${editId}">${ic('back')} 글로 돌아가기</a><p class="notice" role="alert">작성자만 고칠 수 있어요.</p></section>`;
      }
      const d = editing ? st.post.data : { category: 'free', title: '', body: '' };
      const opts = Object.entries(CATS)
        .map(([k, v]) => `<option value="${k}" ${d.category === k ? 'selected' : ''}>${esc(v.label)}</option>`).join('');
      const back = editing ? `#/board/${editId}` : '#/board';
      return `<section class="cm-page">
        <a class="text-link" href="${back}">${ic('back')} ${editing ? '글로 돌아가기' : '게시판'}</a>
        <h1>${editing ? '글 고치기' : '새 글 쓰기'}</h1>
        <p class="sub">${esc(RULES)}</p>
        <form class="card cm-form" data-cm-form="post" ${editing ? `data-id="${editId}"` : ''} novalidate>
          <label for="cm-p-cat">글 종류</label>
          <select id="cm-p-cat" name="category">${opts}</select>
          <label for="cm-p-title">제목</label>
          <input id="cm-p-title" name="title" maxlength="80" value="${esc(d.title)}" required>
          <label for="cm-p-body">내용</label>
          <textarea id="cm-p-body" name="body" rows="10" maxlength="${BODY_MAX}" required>${esc(d.body)}</textarea>
          <p class="cm-count sub">${String(d.body || '').length}/${BODY_MAX}</p>
          <p class="cm-error" role="alert"></p>
          <div class="btn-group">
            <button class="btn" type="submit">${editing ? '고치기' : '올리기'}</button>
            <a class="btn ghost" href="${back}">취소</a>
          </div>
        </form>
      </section>`;
    }

    // ---------- 폼 도우미 ----------

    function setBusy(form, on) {
      form.querySelectorAll('button[type="submit"]').forEach(b => { b.disabled = on; });
    }

    // 오류 문구만 바꾼다 (화면을 다시 그리지 않으므로 입력한 내용이 남는다)
    function formError(form, msg, field) {
      const box = form.querySelector('.cm-error');
      if (box) box.textContent = msg || '';
      form.querySelectorAll('[aria-invalid]').forEach(x => x.removeAttribute('aria-invalid'));
      if (field) {
        const el = form.querySelector(`[name="${field}"]`);
        if (el) {
          el.setAttribute('aria-invalid', 'true');
          if (typeof el.focus === 'function') el.focus();
        }
      }
    }

    function afterAuth() {
      const to = st.returnTo || '#/board';
      st.returnTo = '#/board';
      st.enteredKey = '';
      goto(to);
    }

    async function doLogin(form) {
      const fd = new FormData(form);
      const email = String(fd.get('email') || '').trim();
      const password = String(fd.get('password') || '');
      if (!email || !password) return formError(form, '이메일과 비밀번호를 입력해 주세요.', !email ? 'email' : 'password');
      setBusy(form, true);
      const r = await api('/api/auth/login', { method: 'POST', body: { email, password } });
      setBusy(form, false);
      if (!r.ok) {
        formError(form, (r.body && r.body.message) || '로그인하지 못했어요. 잠시 후 다시 시도해 주세요.');
        const pw = form.querySelector('[name="password"]');
        if (pw && r.status === 401) pw.value = '';     // 틀린 비밀번호만 지운다
        return;
      }
      await applySession({ uid: r.body.uid, token: r.body.token, member: r.body.member });
      toast(`${r.body.member.nickname}님, 어서 오세요 🙏`);
      afterAuth();
    }

    async function doSignup(form) {
      const fd = new FormData(form);
      const email = String(fd.get('email') || '').trim();
      const nickname = String(fd.get('nickname') || '').trim();
      const password = String(fd.get('password') || '');
      const password2 = String(fd.get('password2') || '');
      if (!fd.get('agree')) return formError(form, '회원 게시판 규칙에 동의해 주세요.', 'agree');
      if (password !== password2) return formError(form, '비밀번호 확인이 달라요. 다시 입력해 주세요.', 'password2');
      setBusy(form, true);
      const r = await api('/api/auth/signup', { method: 'POST', body: { email, nickname, password } });
      setBusy(form, false);
      if (!r.ok) return formError(form, (r.body && r.body.message) || '가입하지 못했어요. 잠시 후 다시 시도해 주세요.', (r.body && r.body.field) || null);
      await applySession({ uid: r.body.uid, token: r.body.token, member: r.body.member });
      toast(`가입을 환영해요, ${r.body.member.nickname}님 🪷`);
      afterAuth();
    }

    async function doPost(form) {
      const fd = new FormData(form);
      const body = {
        category: String(fd.get('category') || ''),
        title: String(fd.get('title') || '').trim(),
        body: String(fd.get('body') || '').trim()
      };
      if (!body.title) return formError(form, '제목을 적어 주세요.', 'title');
      if (!body.body) return formError(form, '내용을 적어 주세요.', 'body');
      const editId = idOf(form.dataset.id);
      setBusy(form, true);
      const r = editId
        ? await api(`/api/board/posts/${editId}`, { method: 'PATCH', body })
        : await api('/api/board/posts', { method: 'POST', body });
      setBusy(form, false);
      if (!r.ok) return formError(form, (r.body && r.body.message) || '저장하지 못했어요.', (r.body && r.body.field) || null);
      const id = editId || r.body.id;
      st.enteredKey = '';
      st.post = { id: 0, data: null, comments: null, error: '' };
      refreshMember();
      toast(editId ? '글을 고쳤어요' : '글을 올렸어요');
      goto(`#/board/${id}`);
    }

    async function doComment(form) {
      const id = idOf(form.dataset.id);
      const body = String(new FormData(form).get('body') || '').trim();
      if (!body) return formError(form, '댓글 내용을 적어 주세요.', 'body');
      setBusy(form, true);
      const r = await api(`/api/board/posts/${id}/comments`, { method: 'POST', body: { body } });
      setBusy(form, false);
      if (!r.ok) return formError(form, (r.body && r.body.message) || '댓글을 달지 못했어요.', (r.body && r.body.field) || null);
      refreshMember();
      loadComments(id);                                 // 다시 그려지면서 입력칸도 비워진다
    }

    // 제출 이벤트는 화면이 다시 그려져도 살아 있도록 문서 단위에서 받는다
    document.addEventListener('submit', e => {
      const form = e.target;
      const kind = form && form.dataset ? form.dataset.cmForm : '';
      if (!kind) return;
      e.preventDefault();
      if (kind === 'login') doLogin(form);
      else if (kind === 'signup') doSignup(form);
      else if (kind === 'post') doPost(form);
      else if (kind === 'comment') doComment(form);
      else if (kind === 'search') {
        st.filter.q = String(new FormData(form).get('q') || '').trim().slice(0, 40);
        st.filter.page = 1;
        refetchList();
      }
    });

    document.addEventListener('click', async e => {
      const el = e.target && e.target.closest ? e.target.closest('[data-cm]') : null;
      if (!el) return;
      const act = el.dataset.cm;
      if (act === 'login-next') { st.returnTo = el.dataset.next || '#/board'; return; }   // 링크는 그대로 이동한다
      if (act === 'cat') { st.filter.cat = el.dataset.id; st.filter.page = 1; refetchList(); return; }
      if (act === 'page') {
        st.filter.page = Math.max(1, Number(el.dataset.p) || 1);
        refetchList();
        window.scrollTo(0, 0);
        return;
      }
      if (act === 'mine') {
        st.filter = { cat: 'all', q: '', page: 1, mine: true };
        st.enteredKey = '';
        goto('#/board');
        return;
      }
      if (act === 'logout') {
        await api('/api/auth/logout', { method: 'POST' });
        await applySession(null);
        st.filter.mine = false;
        st.enteredKey = '';
        toast('로그아웃했어요');
        goto('#/board');
        return;
      }
      if (act === 'post-del') {
        const id = idOf(el.dataset.id);
        if (!confirm('이 글을 지울까요? 달린 댓글도 함께 지워져요.')) return;
        const r = await api(`/api/board/posts/${id}`, { method: 'DELETE' });
        if (!r.ok) return toast((r.body && r.body.message) || '지우지 못했어요.');
        st.enteredKey = '';
        st.post = { id: 0, data: null, comments: null, error: '' };
        refreshMember();
        toast('글을 지웠어요');
        goto('#/board');
        return;
      }
      if (act === 'comment-del') {
        const cid = idOf(el.dataset.id);
        if (!confirm('이 댓글을 지울까요?')) return;
        const r = await api(`/api/board/comments/${cid}`, { method: 'DELETE' });
        if (!r.ok) return toast((r.body && r.body.message) || '지우지 못했어요.');
        refreshMember();
        loadComments(st.post.id);
      }
    });

    // 글자 수 표시 (textarea 의 maxlength 를 기준으로)
    document.addEventListener('input', e => {
      const t = e.target;
      if (!t || !t.form || t.tagName !== 'TEXTAREA' || t.maxLength < 0) return;
      const count = t.form.querySelector('.cm-count');
      if (count) count.textContent = `${t.value.length}/${t.maxLength}`;
    });

    // 내 글 목록을 열 때 로그인 상태가 바뀌었으면 필터를 맞춘다
    document.addEventListener('change', e => {
      const t = e.target;
      if (!t || t.dataset.cm !== 'mine-toggle') return;
      st.filter.mine = !!t.checked;
      st.filter.page = 1;
      refetchList();
    });

    return { view, enter, reset };
  }

  root.MJ_COMMUNITY_FACTORY = createCommunity;
})(window);
