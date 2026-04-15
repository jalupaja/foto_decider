# Foto Decider

An image comparison tool for photographers to efficiently select and organize thousands of photos.

## Quick Start

```bash
# Install dependencies
pip install -r requirements.txt

# Run with a folder
./run.sh /path/to/photos

# Or just run and enter path in the UI
./run.sh
```

Then open http://localhost:8000 in your browser.

## Features

### Core Workflow
- **Large Folders**: Handles thousands of images efficiently
- **2-Pane Comparison**: Compare two images side by side with independent controls
- **RAW Support**: Automatically generates thumbnails for RAW files (.cr2, .cr3, .nef, .arw, .dng, etc.)
- **Fast Navigation**: Keyboard-driven workflow for rapid selection

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
| ← → ↑ ↓ | Pan image |
| Ctrl+←/→ | Switch pane |
| + / - | Zoom in/out |
| Mouse wheel | Zoom |
| 1-9 | Mark/unmark image |
| Esc | Clear current pane |

### Bash Commands
Generate bash commands to:
- Copy marked files to folders
- Delete files (marked with 3)
- List all marked files

## Architecture

- **Backend**: FastAPI server for efficient file serving
- **Frontend**: Alpine.js for reactive UI
- **Thumbnails**: Generated on-demand with PIL/rawpy
- **State**: In-memory (marks persist during session)

## Requirements

- Python 3.8+
- fastapi
- uvicorn
- pillow
- rawpy (optional, for RAW thumbnail support)
