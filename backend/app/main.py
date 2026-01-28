import os
import json
import hashlib
from pathlib import Path
from typing import List, Optional, Dict, Any
from datetime import datetime
from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import mimetypes
from PIL import Image
import io
import base64

# Supported file extensions
VIDEO_EXTENSIONS = {'.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv', '.wmv', '.m4v'}
IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'}
SUPPORTED_EXTENSIONS = VIDEO_EXTENSIONS | IMAGE_EXTENSIONS

# Thumbnail size
THUMBNAIL_SIZE = (300, 300)

app = FastAPI(title="Media Library Manager")

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Get the root directory (two levels up from this file)
ROOT_DIR = Path(__file__).parent.parent.parent

# Data directory paths
DATA_DIR = ROOT_DIR / "data"
LISTS_DIR = DATA_DIR / "lists"
RATINGS_DIR = DATA_DIR / "ratings"
CONFIG_DIR = DATA_DIR / "config"

# Ensure directories exist
for directory in [DATA_DIR, LISTS_DIR, RATINGS_DIR, CONFIG_DIR]:
    directory.mkdir(parents=True, exist_ok=True)

# Mount static files
app.mount("/static", StaticFiles(directory=str(ROOT_DIR / "frontend" / "static")), name="static")

# Pydantic models
class FolderSelection(BaseModel):
    folders: List[str]

class ListCreate(BaseModel):
    name: str
    files: List[str] = []

class RatingSet(BaseModel):
    file: str
    rating: int

# Helper functions
def validate_file_path(file_path: str, allowed_folders: List[str]) -> bool:
    """Validate that a file path is within allowed folders to prevent path traversal attacks."""
    try:
        file_path = Path(file_path).resolve()
        for folder in allowed_folders:
            folder_path = Path(folder).resolve()
            try:
                # Check if the file path is relative to the allowed folder
                file_path.relative_to(folder_path)
                return True
            except ValueError:
                continue
        return False
    except Exception:
        return False

def get_folder_hash(folder_path: str) -> str:
    """Generate a hash for a folder path."""
    return hashlib.md5(folder_path.encode()).hexdigest()

def load_json_file(file_path: Path, default=None):
    """Load JSON from file, return default if not exists."""
    if file_path.exists():
        with open(file_path, 'r') as f:
            return json.load(f)
    return default if default is not None else {}

def save_json_file(file_path: Path, data):
    """Save data to JSON file."""
    with open(file_path, 'w') as f:
        json.dump(data, f, indent=2)

def get_file_metadata(file_path: str) -> Dict[str, Any]:
    """Get metadata for a file."""
    path = Path(file_path)
    if not path.exists():
        return {}
    
    stat = path.stat()
    mime_type, _ = mimetypes.guess_type(file_path)
    
    metadata = {
        "name": path.name,
        "path": str(path.absolute()),
        "size": stat.st_size,
        "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
        "type": mime_type or "unknown",
        "extension": path.suffix.lower()
    }
    
    # Add video/image specific metadata if possible
    if mime_type and mime_type.startswith('image/'):
        try:
            with Image.open(path) as img:
                metadata["width"] = img.width
                metadata["height"] = img.height
                metadata["resolution"] = f"{img.width}x{img.height}"
        except Exception as e:
            # Log error but don't expose details
            print(f"Error reading image metadata: {e}")
    
    return metadata

def get_files_from_folders(folders: List[str], search: Optional[str] = None) -> List[Dict[str, Any]]:
    """Get all media files from specified folders."""
    files = []
    for folder in folders:
        folder_path = Path(folder)
        if not folder_path.exists():
            continue
        
        for file_path in folder_path.rglob('*'):
            if file_path.is_file() and file_path.suffix.lower() in SUPPORTED_EXTENSIONS:
                if search and search.lower() not in file_path.name.lower():
                    continue
                
                metadata = get_file_metadata(str(file_path))
                files.append(metadata)
    
    return files

# API Endpoints

@app.get("/")
async def root():
    """Serve the main HTML page."""
    return FileResponse(str(ROOT_DIR / "frontend" / "templates" / "index.html"))

@app.get("/api/folders")
async def get_folders():
    """Get selected folders."""
    config_file = CONFIG_DIR / "folders.json"
    data = load_json_file(config_file, {"folders": []})
    return data

@app.post("/api/folders")
async def update_folders(selection: FolderSelection):
    """Add/update selected folders."""
    config_file = CONFIG_DIR / "folders.json"
    save_json_file(config_file, {"folders": selection.folders})
    return {"status": "success", "folders": selection.folders}

@app.get("/api/files")
async def get_files(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    search: Optional[str] = None,
    folder: Optional[str] = None
):
    """Get files with pagination and search."""
    # Get folders
    folders_data = load_json_file(CONFIG_DIR / "folders.json", {"folders": []})
    folders = folders_data.get("folders", [])
    
    if folder:
        folders = [folder]
    
    # Get all files
    all_files = get_files_from_folders(folders, search)
    
    # Sort by name
    all_files.sort(key=lambda x: x.get("name", ""))
    
    # Pagination
    total = len(all_files)
    start = (page - 1) * per_page
    end = start + per_page
    files = all_files[start:end]
    
    return {
        "files": files,
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": (total + per_page - 1) // per_page
    }

