function fotoDecider() {
  return {
    folder: '',
    folderPath: '',
    files: [],
    index1: 0,
    index2: 1,
    focusedPane: 1,
    marks: {},
    showBash: false,
    bashCommands: {},
    bashFiles: {},
    fullImageCache: new Map(),
    thumbCache: new Set(),
    maxFullImages: 15,
    panzoomInstances: { 1: null, 2: null },
    markNames: {
      1: 'Keep', 2: 'Review', 3: 'Delete', 4: 'Similar',
      5: 'Backup', 6: 'Edit', 7: 'HDR', 8: 'Bracket', 9: 'Other'
    },

    async init() {
      window.app = this;
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
          this.focusedPane = 1;
          this.fullImageCache.clear();
          this.thumbCache = new Set();
          this.updatePreload();
          this.$nextTick(() => this.initPanzoom());
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
      this.focusedPane = 1;
      this.fullImageCache.clear();
      this.thumbCache = new Set();
      [1, 2].forEach(p => {
        if (this.panzoomInstances[p]) {
          this.panzoomInstances[p].destroy();
          this.panzoomInstances[p] = null;
        }
      });
    },

    initPanzoom() {
      this.setupPanzoom();
    },

    setupPanzoom() {
      [1, 2].forEach(pane => {
        const content = document.querySelector(`.pane[data-pane="${pane}"] .pane-content`);
        const img = content?.querySelector('img');
        if (!img || !content) return;

        if (this.panzoomInstances[pane]) {
          this.panzoomInstances[pane].destroy();
        }

        const minScale = this.getMinScale(img, pane);
        
        const pz = Panzoom(content, {
          maxScale: 10,
          minScale: minScale,
          bounds: true,
          boundsPadding: 0,
          cursor: 'grab'
        });

        const paneEl = content.closest('.pane');
        paneEl.addEventListener('wheel', pz.zoomWithWheel);

        this.panzoomInstances[pane] = pz;
      });
    },

    getMinScale(img, pane) {
      if (!img.naturalWidth || !img.naturalHeight) return 1;
      const paneEl = document.querySelector(`.pane[data-pane="${pane}"]`);
      const rect = paneEl.getBoundingClientRect();
      const scaleX = rect.width / img.naturalWidth;
      const scaleY = rect.height / img.naturalHeight;
      return Math.min(scaleX, scaleY, 1);
    },

    handleResize() {
      [1, 2].forEach(pane => this.updateMinScale(pane));
    },

    updateMinScale(pane) {
      const img = document.querySelector(`.pane[data-pane="${pane}"] .pane-content img`);
      if (!img || !img.naturalWidth) return;
      
      const pz = this.panzoomInstances[pane];
      if (!pz) return;
      
      const minScale = this.getMinScale(img, pane);
      if (pz.scale < minScale) {
        pz.zoom(minScale, { animate: true });
      }
      if (pz.options) {
        pz.options.minScale = minScale;
      }
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
      
      this.$nextTick(() => {
        this.updateMinScale(this.focusedPane);
      });
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
      document.querySelectorAll('.pane').forEach((el, i) => {
        el.classList.toggle('focused', (i + 1) === pane);
      });
      this.scrollPreview();
    },

    getCurrentIndex() {
      return this.focusedPane === 1 ? this.index1 : this.index2;
    },

    getPaneIndex(pane) {
      return pane === 1 ? this.index1 : this.index2;
    },

    getImageUrl(index) {
      if (index < 0 || index >= this.files.length) return null;
      const file = this.files[index];
      return `/api/display/${encodeURIComponent(file.id)}`;
    },

    getPaneImageUrl(pane) {
      return this.getImageUrl(this.getPaneIndex(pane));
    },

    handleKey(e) {
      if (e.target.tagName === 'INPUT') return;
      
      const pz = this.panzoomInstances[this.focusedPane];
      
      switch (e.key) {
        case ' ':
          e.preventDefault();
          e.stopPropagation();
          this.goTo(this.getCurrentIndex() + 1);
          break;
        case 'Backspace':
          e.preventDefault();
          e.stopPropagation();
          this.goTo(this.getCurrentIndex() - 1);
          break;
        case 'Tab':
          e.preventDefault();
          this.focusPane(this.focusedPane === 1 ? 2 : 1);
          break;
        case 'ArrowLeft':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            this.focusPane(this.focusedPane === 1 ? 2 : 1);
          } else if (pz) {
            e.preventDefault();
            pz.pan(30, 0);
          }
          break;
        case 'ArrowRight':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            this.focusPane(this.focusedPane === 1 ? 2 : 1);
          } else if (pz) {
            e.preventDefault();
            pz.pan(-30, 0);
          }
          break;
        case 'ArrowUp':
          if (pz) {
            e.preventDefault();
            pz.pan(0, 30);
          }
          break;
        case 'ArrowDown':
          if (pz) {
            e.preventDefault();
            pz.pan(0, -30);
          }
          break;
        case '+':
        case '=':
          if (pz) {
            e.preventDefault();
            const rect = pz.element.getBoundingClientRect();
            pz.zoom(1.2, { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 });
          }
          break;
        case '-':
          if (pz) {
            e.preventDefault();
            const rect = pz.element.getBoundingClientRect();
            pz.zoom(0.8, { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 });
          }
          break;
        case 'Escape':
          if (pz) {
            pz.reset();
          }
          break;
        default:
          if (e.key >= '1' && e.key <= '9') {
            e.preventDefault();
            this.markCurrentImage(parseInt(e.key));
          }
      }
    },

    async markCurrentImage(mark) {
      const idx = this.getCurrentIndex();
      const file = this.files[idx];
      if (!file) return;

      if (!this.marks[file.id]) {
        this.marks[file.id] = [];
      }
      
      const marks = this.marks[file.id];
      const idx2 = marks.indexOf(mark);
      if (idx2 >= 0) {
        marks.splice(idx2, 1);
        if (marks.length === 0) {
          delete this.marks[file.id];
        }
      } else {
        marks.push(mark);
      }

      await this.saveMarks();
    },

    getMarkCount(mark) {
      let count = 0;
      Object.values(this.marks).forEach(marks => {
        if (Array.isArray(marks) && marks.includes(mark)) count++;
      });
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
      
      const thumbPreloadCount = 100;
      const fullPreloadCount = 10;
      const indices = [this.index1, this.index2];
      
      const preloadThumb = (idx) => {
        const file = this.files[idx];
        if (!file) return;
        const url = `/api/thumbnail/${encodeURIComponent(file.id)}`;
        if (!this.thumbCache) this.thumbCache = new Set();
        if (!this.thumbCache.has(url)) {
          const img = new Image();
          img.src = url;
          this.thumbCache.add(url);
        }
      };
      
      indices.forEach(idx => {
        for (let i = Math.max(0, idx - 25); i < Math.min(this.files.length, idx + thumbPreloadCount); i++) {
          preloadThumb(i);
        }
      });
      
      indices.forEach(startIdx => {
        for (let i = startIdx; i < Math.min(this.files.length, startIdx + fullPreloadCount); i++) {
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
      setInterval(() => this.updatePreload(), 5000);
    },

    getPaneMark(pane) {
      const idx = this.getPaneIndex(pane);
      const file = this.files[idx];
      if (!file) return null;
      const marks = this.marks[file.id];
      return marks ? marks.join(',') : null;
    },

    getPaneName(pane) {
      return this.files[this.getPaneIndex(pane)]?.name || '';
    }
  };
}

// Global resize handler
let resizeTimeout;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    if (window.app && window.app.handleResize) {
      window.app.handleResize();
    }
  }, 200);
});
