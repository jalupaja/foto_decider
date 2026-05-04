"""Foto Decider Backend - FastAPI server for image comparison."""

import os
import shutil
import uuid
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from urllib.parse import unquote
import uvicorn

IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.avif'}
RAW_EXTENSIONS = {'.raw', '.cr2', '.cr3', '.nef', '.arw', '.dng', '.orf', '.rw2', '.raf', '.pef', '.srw'}

MARK_NAMES = {
    1: "Keep", 2: "Review", 3: "Delete", 4: "Similar",
    5: "Backup", 6: "Edit", 7: "HDR", 8: "Bracket", 9: "Other"
}

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Marks(BaseModel):
    marks: dict[str, list[int]]

class FolderRequest(BaseModel):
    path: str = ""

class FolderResponse(BaseModel):
    folder: str
    files: list[dict]
    total: int

class BashRequest(BaseModel):
    mark: int
    action: str
    destination: Optional[str] = None

static_path = Path(__file__).parent.parent / "static"
frontend_path = Path(__file__).parent.parent / "frontend"
if static_path.exists():
    app.mount("/static", StaticFiles(directory=str(static_path)), name="static")

state = {
    "folder": None,
    "marks": {},
    "thumbnail_cache": {},
}

def is_image(filename: str) -> bool:
    ext = Path(filename).suffix.lower()
    return ext in IMAGE_EXTENSIONS or ext in RAW_EXTENSIONS

def get_image_files(folder: str) -> list[dict]:
    files = []
    folder_path = Path(folder)
    for f in sorted(folder_path.iterdir()):
        if f.is_file() and is_image(f.name):
            files.append({
                "id": str(f.absolute()),
                "name": f.name,
                "path": str(f.absolute()),
                "size": f.stat().st_size,
                "is_raw": f.suffix.lower() in RAW_EXTENSIONS,
            })
    return files

def create_thumbnail(source_path: str, cache_file: Path, size: tuple = (120, 120), quality: int = 85) -> bool:
    from PIL import Image
    
    try:
        with Image.open(source_path) as img:
            if img.mode in ('RGBA', 'P'):
                img = img.convert('RGB')
            img.thumbnail(size, Image.Resampling.LANCZOS)
            img.save(cache_file, "JPEG", quality=quality)
        return True
    except Exception:
        pass
    
    try:
        import rawpy
        with rawpy.imread(source_path) as raw:
            thumb = raw.extract_thumb()
            if thumb.format == rawpy.ThumbFormat.JPEG:
                import io
                thumb_img = Image.open(io.BytesIO(thumb.data))
                thumb_img.thumbnail(size, Image.Resampling.LANCZOS)
                thumb_img.save(cache_file, "JPEG", quality=quality)
            elif thumb.format == rawpy.ThumbFormat.BITMAP:
                rgb = thumb.thumbnail
                img = Image.fromarray(rgb)
                img.thumbnail(size, Image.Resampling.LANCZOS)
                img.save(cache_file, "JPEG", quality=quality)
        return True
    except Exception:
        pass
    
    return False

@app.get("/")
async def root():
    index_path = frontend_path / "index.html"
    if index_path.exists():
        return FileResponse(str(index_path))
    raise HTTPException(status_code=404, detail="Frontend not found")

@app.get("/api/folder")
async def get_folder() -> FolderResponse:
    if not state["folder"]:
        return FolderResponse(folder="", files=[], total=0)
    files = get_image_files(state["folder"])
    return FolderResponse(folder=state["folder"], files=files, total=len(files))

@app.post("/api/folder")
async def set_folder(data: FolderRequest):
    path = data.path.strip() if data.path else ""
    if not path:
        raise HTTPException(status_code=400, detail="Path is required")
    if not os.path.isdir(path):
        raise HTTPException(status_code=400, detail=f"Path does not exist: {path}")
    state["folder"] = os.path.abspath(path)
    state["marks"] = {}
    state["thumbnail_cache"].clear()
    files = get_image_files(state["folder"])
    return {"folder": state["folder"], "files": files, "total": len(files)}

@app.get("/api/marks")
async def get_marks() -> dict:
    return state["marks"]

@app.post("/api/marks")
async def set_marks(data: Marks):
    state["marks"] = data.marks
    return {"saved": True}

@app.post("/api/marks/clear")
async def clear_marks():
    state["marks"] = {}
    return {"cleared": True}

@app.get("/api/image/{path:path}")
async def get_image(path: str):
    path = unquote(path)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(path)

@app.get("/api/thumbnail/{path:path}")
async def get_thumbnail(path: str):
    path = unquote(path)
    cache_key = f"thumb_{path}"
    if cache_key in state["thumbnail_cache"]:
        return FileResponse(state["thumbnail_cache"][cache_key])
    
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail=f"Image not found: {path}")
    
    cache_dir = Path(__file__).parent / ".thumbnails"
    cache_dir.mkdir(exist_ok=True)
    
    cache_file = cache_dir / f"{uuid.uuid4().hex}.jpg"
    
    if create_thumbnail(path, cache_file, size=(120, 120), quality=85):
        state["thumbnail_cache"][cache_key] = str(cache_file)
        return FileResponse(str(cache_file))
    
    raise HTTPException(status_code=500, detail="Failed to create thumbnail")

