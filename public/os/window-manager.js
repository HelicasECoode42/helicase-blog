// ============================================
// HELICASE DESKTOP.OS — Window Manager
// Vanilla JS singleton. Manages window lifecycles,
// drag, focus, z-index, and localStorage persistence.
// ============================================

// v2 resets the prototype's old top-left geometry while preserving it for
// anyone who wants to inspect the previous layout manually.
const LAYOUT_KEY = 'helicase-desktop-layout-v2';
const MAX_Z = 9999;

export class WindowManager {
  /** @param {HTMLElement} el — desktop container */
  constructor(el) {
    /** @type {HTMLElement} */
    this.el = el;
    /** @type {Map<string, import('./WindowManager.ts').WinState>} */
    this.wins = new Map();
    /** @type {string|null} */
    this.activeId = null;
    /** @type {number} */
    this.nextZ = 100;
    /** @type {Map<string, import('./WindowManager.ts').WinDescriptor>} */
    this.descriptors = new Map();
    /** @type {{id:string,startX:number,startY:number,winX:number,winY:number}|null} */
    this.drag = null;

    this._onDragMove = this._onDragMove.bind(this);
    this._onDragEnd = this._onDragEnd.bind(this);
    this._bindGlobalEvents();
  }

  static _instance = null;

  /** @param {HTMLElement} el */
  static init(el) {
    if (!WindowManager._instance) {
      WindowManager._instance = new WindowManager(el);
    }
    return WindowManager._instance;
  }

  static get() {
    return WindowManager._instance;
  }

  // ── Register a window type ──────────────────
  /** @param {import('./WindowManager.ts').WinDescriptor} desc */
  register(desc) {
    this.descriptors.set(desc.id, desc);
  }

