// ============================================
// HELICASE DESKTOP.OS — Window Manager
// Vanilla JS singleton. Manages window lifecycles,
// drag, focus, z-index, and localStorage persistence.
// ============================================

export interface WinState {
  id: string
  title: string
  icon: string            // emoji or text label for dock
  x: number
  y: number
  width: number
  height: number
  zIndex: number
  minWidth: number
  minHeight: number
}

export interface WinDescriptor {
  id: string
  title: string
  icon: string
  x?: number
  y?: number
  center?: boolean
  width: number
  height: number
  minWidth?: number
  minHeight?: number
  content: (win: WinState) => HTMLElement
}

type LayoutDump = Record<string, { x: number; y: number; w: number; h: number }>

const LAYOUT_KEY = 'helicase-desktop-layout-v2'
const MAX_Z = 9999

export class WindowManager {
  private static instance: WindowManager

  readonly el: HTMLElement           // desktop container
  private wins: Map<string, WinState> = new Map()
  private activeId: string | null = null
  private nextZ = 100
  private descriptors: Map<string, WinDescriptor> = new Map()

  // ── drag state ──────────────────────────
  private drag: {
    id: string
    startX: number; startY: number
    winX: number; winY: number
  } | null = null

  private constructor(el: HTMLElement) {
    this.el = el
    this.bindGlobalEvents()
  }

  static init(el: HTMLElement): WindowManager {
    if (!WindowManager.instance) {
      WindowManager.instance = new WindowManager(el)
    }
    return WindowManager.instance
  }

  static get(): WindowManager {
    return WindowManager.instance
  }

  // ── Register a window type ──────────────
  register(desc: WinDescriptor): void {
    this.descriptors.set(desc.id, desc)
  }

