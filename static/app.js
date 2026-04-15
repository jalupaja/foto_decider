function fotoDecider() {
  return {
    folder: '',
    folderPath: '',
    files: [],
    currentIndex: 0,
    focusedPane: 1,
    marks: {},
    pane1Transform: { x: 0, y: 0, scale: 1 },
    pane2Transform: { x: 0, y: 0, scale: 1 },
    showBash: false,
    bashCommands: {},
    bashFiles: {},
    preloadQueue: [],
    thumbnailCache: new Map(),
    fullImageCache: new Map(),
    maxFullImages: 15,
    maxThumbnails: 300,
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

      document.addEventListener('keydown', (e) => this.handleKey(e));
      window.addEventListener('resize', () => this.handleResize());
      
      this.processPreload();
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
          this.currentIndex = 0;
          this.pane1Transform = { x: 0, y: 0, scale: 1 };
          this.pane2Transform = { x: 0, y: 0, scale: 1 };
          this.thumbnailCache.clear();
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
      this.currentIndex = 0;
      this.thumbnailCache.clear();
      this.fullImageCache.clear();
    },

    goTo(index) {
      if (index < 0 || index >= this.files.length) return;
      this.currentIndex = index;
      this.pane1Transform = { x: 0, y: 0, scale: 1 };
      this.pane2Transform = { x: 0, y: 0, scale: 1 };
      this.updatePreload();
      this.scrollPreview();
    },

    scrollPreview() {
      this.$nextTick(() => {
        const container = document.getElementById('previewContainer');
        const strip = document.getElementById('previewStrip');
        if (!strip) return;
        const thumbs = strip.querySelectorAll('.preview-thumb');
        if (thumbs[this.currentIndex]) {
          const thumb = thumbs[this.currentIndex];
          const containerRect = container.getBoundingClientRect();
          const thumbRect = thumb.getBoundingClientRect();
          const offset = thumbRect.left - containerRect.left + container.scrollLeft - containerRect.width / 2 + thumbRect.width / 2;
          container.scrollTo({ left: offset, behavior: 'smooth' });
        }
      });
    },

    focusPane(pane) {
      this.focusedPane = pane;
    },

    fitImageToPane(pane) {
      const img = document.querySelector(`.pane[data-pane="${pane}"] .pane-content img`);
      if (!img || !img.naturalWidth || !img.naturalHeight) return;
      
      const container = img.parentElement;
      const containerRect = container.getBoundingClientRect();
      const scaleX = containerRect.width / img.naturalWidth;
      const scaleY = containerRect.height / img.naturalHeight;
      const scale = Math.min(scaleX, scaleY, 1);
      
      if (pane === 1) {
        this.pane1Transform = { x: 0, y: 0, scale: scale };
      } else {
        this.pane2Transform = { x: 0, y: 0, scale: scale };
      }
    },

    handleResize() {
      this.fitImageToPane(1);
      this.fitImageToPane(2);
    },

    getImageUrl(index) {
      if (index < 0 || index >= this.files.length) return null;
      const file = this.files[index];
      
      if (this.fullImageCache.has(file.id)) {
        return this.fullImageCache.get(file.id);
      }
      
      return `/api/image/${encodeURIComponent(file.id)}`;
    },

    getCurrentImageUrl() {
      return this.getImageUrl(this.currentIndex);
    },

    getPaneStyle(pane) {
      const t = pane === 1 ? this.pane1Transform : this.pane2Transform;
      return `transform: translate(calc(-50% + ${t.x}px), calc(-50% + ${t.y}px)) scale(${t.scale})`;
    },

    zoomAtMouse(pane, event) {
      const delta = event.deltaY;
      const factor = delta > 0 ? 0.9 : 1.1;
      
      const img = document.querySelector(`.pane[data-pane="${pane}"] .pane-content img`);
      if (!img) return;
      
      const container = img.parentElement;
      const containerRect = container.getBoundingClientRect();
      const rect = img.getBoundingClientRect();
      
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      
      const absMouseX = mouseX * img.naturalWidth / rect.width;
      const absMouseY = mouseY * img.naturalHeight / rect.height;
      
      const t = pane === 1 ? this.pane1Transform : this.pane2Transform;
      const oldScale = t.scale;
      const newScale = Math.max(0.1, Math.min(10, oldScale * factor));
      
      const scaleChange = newScale / oldScale;
      t.x = mouseX - (mouseX - t.x) * scaleChange;
      t.y = mouseY - (mouseY - t.y) * scaleChange;
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
      t.scale = Math.max(0.1, Math.min(10, t.scale * factor));
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

    handleKey(e) {
      if (e.target.tagName === 'INPUT') return;

      switch (e.key) {
        case 'Tab':
          e.preventDefault();
          this.focusPane(this.focusedPane === 1 ? 2 : 1);
          break;
        case ' ':
          e.preventDefault();
          this.goTo(this.currentIndex + 1);
          break;
        case 'Backspace':
          e.preventDefault();
          this.goTo(this.currentIndex - 1);
          break;
        case 'ArrowLeft':
          if (e.ctrlKey || e.metaKey) {
            this.focusPane(this.focusedPane === 1 ? 2 : 1);
          } else {
            this.panPane(e.shiftKey ? -10 : -30, 0);
          }
          break;
        case 'ArrowRight':
          if (e.ctrlKey || e.metaKey) {
            this.focusPane(this.focusedPane === 1 ? 2 : 1);
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
          if (this.focusedPane === 1) {
            this.pane1Transform = { x: 0, y: 0, scale: 1 };
          } else {
            this.pane2Transform = { x: 0, y: 0, scale: 1 };
          }
          break;
        default:
          if (e.key >= '1' && e.key <= '9') {
            this.markImage(parseInt(e.key));
          }
      }
    },

    async markImage(mark) {
      const file = this.files[this.currentIndex];
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
      const startIdx = this.currentIndex;
      const endIdx = Math.min(this.files.length, startIdx + preloadCount);
      
      for (let i = startIdx; i < endIdx; i++) {
        const file = this.files[i];
        
        if (!this.fullImageCache.has(file.id)) {
          const img = new Image();
          img.src = this.getImageUrl(i);
          this.fullImageCache.set(file.id, this.getImageUrl(i));
        }
      }
      
      if (this.fullImageCache.size > this.maxFullImages) {
        const toDelete = [];
        for (const [id, url] of this.fullImageCache) {
          const idx = this.files.findIndex(f => f.id === id);
          if (idx === -1 || Math.abs(idx - this.currentIndex) > this.maxFullImages) {
            toDelete.push(id);
          }
        }
        toDelete.forEach(id => this.fullImageCache.delete(id));
      }
      
      if (this.thumbnailCache.size > this.maxThumbnails) {
        const toDelete = [];
        for (const [id] of this.thumbnailCache) {
          const idx = this.files.findIndex(f => f.id === id);
          if (idx === -1 || Math.abs(idx - this.currentIndex) > this.maxThumbnails / 2) {
            toDelete.push(id);
          }
        }
        toDelete.slice(0, 50).forEach(id => this.thumbnailCache.delete(id));
      }
    },

    processPreload() {
      setInterval(() => this.updatePreload(), 5000);
    },

    get pane1Mark() {
      if (this.files.length === 0) return null;
      const file = this.files[this.currentIndex];
      return file ? (this.marks[file.id] || null) : null;
    },

    get pane2Mark() {
      return this.pane1Mark;
    }
  };
}