  // ── Open window ─────────────────────────────
  /** @param {string} id */
  open(id) {
    const desc = this.descriptors.get(id);
    if (!desc) return null;

    // Already open? Focus it
    if (this.wins.has(id)) {
      const winEl = document.getElementById(`win-${id}`);
      if (winEl) {
        winEl.style.display = '';
        winEl.classList.remove('win--minimized');
      }
      this.focus(id);
      return this.wins.get(id);
    }

    // Restore saved layout or default with cascade
    const saved = this._loadLayout();
    const fromSave = saved[id];
    const cascade = this.wins.size * 24;
    const w = fromSave?.w ?? desc.width;
    const h = fromSave?.h ?? desc.height;
    const defaultX = desc.center ? Math.max(24, Math.round((window.innerWidth - w) / 2)) : 80 + cascade;
    const defaultY = desc.center ? Math.max(44, Math.round((window.innerHeight - h) / 2) - 20) : 60 + cascade;
    const x = fromSave?.x ?? (desc.x ?? defaultX);
    const y = fromSave?.y ?? (desc.y ?? defaultY);

    const state = {
      id,
      title: desc.title,
      icon: desc.icon,
      x, y,
      width: w,
      height: h,
      zIndex: this.nextZ++,
      minWidth: desc.minWidth ?? 240,
      minHeight: desc.minHeight ?? 160,
    };

    this.wins.set(id, state);

    // Build DOM
    const contentEl = desc.content(state);
    const winEl = this._createWindowDOM(state, contentEl);
    this.el.appendChild(winEl);

    // Animate in
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        winEl.classList.add('os-window--open');
      });
    });

    // Focus
    setTimeout(() => this.focus(id), 50);

    // Update dock
    this._updateDock(id, true);

    return state;
  }

  // ── Close window ────────────────────────────
  /** @param {string} id */
  close(id) {
    const winEl = document.getElementById(`win-${id}`);
    if (!winEl) return;

    winEl.classList.remove('os-window--open');
    winEl.classList.add('os-window--closing');

    const onEnd = () => {
      winEl.removeEventListener('transitionend', onEnd);
      if (winEl.parentNode) winEl.parentNode.removeChild(winEl);
      this.wins.delete(id);
      if (this.activeId === id) this.activeId = null;
      this._updateDock(id, false);
      this._saveLayout();
    };
    winEl.addEventListener('transitionend', onEnd);
    setTimeout(onEnd, 350);
  }

  // ── Focus window ────────────────────────────
  /** @param {string} id */
  focus(id) {
    const state = this.wins.get(id);
    if (!state) return;

    state.zIndex = this.nextZ++;
    if (this.nextZ > MAX_Z) this._normalizeZ();

    const winEl = document.getElementById(`win-${id}`);
    if (winEl) {
      winEl.style.zIndex = String(state.zIndex);
      winEl.classList.add('os-window--focused');
    }

    // Unfocus previous
    if (this.activeId && this.activeId !== id) {
      const prev = document.getElementById(`win-${this.activeId}`);
      if (prev) prev.classList.remove('os-window--focused');
    }
    this.activeId = id;
    this._updateDockActive();
  }

  // ── Drag handlers ───────────────────────────
  /** @param {PointerEvent} e @param {string} id */
  _onDragStart(e, id) {
    const state = this.wins.get(id);
    if (!state) return;
    this.drag = { id, startX: e.clientX, startY: e.clientY, winX: state.x, winY: state.y };
    const winEl = document.getElementById(`win-${id}`);
    if (winEl) {
      winEl.classList.add('os-window--dragging');
      if (winEl.setPointerCapture) winEl.setPointerCapture(e.pointerId);
    }
  }

  /** @param {PointerEvent} e */
  _onDragMove(e) {
    if (!this.drag) return;
    const state = this.wins.get(this.drag.id);
    if (!state) return;

    const dx = e.clientX - this.drag.startX;
    const dy = e.clientY - this.drag.startY;
    const nx = this.drag.winX + dx;
    const ny = this.drag.winY + dy;

    // Keep at least 40px visible
    const minVis = 40;
    const maxX = window.innerWidth - minVis;
    const maxY = window.innerHeight - minVis;
    state.x = Math.max(-state.width + minVis, Math.min(nx, maxX));
    state.y = Math.max(-minVis, Math.min(ny, maxY));

    const winEl = document.getElementById(`win-${this.drag.id}`);
    if (winEl) {
      winEl.style.transform = `translate(${state.x}px, ${state.y}px)`;
    }
  }

  _onDragEnd() {
    if (!this.drag) return;
    const winEl = document.getElementById(`win-${this.drag.id}`);
    if (winEl) winEl.classList.remove('os-window--dragging');
    this.drag = null;
    this._saveLayout();
  }

  // ── Internal: create window DOM ─────────────
  /** @param {import('./WindowManager.ts').WinState} state @param {HTMLElement} contentEl */
  _createWindowDOM(state, contentEl) {
    const wrapper = document.createElement('div');
    wrapper.id = `win-${state.id}`;
    wrapper.className = 'os-window';
    Object.assign(wrapper.style, {
      transform: `translate(${state.x}px, ${state.y}px)`,
      width: `${state.width}px`,
      height: `${state.height}px`,
      minWidth: `${state.minWidth}px`,
      minHeight: `${state.minHeight}px`,
      zIndex: String(state.zIndex),
    });
    wrapper.setAttribute('role', 'dialog');
    wrapper.setAttribute('aria-label', state.title);

    // Titlebar
    const tb = document.createElement('div');
    tb.className = 'os-window__titlebar';

    const btns = document.createElement('div');
    btns.className = 'os-window__traffic-lights';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'os-window__btn os-window__btn--close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.addEventListener('click', (e) => { e.stopPropagation(); this.close(state.id); });
    btns.appendChild(closeBtn);
    tb.appendChild(btns);

    const title = document.createElement('span');
    title.className = 'os-window__title';
    title.textContent = state.title;
    tb.appendChild(title);

    const spacer = document.createElement('div');
    spacer.className = 'os-window__spacer';
    tb.appendChild(spacer);
    wrapper.appendChild(tb);

    // Body
    const body = document.createElement('div');
    body.className = 'os-window__body';
    body.appendChild(contentEl);
    wrapper.appendChild(body);

    // Events
    wrapper.addEventListener('pointerdown', () => this.focus(state.id));
    tb.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.os-window__btn')) return;
      this._onDragStart(e, state.id);
    });

    return wrapper;
  }

  _bindGlobalEvents() {
    document.addEventListener('pointermove', this._onDragMove);
    document.addEventListener('pointerup', this._onDragEnd);
    document.addEventListener('pointercancel', this._onDragEnd);
    window.addEventListener('beforeunload', () => this._saveLayout());
  }

  // ── Dock helpers ────────────────────────────
  /** @param {string} id @param {boolean} open */
  _updateDock(id, open) {
    const btn = document.querySelector(`[data-dock-id="${id}"]`);
    if (btn) btn.classList.toggle('dock__item--open', open);
  }

  _updateDockActive() {
    document.querySelectorAll('.dock__item--open').forEach(el => {
      el.classList.toggle('dock__item--active', el.getAttribute('data-dock-id') === this.activeId);
    });
  }

  // ── Z-index normalization ───────────────────
  _normalizeZ() {
    const sorted = [...this.wins.values()].sort((a, b) => a.zIndex - b.zIndex);
    let z = 100;
    for (const s of sorted) {
      s.zIndex = z++;
      const el = document.getElementById(`win-${s.id}`);
      if (el) el.style.zIndex = String(s.zIndex);
    }
    this.nextZ = z;
  }

  // ── Persistence ─────────────────────────────
  _loadLayout() {
    try { const raw = localStorage.getItem(LAYOUT_KEY); if (raw) return JSON.parse(raw); } catch {}
    return {};
  }

  _saveLayout() {
    const dump = {};
    for (const [id, s] of this.wins) {
      dump[id] = { x: s.x, y: s.y, w: s.width, h: s.height };
    }
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(dump)); } catch {}
  }

  // ── Public query ────────────────────────────
  /** @param {string} id */
  isOpen(id) { return this.wins.has(id); }

  /** @param {string} id */
  getState(id) { return this.wins.get(id); }
}
