// Shared by the staff screens: page data, translated text, API calls, a small DOM helper, toast, language and sign out.
window.Nobat = (() => {
  const dataEl = document.getElementById('data');
  const D = dataEl ? JSON.parse(dataEl.textContent) : {};
  const L = D.t || {};
  const tr = (key, vars) => {
    let s = L[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.split('{' + k + '}').join(String(v));
    return s;
  };

  async function api(path, method = 'GET', body) {
    const res = await fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    if (res.status === 401) { location.href = '/login'; throw new Error(tr('signInAgain')); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error && L[data.error] ? L[data.error] : tr('errGeneric'));
    return data;
  }
  function el(tag, attrs = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat()) if (k != null && k !== false) n.append(k);
    return n;
  }
  function toast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg; t.classList.add('on');
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 3500);
  }
  const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad' }).format(new Date());

  document.getElementById('logout')?.addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST' });
    location.href = '/login';
  });
  document.getElementById('staffLang')?.addEventListener('change', async (e) => {
    await api('/api/s/lang', 'POST', { lang: e.target.value });
    location.reload();
  });
  return { D, L, tr, api, el, toast, today };
})();
