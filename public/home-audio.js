(function () {
  'use strict';
  function init() {
    var root = document.querySelector('[data-module="home-audio"]');
    if (!root || root.dataset.ready === '1') return;
    root.dataset.ready = '1';
    var audio = document.getElementById('home-audio-element');
    var title = document.getElementById('home-audio-title');
    var toggle = document.getElementById('home-audio-toggle');
    var random = document.getElementById('home-audio-random');
    var tracks = [];
    try { tracks = JSON.parse(localStorage.getItem('helicase-playlist') || '[]'); } catch (_) {}
    tracks = tracks.filter(function (track) { return track && typeof track.audio === 'string' && track.audio.trim(); });
    var current = Number(audio.dataset.trackIndex || -1);
    function label(text) { title.textContent = text; }
    function choose(autoplay) {
      if (!tracks.length) { label('add an audio source in tracks'); toggle.textContent = 'open'; return; }
      var next = Math.floor(Math.random() * tracks.length);
      if (tracks.length > 1 && next === current) next = (next + 1) % tracks.length;
      current = next;
      audio.dataset.trackIndex = String(current);
      audio.src = tracks[current].audio;
      label(tracks[current].title || 'untitled');
      if (autoplay) audio.play().catch(function () { toggle.textContent = 'play'; });
    }
    random.addEventListener('click', function () { choose(true); });
    toggle.addEventListener('click', function () {
      if (!tracks.length) { location.href = '/music'; return; }
      if (current < 0) choose(true);
      else if (audio.paused) audio.play().catch(function () {});
      else audio.pause();
    });
    audio.addEventListener('play', function () { toggle.textContent = 'pause'; });
    audio.addEventListener('pause', function () { toggle.textContent = 'play'; });
    audio.addEventListener('ended', function () { choose(true); });
    if (!tracks.length) label('add an audio source in tracks');
    else if (current >= 0 && tracks[current]) {
      label(tracks[current].title || 'untitled');
      toggle.textContent = audio.paused ? 'play' : 'pause';
    }
  }
  document.addEventListener('astro:page-load', init);
  init();
})();
