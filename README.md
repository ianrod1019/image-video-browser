# Media Library Manager

A full-featured media library management application for browsing, organizing, and rating your video and image collections.

## Features

- **Multi-folder browsing**: Select and browse multiple folders simultaneously
- **File previews**: View images and play videos directly in the app
- **Custom lists**: Create and manage custom file lists
- **Rating system**: Rate files from 1-100 with per-folder organization
- **All Ratings view**: View all rated files across all folders with filtering and sorting
- **Search functionality**: Search files by name across all selected folders
- **Tab system**: Open multiple files in tabs for easy comparison
- **Dark blue theme**: Professional and easy-on-the-eyes interface
- **Pagination**: Efficient loading of large media libraries (50 items per page)
- **Random file**: Get a random file from your collection

## Tech Stack

- **Backend**: Python with FastAPI
- **Frontend**: HTML, CSS, JavaScript
- **Storage**: JSON files for persistent data

## Installation

1. Clone the repository:
```bash
git clone https://github.com/ianrod1019/image-video-browser.git
cd image-video-browser
```

2. Install Python dependencies:
```bash
cd backend
pip install -r requirements.txt
```

## Running the Application

1. Start the backend server:
```bash
cd backend/app
python main.py
```

2. Open your browser and navigate to:
```
http://localhost:8000
```

## Usage

### Getting Started

1. **Select Folders**: Click "Select Folders" in the sidebar and enter the paths to folders containing your media files (one per line)
2. **Browse Files**: Files will appear in the main grid area
3. **Search**: Use the search bar to filter files by name
4. **Preview**: Click any file to open it in the preview area

### Working with Files

- **View Details**: File information appears in the right panel when selected
- **Rate Files**: Use the rating slider (1-100) to rate files
- **Add to Lists**: Create custom lists and add files to organize your collection
- **Random File**: Click the random file button to view a random file from your collection

### Managing Ratings

- **View All Ratings**: Click "⭐ All Ratings" in the sidebar to see all rated files
- **Filter by Rating**: View rating statistics and distribution
- **Export Ratings**: Export all ratings to JSON format

### Creating Lists

1. Click "Create List" in the sidebar
2. Enter a name for your list
3. Select files and use "Add to List" to organize them
4. Click on any list to view its contents

## Data Storage

All data is stored in JSON files in the `data` directory:

- `data/config/folders.json` - Selected folders
- `data/lists/` - Custom lists
- `data/ratings/` - Per-folder ratings

## Supported File Formats

### Videos
- MP4, MOV, AVI, MKV, WebM, FLV, WMV, M4V

### Images
- JPG, JPEG, PNG, GIF, BMP, WebP, SVG

## Development

The application follows a clean architecture:

- `backend/app/main.py` - FastAPI backend with all API endpoints
- `frontend/templates/index.html` - Main HTML structure
- `frontend/static/css/style.css` - Dark blue themed styling
- `frontend/static/js/app.js` - Frontend application logic

### Security Considerations

**Important**: This MVP does not include authentication or authorization. The application should only be run in trusted environments (localhost or private networks). For production use, consider adding:

- User authentication and authorization
- Access control for file operations
- HTTPS/TLS encryption
- Rate limiting
- Input sanitization

The current implementation includes path traversal protection to ensure files can only be accessed from configured folders.

## API Endpoints

See the FastAPI documentation at `http://localhost:8000/docs` when the server is running.

## License

MIT License