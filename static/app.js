function fotoDecider() {
  return {
    folder: '',
    folderPath: '',
    files: [],
    index1: 0,
    index2: 1,
    focusedPane: 1,
    pane1ImageUrl: null,
    pane2ImageUrl: null,
    marks: {},
    showBash: false,
    bashCommands: {},
    bashFiles: {},
    bashDest: {},
    bashResults: {},
    searchInput: '',
    searchQuery: '',
    markFilters: { 1: true, 2: true, 3: true, 4: true, 5: true, 6: true, 7: true, 8: true, 9: true, showUnmarked: true },
    filteredIndices: [],
    fullImageCache: new Map(),
    thumbCache: new Set(),
    maxFullImages: 15,
    panzoomInstances: { 1: null, 2: null },
    rotations: {},
    fullscreenPane: null,

    applySearch() {
      this.searchQuery = this.searchInput;
      this.updateFilteredIndices();
    },

    clearSearch() {
      this.searchInput = '';
      this.searchQuery = '';
      this.updateFilteredIndices();
    },

    toggleAllFilters() {
      const allEnabled = this.markFilters[1] && this.markFilters[2] && this.markFilters[3] && 
                        this.markFilters[4] && this.markFilters[5] && this.markFilters[6] && 
                        this.markFilters[7] && this.markFilters[8] && this.markFilters[9] &&
                        this.markFilters.showUnmarked;
      if (allEnabled) {
        for (let i = 1; i <= 9; i++) {
          this.markFilters[i] = false;
        }
        this.markFilters.showUnmarked = false;
      } else {
        for (let i = 1; i <= 9; i++) {
          this.markFilters[i] = true;
        }
        this.markFilters.showUnmarked = true;
      }
      this.updateFilteredIndices();
    },

    updateFilters() {
      this.updateFilteredIndices();
    },

    matchesSearch(filename) {
      if (!this.searchQuery) return true;
      const query = this.searchQuery.toLowerCase();
      const name = filename.toLowerCase();
      if (query.includes('*')) {
        const pattern = query.replace(/\*/g, '.*');
        return new RegExp(pattern).test(name);
      }
      return name.includes(query);
    },

    updateFilteredIndices() {
      if (!this.files || this.files.length === 0) {
        this.filteredIndices = [];
        return;
      }
      const newIndices = [];
      for (let i = 0; i < this.files.length; i++) {
        const f = this.files[i];
        if (this.matchesSearch(f.name) && this.matchesMarkFilter(f.id)) {
          newIndices.push(i);
        }
      }
      this.filteredIndices = newIndices;
    },

    matchesMarkFilter(fileId) {
      const fileMarks = this.marks[fileId] || [];
      if (fileMarks.length === 0) {
        return this.markFilters.showUnmarked;
      }
      return fileMarks.some(m => this.markFilters[m]);
    },

    getPaneFileId(pane) {
      if (pane === 1) {
        return this.files[this.index1]?.id || null;
      } else {
        return this.files[this.index2]?.id || null;
      }
    },

    goToFile(fileId) {
      const idx = this.files.findIndex(f => f.id === fileId);
      if (idx === -1) return;
      if (this.focusedPane === 1) {
        this.index1 = idx;
      } else {
        this.index2 = idx;
      }
      this.updatePreload();
      this.scrollPreview();
    },

    async init() {
      window.app = this;
      this.focusPane(1);
      this.$nextTick(() => this.setupPanzoom());
      try {
        const resp = await fetch('/api/folder');
        const data = await resp.json();
        if (data.folder) {
          this.folder = data.folder;
          this.files = data.files;
          this.updatePreload();
        }
        this.updateFilteredIndices();
      } catch (err) {
        console.error('Failed to load folder:', err);
        this.updateFilteredIndices();
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
          this.pane1ImageUrl = null;
          this.pane2ImageUrl = null;
          this.fullImageCache.clear();
          this.thumbCache = new Set();
          this.updateFilteredIndices();
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
        if (this.panzoomInstances[pane]) return;
        
        const content = document.querySelector(`.pane[data-pane="${pane}"] .pane-content`);
        const img = content?.querySelector('img');
        if (!img || !content) return;

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

    goTo(delta) {
      if (this.filteredIndices.length === 0) return;
      const currentIdx = this.focusedPane === 1 ? this.index1 : this.index2;
      const currentFilteredPos = this.filteredIndices.indexOf(currentIdx);
      let newFilteredPos = currentFilteredPos + delta;
      if (newFilteredPos < 0) newFilteredPos = this.filteredIndices.length - 1;
      if (newFilteredPos >= this.filteredIndices.length) newFilteredPos = 0;
      const newIdx = this.filteredIndices[newFilteredPos];
      if (this.focusedPane === 1) {
        this.index1 = newIdx;
      } else {
        this.index2 = newIdx;
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
      const idx = pane === 1 ? this.index1 : this.index2;
      const file = this.files[idx];
      if (!file) return null;
      if (pane === 1 && this.pane1ImageUrl && this.pane1ImageUrl.endsWith(file.id)) {
        return this.pane1ImageUrl;
      }
      if (pane === 2 && this.pane2ImageUrl && this.pane2ImageUrl.endsWith(file.id)) {
        return this.pane2ImageUrl;
      }
      const url = `/api/display/${encodeURIComponent(file.id)}`;
      if (pane === 1) {
        this.pane1ImageUrl = url;
      } else {
        this.pane2ImageUrl = url;
      }
      return url;
    },

    handleKey(e) {
      if (e.target.tagName === 'INPUT') return;
      
      const pz = this.fullscreenPane 
        ? this.panzoomInstances[this.fullscreenPane] 
        : this.panzoomInstances[this.focusedPane];
      
      switch (e.key) {
        case ' ':
          e.preventDefault();
          e.stopPropagation();
          this.goTo(1);
          break;
        case 'Backspace':
          e.preventDefault();
          e.stopPropagation();
          this.goTo(-1);
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
            pz.pan(30, 0, { animate: true });
          }
          break;
        case 'ArrowRight':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            this.focusPane(this.focusedPane === 1 ? 2 : 1);
          } else if (pz) {
            e.preventDefault();
            pz.pan(-30, 0, { animate: true });
          }
          break;
        case 'ArrowUp':
          if (pz) {
            e.preventDefault();
            pz.pan(0, 30, { animate: true });
          }
          break;
        case 'ArrowDown':
          if (pz) {
            e.preventDefault();
            pz.pan(0, -30, { animate: true });
          }
          break;
        case '+':
        case '=':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            this.syncPanes();
          } else if (pz) {
            e.preventDefault();
            pz.zoom(1.2, { animate: true });
          }
          break;
        case '-':
        case '_':
          if (pz) {
            e.preventDefault();
            pz.zoom(0.8, { animate: true });
          }
          break;
        case 'Escape':
          if (this.showBash) {
            this.showBash = false;
          } else if (this.fullscreenPane) {
            this.toggleFullscreen();
          } else if (pz) {
            pz.reset({ animate: true });
          }
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          this.toggleFullscreen();
          break;
        case 'r':
        case 'R':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            this.rotateCurrentPane(90);
          }
          break;
        case 'l':
        case 'L':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            this.rotateCurrentPane(-90);
          }
          break;
        default:
          if (e.key >= '1' && e.key <= '9') {
            e.preventDefault();
            this.markCurrentImage(parseInt(e.key));
          }
      }
    },

    rotatePane(fileId, degrees) {
      if (!fileId) return;
      const current = this.rotations[fileId] || 0;
      this.rotations[fileId] = (current + degrees + 360) % 360;
    },

    rotateCurrentPane(degrees) {
      const idx = this.getCurrentIndex();
      const file = this.files[idx];
      if (file) {
        this.rotatePane(file.id, degrees);
      }
    },

    getRotation(fileId) {
      return this.rotations[fileId] || 0;
    },

    toggleFullscreen() {
      if (this.fullscreenPane) {
        this.fullscreenPane = null;
      } else {
        this.fullscreenPane = this.focusedPane;
      }
    },

    syncPanes() {
      const otherPane = this.focusedPane === 1 ? 2 : 1;
      const currentIdx = this.focusedPane === 1 ? this.index1 : this.index2;
      if (otherPane === 1) {
        this.index1 = currentIdx;
      } else {
        this.index2 = currentIdx;
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

    getUnmarkedCount() {
      const markedIds = new Set(Object.keys(this.marks));
      let count = 0;
      this.files.forEach(f => {
        if (!markedIds.has(f.id)) count++;
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
        this.bashFiles = {};
        for (const [mark, files] of Object.entries(data.files_by_mark)) {
          this.bashFiles[parseInt(mark)] = files;
        }
        this.showBash = true;
        this.bashDest = {};
        this.bashResults = {};
      } catch (err) {
        console.error('Failed to load bash data:', err);
      }
    },

    async getFilenames(mark) {
      try {
        const resp = await fetch('/api/bash/filenames', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mark: mark, action: 'filenames' })
        });
        const data = await resp.json();
        if (data.success) {
          const copied = await this.copyToClipboard(data.filenames.join(' '));
          if (copied) {
            this.bashResults[mark] = `Copied ${data.filenames.length} filenames`;
          } else {
            this.bashResults[mark] = 'Copy: clipboard not available (try HTTPS)';
          }
        } else {
          this.bashResults[mark] = 'Error: ' + data.message;
        }
      } catch (err) {
        this.bashResults[mark] = 'Error: ' + err.message;
      }
    },

    async bashCopy(mark) {
      try {
        const resp = await fetch('/api/bash/copy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mark: mark, action: 'copy', destination: this.bashDest[mark] })
        });
        const data = await resp.json();
        this.bashResults[mark] = data.success ? `Copied ${data.copied} files` : 'Error: ' + data.message;
      } catch (err) {
        this.bashResults[mark] = 'Error: ' + err.message;
      }
    },

    async bashMove(mark) {
      try {
        const resp = await fetch('/api/bash/move', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mark: mark, action: 'move', destination: this.bashDest[mark] })
        });
        const data = await resp.json();
        this.bashResults[mark] = data.success ? `Moved ${data.moved} files` : 'Error: ' + data.message;
        if (data.success) {
          await this.loadMarks();
        }
      } catch (err) {
        this.bashResults[mark] = 'Error: ' + err.message;
      }
    },

    async bashDelete(mark) {
      if (!confirm(`Delete all files with mark ${mark}?`)) return;
      try {
        const resp = await fetch('/api/bash/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mark: mark, action: 'delete' })
        });
        const data = await resp.json();
        this.bashResults[mark] = data.success ? `Deleted ${data.deleted} files` : 'Error: ' + data.message;
        if (data.success) {
          await this.loadMarks();
        }
      } catch (err) {
        this.bashResults[mark] = 'Error: ' + err.message;
      }
    },

    async loadMarks() {
      try {
        const resp = await fetch('/api/marks');
        this.marks = await resp.json();
      } catch (err) {
        console.error('Failed to load marks:', err);
      }
    },

    async copyToClipboard(text) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        document.body.removeChild(textarea);
        return true;
      } catch (err) {
        document.body.removeChild(textarea);
        return false;
      }
    },

    copyCommand(cmd) {
      this.copyToClipboard(cmd).then(() => {
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
      
      const thumbPreloadCount = 50;
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
      
      const preloadFull = (idx) => {
        const file = this.files[idx];
        if (!file || this.fullImageCache.has(file.id)) return;
        const img = new Image();
        img.src = this.getImageUrl(idx);
        this.fullImageCache.set(file.id, true);
      };
      
      indices.forEach(idx => {
        for (let i = idx; i < Math.min(this.files.length, idx + 10); i++) {
          preloadFull(i);
        }
        for (let i = idx - 1; i >= Math.max(0, idx - 5); i--) {
          preloadFull(i);
        }
      });
      
      if (this.fullImageCache.size > 30) {
        const toDelete = [];
        for (const id of this.fullImageCache.keys()) {
          const idx = this.files.findIndex(f => f.id === id);
          const farFromBoth = Math.abs(idx - this.index1) > 15 && Math.abs(idx - this.index2) > 15;
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
    },

    getThumbClass(idx, fileId) {
      const classes = [];
      if (idx === this.index1) classes.push('pane1-current');
      if (idx === this.index2) classes.push('pane2-current');
      const fileMarks = this.marks[fileId];
      if (fileMarks && fileMarks.includes(3)) classes.push('deleted');
      if (fileMarks && fileMarks.length > 0) classes.push('marked');
      return classes.join(' ');
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