@app.get("/api/file/metadata")
async def get_file_metadata_endpoint(path: str):
    """Get file metadata."""
    # Get allowed folders for validation
    folders_data = load_json_file(CONFIG_DIR / "folders.json", {"folders": []})
    allowed_folders = folders_data.get("folders", [])
    
    # Validate file path
    if not validate_file_path(path, allowed_folders):
        raise HTTPException(status_code=403, detail="Access denied: file not in allowed folders")
    
    metadata = get_file_metadata(path)
    if not metadata:
        raise HTTPException(status_code=404, detail="File not found")
    return metadata

@app.get("/api/file/serve")
async def serve_file(path: str):
    """Serve a file directly."""
    # Get allowed folders for validation
    folders_data = load_json_file(CONFIG_DIR / "folders.json", {"folders": []})
    allowed_folders = folders_data.get("folders", [])
    
    # Validate file path
    if not validate_file_path(path, allowed_folders):
        raise HTTPException(status_code=403, detail="Access denied: file not in allowed folders")
    
    file_path = Path(path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    mime_type, _ = mimetypes.guess_type(path)
    return FileResponse(path, media_type=mime_type)

@app.get("/api/file/preview")
async def get_file_preview(path: str):
    """Get file preview/thumbnail."""
    # Get allowed folders for validation
    folders_data = load_json_file(CONFIG_DIR / "folders.json", {"folders": []})
    allowed_folders = folders_data.get("folders", [])
    
    # Validate file path
    if not validate_file_path(path, allowed_folders):
        raise HTTPException(status_code=403, detail="Access denied: file not in allowed folders")
    
    file_path = Path(path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    mime_type, _ = mimetypes.guess_type(path)
    
    # For images, create a thumbnail
    if mime_type and mime_type.startswith('image/'):
        try:
            with Image.open(file_path) as img:
                img.thumbnail(THUMBNAIL_SIZE)
                buffer = io.BytesIO()
                img.save(buffer, format='JPEG')
                buffer.seek(0)
                img_data = base64.b64encode(buffer.getvalue()).decode()
                return {"preview": f"data:image/jpeg;base64,{img_data}"}
        except Exception as e:
            # Log error but don't expose details to client
            print(f"Error generating thumbnail: {e}")
    
    # For videos, return file path for video player
    if mime_type and mime_type.startswith('video/'):
        return {"type": "video", "path": path}
    
    return {"preview": None}

@app.get("/api/lists")
async def get_lists():
    """Get all lists."""
    lists = []
    for list_file in LISTS_DIR.glob("list_*.json"):
        data = load_json_file(list_file)
        data["id"] = list_file.stem.replace("list_", "")
        lists.append(data)
    return {"lists": lists}

@app.post("/api/lists")
async def create_list(list_data: ListCreate):
    """Create a new list."""
    # Generate ID from name
    list_id = hashlib.md5(list_data.name.encode()).hexdigest()[:8]
    list_file = LISTS_DIR / f"list_{list_id}.json"
    
    # Check if exists
    if list_file.exists():
        raise HTTPException(status_code=400, detail="List with this name already exists")
    
    data = {
        "name": list_data.name,
        "files": list_data.files,
        "created_at": datetime.now().isoformat()
    }
    
    save_json_file(list_file, data)
    return {"status": "success", "id": list_id, "list": data}

@app.put("/api/lists/{list_id}")
async def update_list(list_id: str, list_data: ListCreate):
    """Update a list."""
    list_file = LISTS_DIR / f"list_{list_id}.json"
    
    if not list_file.exists():
        raise HTTPException(status_code=404, detail="List not found")
    
    data = load_json_file(list_file)
    data["name"] = list_data.name
    data["files"] = list_data.files
    data["updated_at"] = datetime.now().isoformat()
    
    save_json_file(list_file, data)
    return {"status": "success", "list": data}

@app.get("/api/lists/{list_id}/files")
async def get_list_files(list_id: str):
    """Get files in a list."""
    list_file = LISTS_DIR / f"list_{list_id}.json"
    
    if not list_file.exists():
        raise HTTPException(status_code=404, detail="List not found")
    
    data = load_json_file(list_file)
    files = []
    
    for file_path in data.get("files", []):
        metadata = get_file_metadata(file_path)
        if metadata:
            files.append(metadata)
    
    return {"files": files, "list_name": data.get("name")}

@app.get("/api/ratings")
async def get_ratings(folder: str = Query(...)):
    """Get ratings for a folder."""
    folder_hash = get_folder_hash(folder)
    rating_file = RATINGS_DIR / f"{folder_hash}.json"
    
    data = load_json_file(rating_file, {
        "folder": folder,
        "folder_hash": folder_hash,
        "ratings": []
    })
    
    return data

@app.post("/api/ratings")
async def set_rating(folder: str = Query(...), rating_data: RatingSet = None):
    """Set rating for a file in a folder."""
    if not rating_data:
        raise HTTPException(status_code=400, detail="Rating data required")
    
    if not 1 <= rating_data.rating <= 100:
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 100")
    
    folder_hash = get_folder_hash(folder)
    rating_file = RATINGS_DIR / f"{folder_hash}.json"
    
    data = load_json_file(rating_file, {
        "folder": folder,
        "folder_hash": folder_hash,
        "ratings": []
    })
    
    # Update or add rating
    found = False
    for rating in data["ratings"]:
        if rating["file"] == rating_data.file:
            rating["rating"] = rating_data.rating
            rating["rated_at"] = datetime.now().isoformat()
            found = True
            break
    
    if not found:
        data["ratings"].append({
            "file": rating_data.file,
            "rating": rating_data.rating,
            "rated_at": datetime.now().isoformat()
        })
    
    save_json_file(rating_file, data)
    return {"status": "success", "rating": rating_data.rating}

@app.get("/api/ratings/all")
async def get_all_ratings(
    min_rating: Optional[int] = Query(None, ge=1, le=100),
    max_rating: Optional[int] = Query(None, ge=1, le=100),
    sort: Optional[str] = Query("desc", pattern="^(asc|desc)$")
):
    """Get all rated files across all folders."""
    all_ratings = []
    
    for rating_file in RATINGS_DIR.glob("*.json"):
        data = load_json_file(rating_file)
        folder = data.get("folder", "")
        
        for rating in data.get("ratings", []):
            rating_value = rating["rating"]
            
            # Apply filters
            if min_rating and rating_value < min_rating:
                continue
            if max_rating and rating_value > max_rating:
                continue
            
            all_ratings.append({
                "file": rating["file"],
                "folder": folder,
                "rating": rating_value,
                "rated_at": rating.get("rated_at", "")
            })
    
    # Sort by rating
    reverse = (sort == "desc")
    all_ratings.sort(key=lambda x: x["rating"], reverse=reverse)
    
    # Calculate stats with 10 buckets (1-10, 11-20, ... 91-100)
    ratings_list = [r["rating"] for r in all_ratings]
    distribution = {}
    for i in range(1, 11):
        # Each bucket represents a range of 10 ratings
        distribution[str(i)] = sum(1 for r in ratings_list if i*10-9 <= r <= i*10)
    
    stats = {
        "total_rated": len(all_ratings),
        "average_rating": sum(ratings_list) / len(ratings_list) if ratings_list else 0,
        "distribution": distribution
    }
    
    return {
        "all_ratings": all_ratings,
        "stats": stats
    }

@app.get("/api/random")
async def get_random_file(folder: Optional[str] = None):
    """Get a random file from current context."""
    import random
    
    folders_data = load_json_file(CONFIG_DIR / "folders.json", {"folders": []})
    folders = folders_data.get("folders", [])
    
    if folder:
        folders = [folder]
    
    files = get_files_from_folders(folders)
    
    if not files:
        raise HTTPException(status_code=404, detail="No files found")
    
    return random.choice(files)

@app.get("/api/comics")
async def get_comics():
    """Get all comics (folders with 'comic' in path)."""
    folders_data = load_json_file(CONFIG_DIR / "folders.json", {"folders": []})
    folders = folders_data.get("folders", [])
    
    comics = []
    for folder in folders:
        folder_path = Path(folder)
        if not folder_path.exists():
            continue
        
        # Check if folder contains 'comic' in path
        if 'comic' in folder.lower():
            for subdir in folder_path.iterdir():
                if subdir.is_dir():
                    comics.append({
                        "id": get_folder_hash(str(subdir)),
                        "name": subdir.name,
                        "path": str(subdir)
                    })
    
    return {"comics": comics}

@app.post("/api/export/lists/{list_id}")
async def export_list(list_id: str):
    """Export a list to JSON."""
    list_file = LISTS_DIR / f"list_{list_id}.json"
    
    if not list_file.exists():
        raise HTTPException(status_code=404, detail="List not found")
    
    data = load_json_file(list_file)
    return JSONResponse(content=data)

@app.post("/api/export/ratings")
async def export_ratings(folder: str = Query(...)):
    """Export ratings for a folder."""
    folder_hash = get_folder_hash(folder)
    rating_file = RATINGS_DIR / f"{folder_hash}.json"
    
    data = load_json_file(rating_file, {
        "folder": folder,
        "folder_hash": folder_hash,
        "ratings": []
    })
    
    return JSONResponse(content=data)

@app.post("/api/export/ratings/all")
async def export_all_ratings():
    """Export all ratings."""
    result = await get_all_ratings()
    return JSONResponse(content=result)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