  // ── Open ────────────────────────────────
  open(id: string): WinState | null {
    const desc = this.descriptors.get(id)
    if (!desc) return null

    // Already open? Focus it
    const existing = this.wins.get(id)
    if (existing) {
      // If minimized, restore
      const winEl = document.getElementById(`win-${id}`)
      if (winEl) {
        winEl.style.display = ''
        winEl.classList.remove('win--minimized')
      }
      this.focus(id)
      return existing
    }

    // Restore saved layout or use defaults with slight cascade
    const saved = this.loadLayout()
    const fromSave = saved[id]
    const cascade = this.wins.size * 24
    const w = fromSave?.w ?? desc.width
    const h = fromSave?.h ?? desc.height
    const defaultX = desc.center ? Math.max(24, Math.round((window.innerWidth - w) / 2)) : 80 + cascade
    const defaultY = desc.center ? Math.max(44, Math.round((window.innerHeight - h) / 2) - 20) : 60 + cascade
    const x = fromSave?.x ?? (desc.x ?? defaultX)
    const y = fromSave?.y ?? (desc.y ?? defaultY)

    const state: WinState = {
      id,
      title: desc.title,
      icon: desc.icon,
      x, y,
      width: w,
      height: h,
      zIndex: this.nextZ++,
      minWidth: desc.minWidth ?? 240,
      minHeight: desc.minHeight ?? 160,
    }

    this.wins.set(id, state)

    // Build DOM
    const winEl = this.createWindowDOM(state, desc.content(state))
    this.el.appendChild(winEl)

    // Animate in
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        winEl.classList.add('win--open')
      })
    })

    // Focus after animation
    setTimeout(() => this.focus(id), 50)

    // Update dock indicator
    this.updateDock(id, true)

    return state
  }

  // ── Close ───────────────────────────────
  close(id: string): void {
    const winEl = document.getElementById(`win-${id}`)
    if (!winEl) return

    winEl.classList.remove('win--open')
    winEl.classList.add('win--closing')

    const onEnd = () => {
      winEl.removeEventListener('transitionend', onEnd)
      if (winEl.parentNode) winEl.parentNode.removeChild(winEl)
      this.wins.delete(id)
      if (this.activeId === id) this.activeId = null
      this.updateDock(id, false)
      this.saveLayout()
    }
    winEl.addEventListener('transitionend', onEnd)
    // Fallback in case transitionend never fires
    setTimeout(onEnd, 350)
  }

  // ── Focus ───────────────────────────────
  focus(id: string): void {
    const state = this.wins.get(id)
    if (!state) return

    state.zIndex = this.nextZ++
    if (this.nextZ > MAX_Z) this.normalizeZ()

    const winEl = document.getElementById(`win-${id}`)
    if (winEl) {
      winEl.style.zIndex = String(state.zIndex)
      winEl.classList.add('win--focused')
    }

    // Unfocus others
    if (this.activeId && this.activeId !== id) {
      const prev = document.getElementById(`win-${this.activeId}`)
      if (prev) prev.classList.remove('win--focused')
    }

    this.activeId = id
    this.updateDockActive()
  }

  // ── Drag ────────────────────────────────
  private onDragStart = (e: PointerEvent, id: string) => {
    const state = this.wins.get(id)
    if (!state) return
    this.drag = {
      id,
      startX: e.clientX,
      startY: e.clientY,
      winX: state.x,
      winY: state.y,
    }
    const winEl = document.getElementById(`win-${id}`)
    if (winEl) {
      winEl.classList.add('win--dragging')
      winEl.setPointerCapture?.(e.pointerId)
    }
  }

  private onDragMove = (e: PointerEvent) => {
    if (!this.drag) return
    const state = this.wins.get(this.drag.id)
    if (!state) return

    const dx = e.clientX - this.drag.startX
    const dy = e.clientY - this.drag.startY
    const nx = this.drag.winX + dx
    const ny = this.drag.winY + dy

    // Constrain: keep at least 40px of titlebar visible
    const minVis = 40
    const maxX = window.innerWidth - minVis
    const maxY = window.innerHeight - minVis

    state.x = Math.max(-state.width + minVis, Math.min(nx, maxX))
    state.y = Math.max(-minVis, Math.min(ny, maxY))

    const winEl = document.getElementById(`win-${this.drag.id}`)
    if (winEl) {
      winEl.style.transform = `translate(${state.x}px, ${state.y}px)`
    }
  }

  private onDragEnd = () => {
    if (!this.drag) return
    const winEl = document.getElementById(`win-${this.drag.id}`)
    if (winEl) {
      winEl.classList.remove('win--dragging')
    }
    this.drag = null
    this.saveLayout()
  }

  // ── Internal helpers ────────────────────
  private createWindowDOM(state: WinState, contentEl: HTMLElement): HTMLElement {
    const wrapper = document.createElement('div')
    wrapper.id = `win-${state.id}`
    wrapper.className = 'os-window'
    wrapper.style.cssText = `
      transform: translate(${state.x}px, ${state.y}px);
      width: ${state.width}px;
      height: ${state.height}px;
      min-width: ${state.minWidth}px;
      min-height: ${state.minHeight}px;
      z-index: ${state.zIndex};
    `
    wrapper.setAttribute('role', 'dialog')
    wrapper.setAttribute('aria-label', state.title)

    // Titlebar
    const tb = document.createElement('div')
    tb.className = 'os-window__titlebar'

    // Traffic light buttons
    const btns = document.createElement('div')
    btns.className = 'os-window__traffic-lights'
    const closeBtn = document.createElement('button')
    closeBtn.className = 'os-window__btn os-window__btn--close'
    closeBtn.setAttribute('aria-label', 'Close')
    closeBtn.addEventListener('click', (e) => { e.stopPropagation(); this.close(state.id) })
    btns.appendChild(closeBtn)
    tb.appendChild(btns)

    // Title
    const title = document.createElement('span')
    title.className = 'os-window__title'
    title.textContent = state.title
    tb.appendChild(title)

    // Spacer for symmetry
    const spacer = document.createElement('div')
    spacer.className = 'os-window__spacer'
    tb.appendChild(spacer)

    wrapper.appendChild(tb)

    // Content
    const body = document.createElement('div')
    body.className = 'os-window__body'
    body.appendChild(contentEl)
    wrapper.appendChild(body)

    // ── Events ──────────────────────────────
    // Focus on any interaction with the window
    wrapper.addEventListener('pointerdown', () => this.focus(state.id))

    // Drag from titlebar
    tb.addEventListener('pointerdown', (e) => {
      // Don't start drag on buttons
      if ((e.target as HTMLElement).closest('.os-window__btn')) return
      this.onDragStart(e, state.id)
    })

    return wrapper
  }

  private bindGlobalEvents(): void {
    document.addEventListener('pointermove', (e) => this.onDragMove(e))
    document.addEventListener('pointerup', () => this.onDragEnd())
    document.addEventListener('pointercancel', () => this.onDragEnd())

    // Save layout before unload
    window.addEventListener('beforeunload', () => this.saveLayout())
  }

  // ── Dock helpers ─────────────────────────
  private updateDock(id: string, open: boolean): void {
    const dockBtn = document.querySelector(`[data-dock-id="${id}"]`)
    if (dockBtn) {
      dockBtn.classList.toggle('dock__item--open', open)
    }
  }

  private updateDockActive(): void {
    document.querySelectorAll('.dock__item--open').forEach(el => {
      el.classList.toggle('dock__item--active', el.getAttribute('data-dock-id') === this.activeId)
    })
  }

  // ── Z-index normalization ───────────────
  private normalizeZ(): void {
    const sorted = [...this.wins.values()].sort((a, b) => a.zIndex - b.zIndex)
    let z = 100
    for (const s of sorted) {
      s.zIndex = z++
      const el = document.getElementById(`win-${s.id}`)
      if (el) el.style.zIndex = String(s.zIndex)
    }
    this.nextZ = z
  }

  // ── Persistence ──────────────────────────
  private loadLayout(): LayoutDump {
    try {
      const raw = localStorage.getItem(LAYOUT_KEY)
      if (raw) return JSON.parse(raw)
    } catch {}
    return {}
  }

  private saveLayout(): void {
    const dump: LayoutDump = {}
    for (const [id, s] of this.wins) {
      dump[id] = { x: s.x, y: s.y, w: s.width, h: s.height }
    }
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(dump)) } catch {}
  }

  // ── Public query ─────────────────────────
  isOpen(id: string): boolean {
    return this.wins.has(id)
  }

  getState(id: string): WinState | undefined {
    return this.wins.get(id)
  }
}