@app.get("/api/display/{path:path}")
async def get_display(path: str):
    path = unquote(path)
    cache_key = f"display_{path}"
    if cache_key in state["thumbnail_cache"]:
        return FileResponse(state["thumbnail_cache"][cache_key])
    
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Image not found")
    
    cache_dir = Path(__file__).parent / ".thumbnails"
    cache_dir.mkdir(exist_ok=True)
    
    cache_file = cache_dir / f"{uuid.uuid4().hex}.jpg"
    
    if create_thumbnail(path, cache_file, size=(2000, 2000), quality=90):
        state["thumbnail_cache"][cache_key] = str(cache_file)
        return FileResponse(str(cache_file))
    
    raise HTTPException(status_code=500, detail="Failed to create display image")

@app.get("/api/bash")
async def get_bash_data():
    if not state["marks"]:
        return JSONResponse({"files_by_mark": {}, "mark_names": MARK_NAMES})
    
    files_by_mark: dict[int, list[str]] = {i: [] for i in range(1, 10)}
    
    for file_id, marks_list in state["marks"].items():
        for mark in marks_list:
            if mark in files_by_mark:
                files_by_mark[mark].append(file_id)
    
    return JSONResponse({
        "files_by_mark": {str(k): v for k, v in files_by_mark.items()},
        "mark_names": MARK_NAMES
    })

@app.post("/api/bash/copy")
async def bash_copy(data: BashRequest):
    files = [fid for fid, marks in state["marks"].items() if data.mark in marks]
    if not files:
        return JSONResponse({"success": False, "message": "No files found"})
    
    if not data.destination:
        return JSONResponse({"success": False, "message": "Destination required"})
    
    dest = Path(data.destination)
    if not dest.is_absolute():
        return JSONResponse({"success": False, "message": "Use absolute path"})
    
    dest.mkdir(parents=True, exist_ok=True)
    copied = 0
    errors = []
    
    for f in files:
        try:
            shutil.copy2(f, dest / Path(f).name)
            copied += 1
        except Exception as e:
            errors.append(f"{Path(f).name}: {str(e)}")
    
    return JSONResponse({
        "success": True,
        "copied": copied,
        "errors": errors,
        "command": f"cp {' '.join(f'\"{Path(f).name}\"' for f in files)} \"{dest}\""
    })

@app.post("/api/bash/move")
async def bash_move(data: BashRequest):
    files = [fid for fid, marks in state["marks"].items() if data.mark in marks]
    if not files:
        return JSONResponse({"success": False, "message": "No files found"})
    
    if not data.destination:
        return JSONResponse({"success": False, "message": "Destination required"})
    
    dest = Path(data.destination)
    if not dest.is_absolute():
        return JSONResponse({"success": False, "message": "Use absolute path"})
    
    dest.mkdir(parents=True, exist_ok=True)
    moved = 0
    errors = []
    
    for f in files:
        try:
            shutil.move(f, dest / Path(f).name)
            moved += 1
        except Exception as e:
            errors.append(f"{Path(f).name}: {str(e)}")
    
    return JSONResponse({
        "success": True,
        "moved": moved,
        "errors": errors,
        "command": f"mv {' '.join(f'\"{Path(f).name}\"' for f in files)} \"{dest}\""
    })

@app.post("/api/bash/delete")
async def bash_delete(data: BashRequest):
    files = [fid for fid, marks in state["marks"].items() if data.mark in marks]
    if not files:
        return JSONResponse({"success": False, "message": "No files found"})
    
    deleted = 0
    errors = []
    
    for f in files:
        try:
            os.remove(f)
            deleted += 1
        except Exception as e:
            errors.append(f"{Path(f).name}: {str(e)}")
    
    return JSONResponse({
        "success": True,
        "deleted": deleted,
        "errors": errors,
        "command": f"rm {' '.join(f'\"{f}\"' for f in files)}"
    })

@app.post("/api/bash/filenames")
async def bash_filenames(data: BashRequest):
    files = [fid for fid, marks in state["marks"].items() if data.mark in marks]
    if not files:
        return JSONResponse({"success": False, "message": "No files found"})
    
    filenames = [Path(f).name for f in files]
    
    return JSONResponse({
        "success": True,
        "filenames": filenames,
        "count": len(filenames)
    })

def run(port: int = 8080, folder: Optional[str] = None):
    print(f"running on port {port}")
    if folder:
        state["folder"] = os.path.abspath(folder)
    
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="warning")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("folder", nargs="?")
    args = parser.parse_args()
    run(port=args.port, folder=args.folder)
