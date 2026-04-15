function fotoDecider() {
  return {
    folder: '',
    folderPath: '',
    files: [],
    index1: 0,
    index2: 1,
    focusedPane: 1,
    marks: {},
    pane1Transform: { x: 0, y: 0, scale: 1 },
    pane2Transform: { x: 0, y: 0, scale: 1 },
    showBash: false,
    bashCommands: {},
    bashFiles: {},
    fullImageCache: new Map(),
    maxFullImages: 15,
    markNames: {
      1: 'Keep', 2: 'Review', 3: 'Delete', 4: 'Similar',
      5: 'Backup', 6: 'Edit', 7: 'HDR', 8: 'Bracket', 9: 'Other'
    },

    async init() {
      try {
        const resp = await fetch('/api/folder');
        const data = await resp.json();
        if (data.folder) {
          this.folder = data.folder;
          this.files = data.files;
        }
      } catch (err) {
        console.error('Failed to load folder:', err);
      }

      document.addEventListener('keydown', (e) => this.handleKey(e), true);
      window.addEventListener('resize', () => this.handleResize());
      this.preloadLoop();
    },

    async loadFolder() {
      if (!this.folderPath) return;
      try {
        const resp = await fetch('/api/folder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: this.folderPath })
        });
        const data = await resp.json();
        if (data.folder) {
          this.folder = data.folder;
          this.files = data.files;
          this.marks = {};
          this.index1 = 0;
          this.index2 = Math.min(1, this.files.length - 1);
          this.pane1Transform = { x: 0, y: 0, scale: 1 };
          this.pane2Transform = { x: 0, y: 0, scale: 1 };
          this.fullImageCache.clear();
          this.updatePreload();
        }
      } catch (err) {
        console.error('Failed to load folder:', err);
      }
    },

    clearFolder() {
      this.folder = '';
      this.files = [];
      this.marks = {};
      this.folderPath = '';
      this.index1 = 0;
      this.index2 = 1;
      this.fullImageCache.clear();
    },

    goTo(index) {
      if (index < 0 || index >= this.files.length) return;
      if (this.focusedPane === 1) {
        this.index1 = index;
      } else {
        this.index2 = index;
      }
      this.updatePreload();
      this.scrollPreview();
    },

    scrollPreview() {
      this.$nextTick(() => {
        const container = document.getElementById('previewContainer');
        const strip = document.getElementById('previewStrip');
        if (!strip) return;
        const idx = this.focusedPane === 1 ? this.index1 : this.index2;
        const thumbs = strip.querySelectorAll('.preview-thumb');
        if (thumbs[idx]) {
          const thumb = thumbs[idx];
          const containerRect = container.getBoundingClientRect();
          const thumbRect = thumb.getBoundingClientRect();
          const offset = thumbRect.left - containerRect.left + container.scrollLeft - containerRect.width / 2 + thumbRect.width / 2;
          container.scrollTo({ left: offset, behavior: 'smooth' });
        }
      });
    },

    focusPane(pane) {
      this.focusedPane = pane;
      this.scrollPreview();
    },

    getCurrentIndex() {
      return this.focusedPane === 1 ? this.index1 : this.index2;
    },

    getPaneIndex(pane) {
      return pane === 1 ? this.index1 : this.index2;
    },

    fitImageToPane(pane) {
      const img = document.querySelector(`.pane[data-pane="${pane}"] .pane-content img`);
      if (!img || !img.naturalWidth || !img.naturalHeight) return;
      
      const container = img.parentElement;
      const containerRect = container.getBoundingClientRect();
      const scaleX = containerRect.width / img.naturalWidth;
      const scaleY = containerRect.height / img.naturalHeight;
      const minScale = Math.min(scaleX, scaleY, 1);
      
      if (pane === 1) {
        this.pane1Transform = { x: 0, y: 0, scale: minScale, minScale: minScale };
      } else {
        this.pane2Transform = { x: 0, y: 0, scale: minScale, minScale: minScale };
      }
    },

    handleResize() {
      this.fitImageToPane(1);
      this.fitImageToPane(2);
    },

    getImageUrl(index) {
      if (index < 0 || index >= this.files.length) return null;
      const file = this.files[index];
      return `/api/image/${encodeURIComponent(file.id)}`;
    },

    getPaneImageUrl(pane) {
      return this.getImageUrl(this.getPaneIndex(pane));
    },

    getPaneStyle(pane) {
      const t = pane === 1 ? this.pane1Transform : this.pane2Transform;
      return `transform: translate(calc(-50% + ${t.x}px), calc(-50% + ${t.y}px)) scale(${t.scale})`;
    },

    zoomAtMouse(pane, event) {
      const delta = event.deltaY;
      const factor = delta > 0 ? 0.9 : 1.1;
      
      const t = pane === 1 ? this.pane1Transform : this.pane2Transform;
      const oldScale = t.scale;
      const newScale = Math.max(t.minScale || 0.1, Math.min(10, oldScale * factor));
      t.scale = newScale;
      
      this.showZoomIndicator(Math.round(newScale * 100));
    },

    showZoomIndicator(percent) {
      const indicator = document.getElementById('zoomIndicator');
      if (indicator) {
        indicator.textContent = percent + '%';
        indicator.classList.add('show');
        clearTimeout(this.zoomTimeout);
        this.zoomTimeout = setTimeout(() => {
          indicator.classList.remove('show');
        }, 1000);
      }
    },

    zoomPane(pane, factor) {
      const t = pane === 1 ? this.pane1Transform : this.pane2Transform;
      t.scale = Math.max(t.minScale || 0.1, Math.min(10, t.scale * factor));
      this.showZoomIndicator(Math.round(t.scale * 100));
    },

    panPane(dx, dy) {
      if (this.focusedPane === 1) {
        this.pane1Transform.x += dx;
        this.pane1Transform.y += dy;
      } else {
        this.pane2Transform.x += dx;
        this.pane2Transform.y += dy;
      }
    },

    handleDragStart(pane, event) {
      event.preventDefault();
      this.dragPane = pane;
      this.dragStartX = event.clientX;
      this.dragStartY = event.clientY;
      this.dragStartTransform = { ...(pane === 1 ? this.pane1Transform : this.pane2Transform) };
      const self = this;
      document.addEventListener('mousemove', function(e) { self.handleDragMove(e); });
      document.addEventListener('mouseup', function(e) { self.handleDragEnd(e); });
    },

    handleDragMove(event) {
      if (!this.dragPane) return;
      const dx = event.clientX - this.dragStartX;
      const dy = event.clientY - this.dragStartY;
      const t = this.dragPane === 1 ? this.pane1Transform : this.pane2Transform;
      t.x = this.dragStartTransform.x + dx;
      t.y = this.dragStartTransform.y + dy;
    },

    handleDragEnd(event) {
      this.dragPane = null;
    },

    handleKey(e) {
      if (e.target.tagName === 'INPUT') return;
      
      if (e.key === ' ' || e.key === 'Backspace') {
        e.preventDefault();
        e.stopPropagation();
        const idx = this.getCurrentIndex();
        if (e.key === ' ') {
          this.goTo(idx + 1);
        } else {
          this.goTo(idx - 1);
        }
        return;
      }

      switch (e.key) {
        case 'Tab':
          e.preventDefault();
          this.focusPane(this.focusedPane === 1 ? 2 : 1);
          this.scrollPreview();
          break;
        case 'ArrowLeft':
          if (e.ctrlKey || e.metaKey) {
            this.focusPane(this.focusedPane === 1 ? 2 : 1);
            this.scrollPreview();
          } else {
            this.panPane(e.shiftKey ? -10 : -30, 0);
          }
          break;
        case 'ArrowRight':
          if (e.ctrlKey || e.metaKey) {
            this.focusPane(this.focusedPane === 1 ? 2 : 1);
            this.scrollPreview();
          } else {
            this.panPane(e.shiftKey ? 10 : 30, 0);
          }
          break;
        case 'ArrowUp':
          this.panPane(0, e.shiftKey ? 10 : 30);
          break;
        case 'ArrowDown':
          this.panPane(0, e.shiftKey ? -10 : -30);
          break;
        case '+':
        case '=':
          this.zoomPane(this.focusedPane, 1.2);
          break;
        case '-':
          this.zoomPane(this.focusedPane, 0.8);
          break;
        case 'Escape':
          const pane = this.focusedPane;
          if (pane === 1) {
            this.pane1Transform = { x: 0, y: 0, scale: 1 };
          } else {
            this.pane2Transform = { x: 0, y: 0, scale: 1 };
          }
          break;
        default:
          if (e.key >= '1' && e.key <= '9') {
            this.markCurrentImage(parseInt(e.key));
          }
      }
    },

    async markCurrentImage(mark) {
      const idx = this.getCurrentIndex();
      const file = this.files[idx];
      if (!file) return;

      if (this.marks[file.id] === mark) {
        delete this.marks[file.id];
      } else {
        this.marks[file.id] = mark;
      }

      await this.saveMarks();
    },

    getMarkCount(mark) {
      const count = Object.values(this.marks).filter(m => m === mark).length;
      return count || '-';
    },

    async saveMarks() {
      try {
        await fetch('/api/marks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ marks: this.marks })
        });
      } catch (err) {
        console.error('Failed to save marks:', err);
      }
    },

    async clearMarks() {
      if (!confirm('Clear all marks?')) return;
      this.marks = {};
      try {
        await fetch('/api/marks/clear', { method: 'POST' });
      } catch (err) {
        console.error('Failed to clear marks:', err);
      }
    },

    async openBash() {
      try {
        const resp = await fetch('/api/bash');
        const data = await resp.json();
        this.bashCommands = data.commands || {};
        this.bashFiles = data.files_by_mark || {};
        this.showBash = true;
      } catch (err) {
        console.error('Failed to load bash commands:', err);
      }
    },

    copyCommand(cmd) {
      navigator.clipboard.writeText(cmd).then(() => {
        const btn = event.target;
        const orig = btn.textContent;
        btn.textContent = 'Copied!';
        btn.style.background = 'var(--success)';
        setTimeout(() => {
          btn.textContent = orig;
          btn.style.background = '';
        }, 1500);
      });
    },

    updatePreload() {
      if (this.files.length === 0) return;
      
      const preloadCount = 10;
      const indices = [this.index1, this.index2];
      
      indices.forEach(startIdx => {
        for (let i = startIdx; i < Math.min(this.files.length, startIdx + preloadCount); i++) {
          const file = this.files[i];
          if (!this.fullImageCache.has(file.id)) {
            const img = new Image();
            img.src = this.getImageUrl(i);
            this.fullImageCache.set(file.id, true);
          }
        }
      });
      
      if (this.fullImageCache.size > this.maxFullImages) {
        const toDelete = [];
        for (const id of this.fullImageCache.keys()) {
          const idx = this.files.findIndex(f => f.id === id);
          const farFromBoth = Math.abs(idx - this.index1) > this.maxFullImages && Math.abs(idx - this.index2) > this.maxFullImages;
          if (idx === -1 || farFromBoth) {
            toDelete.push(id);
          }
        }
        toDelete.slice(0, 5).forEach(id => this.fullImageCache.delete(id));
      }
    },

    preloadLoop() {
      setInterval(() => this.updatePreload(), 3000);
    },

    getPaneMark(pane) {
      const idx = this.getPaneIndex(pane);
      const file = this.files[idx];
      return file ? (this.marks[file.id] || null) : null;
    },

    getPaneName(pane) {
      return this.files[this.getPaneIndex(pane)]?.name || '';
    }
  };
}
