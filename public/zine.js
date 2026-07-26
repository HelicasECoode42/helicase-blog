// Public Zine: items and approved comments come from the Worker/D1 backend.
(function () {
  'use strict';
  var photos = [], current = -1, identity = { name: '' };
  var wall = document.getElementById('zine-wall'), empty = document.getElementById('zine-empty');
  var lightbox = document.getElementById('lightbox'), image = document.getElementById('lightbox-img'), caption = document.getElementById('lightbox-cap');
  var list = document.getElementById('commentary-list'), count = document.getElementById('commentary-count');
  var input = document.getElementById('commentary-input'), send = document.getElementById('commentary-send');
  var nameInput = document.getElementById('identity-name'), nameSave = document.getElementById('identity-save');
  var captchaToken = '', captcha = document.getElementById('comment-turnstile');
  if (captcha) { var captchaScript = document.createElement('script'); captchaScript.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; captchaScript.async = true; captchaScript.onload = function(){ window.turnstile.render(captcha, {sitekey: captcha.dataset.sitekey, callback:function(token){captchaToken=token;}, 'expired-callback':function(){captchaToken='';}}); }; document.head.appendChild(captchaScript); }
  function esc(value) { return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function loadIdentity() { try { identity = JSON.parse(localStorage.getItem('helicase-zine-identity') || '{"name":""}'); } catch (_) {} if (nameInput) nameInput.value = identity.name || ''; }
  function render() {
    wall.innerHTML = photos.map(function (p, i) { return '<div class="gallery-piece" data-i="' + i + '"><img src="' + esc(p.image) + '" alt="" loading="lazy"><div class="gallery-piece-plaque"><span class="plaque-note">' + esc(p.caption || p.title) + '</span><span></span></div></div>'; }).join('');
    empty.style.display = photos.length ? 'none' : 'block';
    Array.prototype.forEach.call(wall.querySelectorAll('.gallery-piece'), function (piece) { piece.addEventListener('click', function () { open(Number(piece.dataset.i)); }); });
  }
  async function load() { try { var r = await fetch('/api/content/zine'); if (!r.ok) throw new Error(); photos = (await r.json()).items || []; } catch (_) { photos = []; } render(); }
  async function comments() {
    if (current < 0) return; list.innerHTML = '<p style="color:var(--color-silver-light);font-size:.7rem">loading…</p>';
    try { var r = await fetch('/api/comments?target=' + encodeURIComponent(photos[current].id)); var data = await r.json(); var items = data.items || []; count.textContent = items.length ? '(' + items.length + ')' : ''; list.innerHTML = items.length ? items.map(function (c) { return '<div class="commentary-item"><div class="commentary-item-text">' + esc(c.body) + '</div><div class="commentary-item-meta"><span>' + esc(c.author) + '</span><span>·</span><span>' + esc(c.created_at || '') + '</span></div></div>'; }).join('') : '<p style="color:var(--color-silver-light);font-size:.7rem">no approved notes yet</p>'; } catch (_) { list.innerHTML = '<p style="color:var(--color-silver-light);font-size:.7rem">comments unavailable</p>'; }
  }
  function open(i) { current = i; image.src = photos[i].image; caption.textContent = photos[i].caption || photos[i].title || ''; lightbox.style.display = 'flex'; requestAnimationFrame(function(){ lightbox.classList.add('open'); }); comments(); }
  function close() { lightbox.classList.remove('open'); current = -1; setTimeout(function(){ if (current < 0) lightbox.style.display = 'none'; }, 250); }
  document.getElementById('lightbox-close').addEventListener('click', close);
  document.getElementById('lightbox-prev').addEventListener('click', function(){ if (!photos.length) return; open((current - 1 + photos.length) % photos.length); });
  document.getElementById('lightbox-next').addEventListener('click', function(){ if (!photos.length) return; open((current + 1) % photos.length); });
  lightbox.addEventListener('click', function(e){ if (e.target === lightbox) close(); });
  nameSave.addEventListener('click', function(){ identity.name = (nameInput.value || '').trim() || 'anonymous'; localStorage.setItem('helicase-zine-identity', JSON.stringify(identity)); });
  send.addEventListener('click', async function(){ var body = (input.value || '').trim(); if (!body || current < 0) return; send.disabled = true; try { var r = await fetch('/api/comments', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ target: photos[current].id, author: identity.name || 'anonymous', body: body, turnstileToken: captchaToken }) }); if (!r.ok) throw new Error(); input.value = ''; list.innerHTML = '<p style="color:var(--color-silver-light);font-size:.7rem">submitted for approval — thank you.</p>'; if (captcha && window.turnstile) { window.turnstile.reset(); captchaToken=''; } } catch (_) { list.innerHTML = '<p style="color:#c44;font-size:.7rem">could not submit; please try later.</p>'; } send.disabled = false; });
  input.addEventListener('keydown', function(e){ if (e.key === 'Enter') send.click(); });
  document.addEventListener('keydown', function(e){ if (!lightbox.classList.contains('open')) return; if (e.key === 'Escape') close(); if (e.key === 'ArrowLeft') document.getElementById('lightbox-prev').click(); if (e.key === 'ArrowRight') document.getElementById('lightbox-next').click(); });
  loadIdentity(); load();
})();
