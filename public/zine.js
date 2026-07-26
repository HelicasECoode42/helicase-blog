// HELICASE Zine — Gallery Wall
(function() {
  'use strict';

  var K_PHOTOS   = 'helicase-zine-photos';
  var K_NOTES    = 'helicase-zine-notes';    // { idx: 'single note string' }
  var K_COMMENTS = 'helicase-zine-comments'; // { idx: [{id,author,text,ts}] }
  var K_IDENTITY = 'helicase-zine-identity'; // { name: string }

  // ── Storage ──────────────────────────────────
  function load(key, fallback) {
    try { var r = localStorage.getItem(key); return r ? JSON.parse(r) : fallback; } catch(e) { return fallback; }
  }
  function save(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch(e) {} }

  var photos   = load(K_PHOTOS, []);
  var notes    = load(K_NOTES, {});
  var comments = load(K_COMMENTS, {});
  var identity = load(K_IDENTITY, { name: '' }); // { name: string } — future: { token, user_id, name }

  // ── DOM refs ─────────────────────────────────
  var wall      = document.getElementById('zine-wall');
  var emptyEl   = document.getElementById('zine-empty');
  var uploadBar = document.getElementById('gallery-upload');

  // Empty-state inputs
  var urlInp    = document.getElementById('zine-url-inp');
  var urlAdd    = document.getElementById('zine-url-add');
  var fileInp   = document.getElementById('zine-file-inp');

  // Top bar inputs
  var urlInpTop  = document.getElementById('zine-url-inp-top');
  var urlAddTop  = document.getElementById('zine-url-add-top');
  var fileInpTop = document.getElementById('zine-file-inp-top');

  // Lightbox
  var lb       = document.getElementById('lightbox');
  var lbImg    = document.getElementById('lightbox-img');
  var lbCap    = document.getElementById('lightbox-cap');
  var lbClose  = document.getElementById('lightbox-close');
  var lbPrev   = document.getElementById('lightbox-prev');
  var lbNext   = document.getElementById('lightbox-next');

  // Commentary
  var cmtPanel  = document.getElementById('commentary');
  var cmtCount  = document.getElementById('commentary-count');
  var cmtList   = document.getElementById('commentary-list');
  var cmtInput  = document.getElementById('commentary-input');
  var cmtSend   = document.getElementById('commentary-send');

  var lbIdx = -1;

  // ── Helpers ──────────────────────────────────
  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  function escAttr(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function ts() { return new Date().toISOString().slice(0,16).replace('T',' '); }

  function commentCount(idx) {
    return (comments[idx] || []).length;
  }

  // ── Render ───────────────────────────────────
  function updateUploadBar() {
    if (!uploadBar) return;
    uploadBar.classList.toggle('has-photos', photos.length > 0);
  }

  function updateEmpty() {
    if (!emptyEl) return;
    emptyEl.style.display = photos.length === 0 ? 'block' : 'none';
  }

  function createPiece(src, idx) {
    var div = document.createElement('div');
    div.className = 'gallery-piece';
    div.setAttribute('data-idx', String(idx));

    var note = notes[idx] || '';
    var cc = commentCount(idx);

    var noteHtml = note ? '<span class="plaque-note">' + esc(note) + '</span>' : '<span></span>';
    var commentHtml = cc > 0 ? '<span class="plaque-comments">' + cc + ' note' + (cc > 1 ? 's' : '') + '</span>' : '<span></span>';

    div.innerHTML =
      '<img src="' + escAttr(src) + '" alt="" loading="lazy" />' +
      '<div class="gallery-piece-plaque">' + noteHtml + commentHtml + '</div>';

    div.addEventListener('click', function() { openLightbox(idx); });
    wall.appendChild(div);
  }

  function renderAll() {
    if (!wall) return;
    wall.innerHTML = '';
    updateEmpty();
    updateUploadBar();
    if (photos.length === 0) return;

    // Chunked rendering: 6 pieces per frame to avoid blocking main thread
    var BATCH = 6;
    var idx = 0;
    function renderBatch() {
      var end = Math.min(idx + BATCH, photos.length);
      for (; idx < end; idx++) {
        createPiece(photos[idx], idx);
      }
      if (idx < photos.length) {
        requestAnimationFrame(renderBatch);
      }
    }
    requestAnimationFrame(renderBatch);
  }

  // ── Add photo ────────────────────────────────
  function addPhoto(src) {
    if (!src) return;
    photos.push(src);
    try { save(K_PHOTOS, photos); } catch(e) {
      photos.pop();
      return;
    }
    createPiece(src, photos.length - 1);
    updateEmpty();
    updateUploadBar();
  }

  // ── Delete photo ─────────────────────────────
  function deletePhoto(idx) {
    photos.splice(idx, 1);
    save(K_PHOTOS, photos);

    // Shift notes & comments
    var newNotes = {}, newComments = {};
    for (var k in notes) {
      var ki = parseInt(k, 10);
      if (ki < idx) newNotes[ki] = notes[k];
      else if (ki > idx) newNotes[ki-1] = notes[k];
    }
    for (var kk in comments) {
      var kki = parseInt(kk, 10);
      if (kki < idx) newComments[kki] = comments[kk];
      else if (kki > idx) newComments[kki-1] = comments[kk];
    }
    notes = newNotes; comments = newComments;
    save(K_NOTES, notes); save(K_COMMENTS, comments);

    closeLightbox();
    renderAll();
  }

  // ── Lightbox ─────────────────────────────────
  function openLightbox(idx) {
    lbIdx = idx;
    lbImg.src = photos[idx];
    lbCap.textContent = notes[idx] || '';
    lb.style.display = 'flex';
    requestAnimationFrame(function() { lb.classList.add('open'); });
    renderComments();
  }

  function closeLightbox() {
    lb.classList.remove('open');
    lbIdx = -1;
    setTimeout(function() { if (lbIdx === -1) lb.style.display = 'none'; }, 300);
  }

  function lbPrevFn() {
    if (lbIdx < 0 || photos.length === 0) return;
    lbIdx = (lbIdx - 1 + photos.length) % photos.length;
    lbImg.style.opacity = '0';
    setTimeout(function() {
      lbImg.src = photos[lbIdx];
      lbCap.textContent = notes[lbIdx] || '';
      lbImg.style.opacity = '1';
      renderComments();
    }, 200);
  }

  function lbNextFn() {
    if (lbIdx < 0 || photos.length === 0) return;
    lbIdx = (lbIdx + 1) % photos.length;
    lbImg.style.opacity = '0';
    setTimeout(function() {
      lbImg.src = photos[lbIdx];
      lbCap.textContent = notes[lbIdx] || '';
      lbImg.style.opacity = '1';
      renderComments();
    }, 200);
  }

  var lbDel = document.getElementById('lightbox-del');

  lbClose.addEventListener('click', closeLightbox);
  lbPrev.addEventListener('click', lbPrevFn);
  lbNext.addEventListener('click', lbNextFn);
  // Public gallery is read-only. Owner publishing will move to the protected Studio.

  lb.addEventListener('click', function(e) {
    if (e.target === lb) closeLightbox();
  });

  // ── Commentary ───────────────────────────────
  function renderComments() {
    if (lbIdx < 0) return;
    var list = comments[lbIdx] || [];
    cmtCount.textContent = list.length > 0 ? '(' + list.length + ')' : '';

    if (list.length === 0) {
      cmtList.innerHTML = '<p style="color:var(--color-silver-light);font-size:0.7rem;font-style:italic;">no notes yet</p>';
      return;
    }

    cmtList.innerHTML = '';
    for (var i = list.length - 1; i >= 0; i--) {
      var c = list[i];
      var el = document.createElement('div');
      el.className = 'commentary-item';
      el.innerHTML =
        '<div class="commentary-item-text">' + esc(c.text) + '</div>' +
        '<div class="commentary-item-meta">' +
          '<span class="commentary-item-author">' + esc(c.author || 'anonymous') + '</span>' +
          '<span>·</span>' +
          '<span>' + c.ts + '</span>' +
          '<button class="commentary-item-del" data-cid="' + c.id + '">×</button>' +
        '</div>';
      el.querySelector('.commentary-item-del').addEventListener('click', function(e) {
        e.stopPropagation();
        var cid = this.getAttribute('data-cid');
        comments[lbIdx] = (comments[lbIdx] || []).filter(function(x) { return x.id !== cid; });
        if (comments[lbIdx].length === 0) delete comments[lbIdx];
        save(K_COMMENTS, comments);
        renderComments();
        updatePlaque(lbIdx);
      });
      cmtList.appendChild(el);
    }
  }

  function addComment() {
    var text = cmtInput.value.trim();
    if (!text || lbIdx < 0) return;
    // Ensure identity is saved before commenting
    var author = identity.name.trim() || 'anonymous';
    if (!identity.name.trim()) {
      identity.name = 'anonymous';
      save(K_IDENTITY, identity);
      updateIdentityUI();
    }
    if (!comments[lbIdx]) comments[lbIdx] = [];
    comments[lbIdx].push({ id: 'c' + Date.now(), author: author, text: text, ts: ts() });
    save(K_COMMENTS, comments);
    cmtInput.value = '';
    renderComments();
    updatePlaque(lbIdx);
  }

  cmtSend.addEventListener('click', addComment);
  cmtInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') addComment();
  });

  // ── Note (single caption) ────────────────────
  // Double-click the lightbox image to edit the single-note/caption
  lbImg.addEventListener('dblclick', function() {
    if (lbIdx < 0) return;
    var current = notes[lbIdx] || '';
    var input = prompt('edit caption:', current);
    if (input !== null) {
      if (input.trim()) notes[lbIdx] = input.trim();
      else delete notes[lbIdx];
      save(K_NOTES, notes);
      lbCap.textContent = notes[lbIdx] || '';
      updatePlaque(lbIdx);
    }
  });

  // Update the plaque under a gallery piece
  function updatePlaque(idx) {
    var piece = wall.querySelector('[data-idx="' + idx + '"]');
    if (!piece) return;
    var note = notes[idx] || '';
    var cc = commentCount(idx);
    var noteEl = piece.querySelector('.plaque-note');
    var countEl = piece.querySelector('.plaque-comments');
    if (noteEl) noteEl.textContent = note;
    if (countEl) countEl.textContent = cc > 0 ? cc + ' note' + (cc > 1 ? 's' : '') : '';
  }

  // ── Upload handlers ──────────────────────────
  function doAddUrl(inp) {
    var v = inp.value.trim();
    if (!v) return;
    if (!/^(https?:\/\/|data:)/i.test(v)) {
      inp.style.borderColor = '#c44';
      setTimeout(function() { inp.style.borderColor = ''; }, 1500);
      return;
    }
    addPhoto(v);
    inp.value = '';
  }

  if (urlAdd) urlAdd.addEventListener('click', function() { doAddUrl(urlInp); });
  if (urlInp) urlInp.addEventListener('keydown', function(e) { if (e.key === 'Enter') doAddUrl(urlInp); });
  if (urlAddTop) urlAddTop.addEventListener('click', function() { doAddUrl(urlInpTop); });
  if (urlInpTop) urlInpTop.addEventListener('keydown', function(e) { if (e.key === 'Enter') doAddUrl(urlInpTop); });

  // ── Image compression (canvas resize before storage) ──
  var MAX_DIM = 1200; // max width/height in pixels
  var JPEG_QUALITY = 0.8;

  function compressImage(file, callback) {
    var reader = new FileReader();
    reader.onload = function() {
      var img = new Image();
      img.onload = function() {
        var w = img.width, h = img.height;
        // Only resize if larger than MAX_DIM
        if (w > MAX_DIM || h > MAX_DIM) {
          if (w > h) { h = Math.round(h * MAX_DIM / w); w = MAX_DIM; }
          else       { w = Math.round(w * MAX_DIM / h); h = MAX_DIM; }
        }
        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        callback(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
      };
      img.onerror = function() {
        // Fallback: store raw data URL if image decode fails
        callback(reader.result);
      };
      img.src = reader.result;
    };
    reader.onerror = function() {};
    reader.readAsDataURL(file);
  }

  function doAddFiles(inp) {
    var files = inp.files;
    if (!files || files.length === 0) return;
    for (var i = 0; i < files.length; i++) {
      (function(f) {
        compressImage(f, function(dataUrl) { addPhoto(dataUrl); });
      })(files[i]);
    }
    inp.value = '';
  }

  if (fileInp) fileInp.addEventListener('change', function() { doAddFiles(fileInp); });
  if (fileInpTop) fileInpTop.addEventListener('change', function() { doAddFiles(fileInpTop); });

  // ── Keyboard ─────────────────────────────────
  document.addEventListener('keydown', function(e) {
    if (!lb.classList.contains('open')) return;
    if (e.key === 'Escape') { closeLightbox(); return; }
    if (e.key === 'ArrowLeft') { lbPrevFn(); return; }
    if (e.key === 'ArrowRight') { lbNextFn(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (document.activeElement === cmtInput) return; // don't delete photo while typing
      if (lbIdx >= 0) {
        if (confirm('remove this piece from the gallery?')) deletePhoto(lbIdx);
      }
    }
  });

  // ── Identity ─────────────────────────────────
  var identityName = document.getElementById('identity-name');
  var identitySave = document.getElementById('identity-save');

  function updateIdentityUI() {
    if (identityName) identityName.value = identity.name || '';
  }

  if (identitySave) {
    identitySave.addEventListener('click', function() {
      identity.name = (identityName && identityName.value.trim()) || 'anonymous';
      save(K_IDENTITY, identity);
    });
  }

  if (identityName) {
    identityName.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        identity.name = identityName.value.trim() || 'anonymous';
        save(K_IDENTITY, identity);
      }
    });
  }

  updateIdentityUI();

  // ── Init ─────────────────────────────────────
  renderAll();
})();
