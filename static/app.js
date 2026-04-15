function fotoDecider() {
  return {
    folder: '',
    folderPath: '',
    files: [],
    currentIndex: 0,
    focusedPane: 1,
    marks: {},
    pane1File: null,
    pane2File: null,
    pane1Transform: { x: 0, y: 0, scale: 1 },
    pane2Transform: { x: 0, y: 0, scale: 1 },
    showBash: false,
    bashCommands: {},
    bashFiles: {},
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
          this.scrollPreview();
        }
      } catch (err) {
        console.error('Failed to load folder:', err);
      }

      document.addEventListener('keydown', (e) => this.handleKey(e));
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
          this.pane1File = null;
          this.pane2File = null;
          this.scrollPreview();
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
      this.pane1File = null;
      this.pane2File = null;
    },

    goTo(index) {
      if (index < 0 || index >= this.files.length) return;
      this.currentIndex = index;
      this.loadPane(this.focusedPane);
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

    loadPane(pane) {
      if (this.files.length === 0) return;
      if (pane === 1) {
        this.pane1File = this.files[this.currentIndex];
        this.pane1Transform = { x: 0, y: 0, scale: 1 };
      } else {
        this.pane2File = this.files[this.currentIndex];
        this.pane2Transform = { x: 0, y: 0, scale: 1 };
      }
    },

    focusPane(pane) {
      this.focusedPane = pane;
    },

    fitImage(event, pane) {
      const img = event.target;
      if (!img.naturalWidth || !img.naturalHeight) return;
      
      const container = img.parentElement;
      if (!container) return;
      const containerRect = container.getBoundingClientRect();
      const scaleX = containerRect.width / img.naturalWidth;
      const scaleY = containerRect.height / img.naturalHeight;
      const scale = Math.min(scaleX, scaleY, 1);
      
      if (pane === 1) {
        this.pane1Transform.scale = scale;
      } else {
        this.pane2Transform.scale = scale;
      }
    },

    getPaneStyle(pane) {
      const t = pane === 1 ? this.pane1Transform : this.pane2Transform;
      return `transform: translate(calc(-50% + ${t.x}px), calc(-50% + ${t.y}px)) scale(${t.scale})`;
    },

    zoomPane(pane, event) {
      const factor = event.deltaY > 0 ? 0.9 : 1.1;
      if (pane === 1) {
        this.pane1Transform.scale = Math.max(0.1, Math.min(10, this.pane1Transform.scale * factor));
      } else {
        this.pane2Transform.scale = Math.max(0.1, Math.min(10, this.pane2Transform.scale * factor));
      }
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
          this.zoomPane(this.focusedPane, { deltaY: -100 });
          break;
        case '-':
          this.zoomPane(this.focusedPane, { deltaY: 100 });
          break;
        case 'Escape':
          if (this.focusedPane === 1) {
            this.pane1File = null;
          } else {
            this.pane2File = null;
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

    async handleDrop(e, pane) {
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        this.focusPane(pane);
      }
    },

    get pane1Mark() {
      if (!this.pane1File) return null;
      return this.marks[this.pane1File.id] || null;
    },

    get pane2Mark() {
      if (!this.pane2File) return null;
      return this.marks[this.pane2File.id] || null;
    }
  };
}
