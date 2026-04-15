"""Foto Decider Backend - FastAPI server for image comparison."""

import os
import shutil
import uuid
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import uvicorn

IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.avif'}
RAW_EXTENSIONS = {'.raw', '.cr2', '.cr3', '.nef', '.arw', '.dng', '.orf', '.rw2', '.raf', '.pef', '.srw'}

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Marks(BaseModel):
    marks: dict[str, int]

class FolderResponse(BaseModel):
    folder: str
    files: list[dict]
    total: int

class BashCommandsResponse(BaseModel):
    commands: dict[str, str]
    files_by_mark: dict[str, list[str]]

static_path = Path(__file__).parent / "frontend"
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

def create_thumbnail(source_path: str, cache_file: Path) -> bool:
    from PIL import Image
    
    try:
        with Image.open(source_path) as img:
            if img.mode in ('RGBA', 'P'):
                img = img.convert('RGB')
            img.thumbnail((120, 120), Image.Resampling.LANCZOS)
            img.save(cache_file, "JPEG", quality=85)
        return True
    except Exception:
        pass
    
    try:
        import rawpy
        with rawpy.imread(source_path) as raw:
            thumb = raw.extract_thumb()
            if thumb.format == rawpy.ThumbFormat.JPEG:
                with open(cache_file, 'wb') as f:
                    f.write(thumb.data)
            elif thumb.format == rawpy.ThumbFormat.BITMAP:
                rgb = thumb.thumbnail
                img = Image.fromarray(rgb)
                img.thumbnail((120, 120), Image.Resampling.LANCZOS)
                img.save(cache_file, "JPEG", quality=85)
        return True
    except Exception:
        pass
    
    return False

@app.get("/")
async def root():
    index_path = static_path / "index.html"
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
async def set_folder(payload: dict):
    path = payload.get("path") or payload.get("folder") or list(payload.values())[0] if payload else ""
    if not path or not os.path.isdir(path):
        raise HTTPException(status_code=400, detail="Invalid folder path")
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
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(path)

@app.get("/api/thumbnail/{path:path}")
async def get_thumbnail(path: str):
    cache_key = path
    if cache_key in state["thumbnail_cache"]:
        return FileResponse(state["thumbnail_cache"][cache_key])
    
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Image not found")
    
    cache_dir = Path(__file__).parent / ".thumbnails"
    cache_dir.mkdir(exist_ok=True)
    
    cache_file = cache_dir / f"{uuid.uuid4().hex}.jpg"
    
    if create_thumbnail(path, cache_file):
        state["thumbnail_cache"][cache_key] = str(cache_file)
        return FileResponse(str(cache_file))
    
    raise HTTPException(status_code=500, detail="Failed to create thumbnail")

@app.get("/api/bash")
async def get_bash_commands() -> BashCommandsResponse:
    if not state["folder"] or not state["marks"]:
        return BashCommandsResponse(commands={}, files_by_mark={})
    
    mark_names = {
        1: "keep", 2: "review", 3: "delete", 4: "similar",
        5: "backup", 6: "edit", 7: "hdr", 8: "bracket", 9: "other"
    }
    
    files_by_mark: dict[str, list[str]] = {str(i): [] for i in range(1, 10)}
    
    for file_id, mark in state["marks"].items():
        mark_str = str(mark)
        if mark_str in files_by_mark:
            files_by_mark[mark_str].append(file_id)
    
    commands = {}
    
    for mark_str, files in files_by_mark.items():
        if files:
            mark_num = int(mark_str)
            name = mark_names.get(mark_num, f"mark_{mark_num}")
            
            if mark_num == 3:
                cmd = "rm " + " ".join(f'"{f}"' for f in files)
            else:
                cmd = f'mkdir -p "foto_decider_{name}"\nmv ' + " ".join(f'"{f}"' for f in files) + f' "foto_decider_{name}/"'
            
            commands[mark_str] = cmd
    
    return BashCommandsResponse(commands=commands, files_by_mark=files_by_mark)

@app.get("/api/file-list")
async def get_file_list(mark: Optional[str] = None):
    if not state["marks"]:
        return {"files": []}
    
    if mark:
        files = [fid for fid, m in state["marks"].items() if str(m) == mark]
    else:
        files = list(state["marks"].keys())
    
    return {"files": files}

def run(port: int = 8000, folder: Optional[str] = None):
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
