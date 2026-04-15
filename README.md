# Foto Decider

An image comparison tool for photographers to efficiently select and organize photos.

## Features

### Core Workflow
- **Folder Selection**: Open a local folder to access images
- **2-Pane Comparison**: Compare two images side by side with independent controls
- **Navigation**: Go through images one by one with keyboard shortcuts

### Marking System (1-9)
- **1 - Keep**: Best images to keep
- **2 - Review**: Look at later
- **3 - Delete**: Marked for deletion
- **4 - Similar**: Part of a similar group
- **5 - Backup**: Keep an extra copy
- **6 - Edit**: Needs processing
- **7 - HDR**: For HDR merge
- **8 - Bracket**: Exposure bracket
- **9 - Other**: Custom use

### Controls
| Key | Action |
|-----|--------|
| Space | Next image |
| Backspace | Previous image |
| ← → ↑ ↓ | Pan image (or pane switch with Ctrl) |
| + / - | Zoom in/out |
| 1-9 | Mark/unmark image |
| M | Show mark menu |
| Esc | Clear current pane |

### Bash Commands
Generate bash commands for:
- Copy marked files to folders
- Delete files (marked with 3)
- List all marked files

## Usage

1. Open `index.html` in a browser
2. Click "Open Folder" to select an image folder
3. Click on a pane to focus it
4. Use Space/Backspace to navigate
5. Press 1-9 to mark images
6. Click "Bash Commands" to generate commands

## Browser Requirements
- Chrome/Edge recommended (for folder selection support)
- File System Access API for local folder access
