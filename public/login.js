document.getElementById('login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = document.getElementById('err');
  err.hidden = true;
  const res = await fetch('/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: document.getElementById('email').value, password: document.getElementById('password').value })
  });
  if (res.ok) { location.href = '/app'; return; }
  err.textContent = (await res.json().catch(() => ({}))).error || 'Could not sign in. Try again.';
  err.hidden = false;
});
