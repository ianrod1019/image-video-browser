// Global state
let state = {
    currentView: 'browse',
    currentPage: 1,
    totalPages: 1,
    perPage: 50,
    searchQuery: '',
    selectedFile: null,
    folders: [],
    lists: [],
    openTabs: [],
    activeTab: null
};

// API Helper
async function apiCall(endpoint, method = 'GET', data = null) {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json'
        }
    };
    
    if (data) {
        options.body = JSON.stringify(data);
    }
    
    const response = await fetch(`/api${endpoint}`, options);
    if (!response.ok) {
        throw new Error(`API call failed: ${response.statusText}`);
    }
    
    return response.json();
}

// Initialize app
async function init() {
    await loadFolders();
    await loadLists();
    await loadFiles();
    setupEventListeners();
}

// Load folders
async function loadFolders() {
    try {
        const data = await apiCall('/folders');
        state.folders = data.folders || [];
        renderFolders();
    } catch (error) {
        console.error('Failed to load folders:', error);
    }
}

// Load lists
async function loadLists() {
    try {
        const data = await apiCall('/lists');
        state.lists = data.lists || [];
        renderLists();
        updateListSelect();
    } catch (error) {
        console.error('Failed to load lists:', error);
    }
}

// Load files
async function loadFiles() {
    try {
        let endpoint = `/files?page=${state.currentPage}&per_page=${state.perPage}`;
        if (state.searchQuery) {
            endpoint += `&search=${encodeURIComponent(state.searchQuery)}`;
        }
        
        const data = await apiCall(endpoint);
        renderFileGrid(data.files);
        updatePagination(data.page, data.total_pages);
        updateFileCount(data.total);
    } catch (error) {
        console.error('Failed to load files:', error);
        renderFileGrid([]);
    }
}

// Load all ratings
async function loadAllRatings() {
    try {
        const data = await apiCall('/ratings/all');
        renderRatingsView(data);
    } catch (error) {
        console.error('Failed to load ratings:', error);
    }
}

// Render folders
function renderFolders() {
    const container = document.getElementById('folders-list');
    if (!state.folders.length) {
        container.innerHTML = '<p class="info-placeholder">No folders selected</p>';
        return;
    }
    
    container.innerHTML = state.folders.map(folder => `
        <div class="folder-item" title="${folder}">${folder.split('/').pop() || folder}</div>
    `).join('');
}

// Render lists
function renderLists() {
    const container = document.getElementById('lists-container');
    if (!state.lists.length) {
        container.innerHTML = '<p class="info-placeholder">No lists created</p>';
        return;
    }
    
    container.innerHTML = state.lists.map(list => `
        <div class="list-item" data-list-id="${list.id}">
            📋 ${list.name} (${list.files.length})
        </div>
    `).join('');
    
    // Add click handlers
    document.querySelectorAll('.list-item').forEach(item => {
        item.addEventListener('click', () => {
            const listId = item.dataset.listId;
            viewList(listId);
        });
    });
}

// Update list select dropdown
function updateListSelect() {
    const select = document.getElementById('list-select');
    select.innerHTML = '<option value="">Select a list...</option>';
    
    state.lists.forEach(list => {
        const option = document.createElement('option');
        option.value = list.id;
        option.textContent = list.name;
        select.appendChild(option);
    });
}

// Render file grid
function renderFileGrid(files) {
    const grid = document.getElementById('file-grid');
    
    if (!files.length) {
        grid.innerHTML = '<div class="empty-state"><p>No files found</p></div>';
        return;
    }
    
    grid.innerHTML = files.map(file => {
        const icon = getFileIcon(file.type);
        return `
            <div class="file-card" data-path="${file.path}">
                <div class="file-thumbnail">
                    <span class="file-icon">${icon}</span>
                </div>
                <div class="file-name" title="${file.name}">${file.name}</div>
            </div>
        `;
    }).join('');
    
    // Add click handlers
    document.querySelectorAll('.file-card').forEach(card => {
        card.addEventListener('click', () => {
            const path = card.dataset.path;
            openFileInTab(path);
        });
    });
    
    // Load thumbnails
    files.forEach(file => {
        loadThumbnail(file.path);
    });
}

// Render ratings view
function renderRatingsView(data) {
    const grid = document.getElementById('file-grid');
    const ratings = data.all_ratings || [];
    
    if (!ratings.length) {
        grid.innerHTML = '<div class="empty-state"><p>No rated files</p></div>';
        return;
    }
    
    grid.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 20px; background-color: var(--secondary-bg); border-radius: 8px; margin-bottom: 20px;">
            <h3 style="margin-bottom: 10px;">Rating Statistics</h3>
            <p>Total Rated: ${data.stats.total_rated}</p>
            <p>Average Rating: ${data.stats.average_rating.toFixed(1)}</p>
        </div>
        ${ratings.map(rating => {
            const fileName = rating.file.split('/').pop();
            const icon = getFileIconFromPath(rating.file);
            return `
                <div class="file-card" data-path="${rating.file}">
                    <div class="file-rating">${rating.rating}</div>
                    <div class="file-thumbnail">
                        <span class="file-icon">${icon}</span>
                    </div>
                    <div class="file-name" title="${fileName}">${fileName}</div>
                </div>
            `;
        }).join('')}
    `;
    
    // Add click handlers
    document.querySelectorAll('.file-card').forEach(card => {
        card.addEventListener('click', () => {
            const path = card.dataset.path;
            openFileInTab(path);
        });
    });
}

// Get file icon
function getFileIcon(type) {
    if (type && type.startsWith('video/')) return '🎬';
    if (type && type.startsWith('image/')) return '🖼️';
    return '📄';
}

function getFileIconFromPath(path) {
    const ext = path.split('.').pop().toLowerCase();
    const videoExts = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'wmv', 'm4v'];
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'];
    
    if (videoExts.includes(ext)) return '🎬';
    if (imageExts.includes(ext)) return '🖼️';
    return '📄';
}

// Load thumbnail
async function loadThumbnail(path) {
    try {
        const data = await apiCall(`/file/preview?path=${encodeURIComponent(path)}`);
        if (data.preview) {
            const card = document.querySelector(`.file-card[data-path="${path}"]`);
            if (card) {
                const thumbnail = card.querySelector('.file-thumbnail');
                thumbnail.innerHTML = `<img src="${data.preview}" alt="Preview">`;
            }
        }
    } catch (error) {
        console.error('Failed to load thumbnail:', error);
    }
}

// Open file in tab
async function openFileInTab(path) {
    try {
        const metadata = await apiCall(`/file/metadata?path=${encodeURIComponent(path)}`);
        
        // Check if already open
        const existingTab = state.openTabs.find(tab => tab.path === path);
        if (existingTab) {
            switchToTab(path);
            return;
        }
        
        // Add to tabs
        state.openTabs.push({
            path,
            name: metadata.name,
            metadata
        });
        
        state.activeTab = path;
        state.selectedFile = metadata;
        
        renderTabs();
        renderPreview(metadata);
        renderFileInfo(metadata);
        
        // Enable controls
        document.getElementById('rating-slider').disabled = false;
        document.getElementById('save-rating-btn').disabled = false;
        document.getElementById('list-select').disabled = false;
        document.getElementById('add-to-list-btn').disabled = false;
        document.getElementById('favorite-btn').disabled = false;
        
        // Load rating for this file
        loadFileRating(path);
        
    } catch (error) {
        console.error('Failed to open file:', error);
    }
}

// Switch to tab
function switchToTab(path) {
    state.activeTab = path;
    const tab = state.openTabs.find(t => t.path === path);
    if (tab) {
        state.selectedFile = tab.metadata;
        renderTabs();
        renderPreview(tab.metadata);
        renderFileInfo(tab.metadata);
        loadFileRating(path);
    }
}

// Close tab
function closeTab(path) {
    state.openTabs = state.openTabs.filter(tab => tab.path !== path);
    
    if (state.activeTab === path) {
        if (state.openTabs.length > 0) {
            switchToTab(state.openTabs[0].path);
        } else {
            state.activeTab = null;
            state.selectedFile = null;
            renderTabs();
            clearPreview();
            clearFileInfo();
        }
    } else {
        renderTabs();
    }
}

// Render tabs
function renderTabs() {
    const container = document.getElementById('tabs');
    
    if (!state.openTabs.length) {
        container.innerHTML = '';
        return;
    }
    
    container.innerHTML = state.openTabs.map(tab => `
        <div class="tab ${tab.path === state.activeTab ? 'active' : ''}" data-path="${tab.path}">
            ${tab.name}
            <span class="tab-close" data-path="${tab.path}">✕</span>
        </div>
    `).join('');
    
    // Add click handlers
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            if (!e.target.classList.contains('tab-close')) {
                switchToTab(tab.dataset.path);
            }
        });
    });
    
    document.querySelectorAll('.tab-close').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeTab(btn.dataset.path);
        });
    });
}

// Render preview
function renderPreview(metadata) {
    const container = document.getElementById('preview-content');
    
    if (metadata.type && metadata.type.startsWith('video/')) {
        container.innerHTML = `
            <video controls autoplay>
                <source src="/api/file/serve?path=${encodeURIComponent(metadata.path)}" type="${metadata.type}">
                Your browser does not support the video tag.
            </video>
        `;
    } else if (metadata.type && metadata.type.startsWith('image/')) {
        container.innerHTML = `<img src="/api/file/serve?path=${encodeURIComponent(metadata.path)}" alt="${metadata.name}">`;
    } else {
        container.innerHTML = '<div class="empty-state"><p>Preview not available</p></div>';
    }
}

// Clear preview
function clearPreview() {
    const container = document.getElementById('preview-content');
    container.innerHTML = '<div class="empty-state"><p>Click on a file to preview</p></div>';
}

// Render file info
function renderFileInfo(metadata) {
    const container = document.getElementById('file-info');
    
    const formatSize = (bytes) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
        if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
        return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    };
    
    container.innerHTML = `
        <div class="info-item">
            <span class="info-label">Name:</span>
            <span class="info-value">${metadata.name}</span>
        </div>
        <div class="info-item">
            <span class="info-label">Path:</span>
            <span class="info-value" style="word-break: break-all;">${metadata.path}</span>
        </div>
        <div class="info-item">
            <span class="info-label">Size:</span>
            <span class="info-value">${formatSize(metadata.size)}</span>
        </div>
        <div class="info-item">
            <span class="info-label">Type:</span>
            <span class="info-value">${metadata.type}</span>
        </div>
        <div class="info-item">
            <span class="info-label">Modified:</span>
            <span class="info-value">${new Date(metadata.modified).toLocaleString()}</span>
        </div>
        ${metadata.resolution ? `
            <div class="info-item">
                <span class="info-label">Resolution:</span>
                <span class="info-value">${metadata.resolution}</span>
            </div>
        ` : ''}
    `;
}

// Clear file info
function clearFileInfo() {
    const container = document.getElementById('file-info');
    container.innerHTML = '<p class="info-placeholder">Select a file to view details</p>';
    
    document.getElementById('rating-slider').disabled = true;
    document.getElementById('save-rating-btn').disabled = true;
    document.getElementById('list-select').disabled = true;
    document.getElementById('add-to-list-btn').disabled = true;
    document.getElementById('favorite-btn').disabled = true;
    document.getElementById('rating-value').textContent = '-';
}

// Load file rating
async function loadFileRating(filePath) {
    try {
        // Get parent folder
        const folder = filePath.substring(0, filePath.lastIndexOf('/'));
        const data = await apiCall(`/ratings?folder=${encodeURIComponent(folder)}`);
        
        const rating = data.ratings.find(r => r.file === filePath);
        if (rating) {
            document.getElementById('rating-slider').value = rating.rating;
            document.getElementById('rating-value').textContent = rating.rating;
        } else {
            document.getElementById('rating-slider').value = 50;
            document.getElementById('rating-value').textContent = '-';
        }
    } catch (error) {
        console.error('Failed to load rating:', error);
    }
}

// Save rating
async function saveRating() {
    if (!state.selectedFile) return;
    
    const rating = parseInt(document.getElementById('rating-slider').value);
    const folder = state.selectedFile.path.substring(0, state.selectedFile.path.lastIndexOf('/'));
    
    try {
        await apiCall(`/ratings?folder=${encodeURIComponent(folder)}`, 'POST', {
            file: state.selectedFile.path,
            rating
        });
        
        document.getElementById('rating-value').textContent = rating;
        alert('Rating saved!');
    } catch (error) {
        console.error('Failed to save rating:', error);
        alert('Failed to save rating');
    }
}

// Add to list
async function addToList() {
    if (!state.selectedFile) return;
    
    const listId = document.getElementById('list-select').value;
    if (!listId) {
        alert('Please select a list');
        return;
    }
    
    try {
        const list = state.lists.find(l => l.id === listId);
        if (!list) return;
        
        // Check if already in list
        if (list.files.includes(state.selectedFile.path)) {
            alert('File already in list');
            return;
        }
        
        list.files.push(state.selectedFile.path);
        
        await apiCall(`/lists/${listId}`, 'PUT', {
            name: list.name,
            files: list.files
        });
        
        await loadLists();
        alert('Added to list!');
    } catch (error) {
        console.error('Failed to add to list:', error);
        alert('Failed to add to list');
    }
}

// View list
async function viewList(listId) {
    try {
        const data = await apiCall(`/lists/${listId}/files`);
        state.currentView = 'list';
        renderFileGrid(data.files);
        updateFileCount(data.files.length);
        
        // Update nav buttons
        document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    } catch (error) {
        console.error('Failed to view list:', error);
    }
}

// Get random file
async function getRandomFile() {
    try {
        const file = await apiCall('/random');
        openFileInTab(file.path);
    } catch (error) {
        console.error('Failed to get random file:', error);
        alert('No files available');
    }
}

// Export all ratings
async function exportAllRatings() {
    try {
        const data = await apiCall('/export/ratings/all', 'POST');
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'all_ratings.json';
        a.click();
    } catch (error) {
        console.error('Failed to export ratings:', error);
        alert('Failed to export ratings');
    }
}

// Update pagination
function updatePagination(page, totalPages) {
    state.currentPage = page;
    state.totalPages = totalPages;
    
    document.getElementById('page-info').textContent = `Page ${page} of ${totalPages}`;
    document.getElementById('prev-page').disabled = page === 1;
    document.getElementById('next-page').disabled = page === totalPages || totalPages === 0;
}

// Update file count
function updateFileCount(total) {
    document.getElementById('file-count').textContent = `${total} files`;
}

// Setup event listeners
function setupEventListeners() {
    // Navigation
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            state.currentView = btn.dataset.view;
            
            if (state.currentView === 'browse') {
                loadFiles();
            } else if (state.currentView === 'ratings') {
                loadAllRatings();
            }
        });
    });
    
    // Folder selection
    document.getElementById('select-folders-btn').addEventListener('click', () => {
        document.getElementById('folder-modal').classList.add('show');
        document.getElementById('folder-input').value = state.folders.join('\n');
    });
    
    document.getElementById('save-folders-btn').addEventListener('click', async () => {
        const input = document.getElementById('folder-input').value;
        const folders = input.split('\n').filter(f => f.trim()).map(f => f.trim());
        
        try {
            await apiCall('/folders', 'POST', { folders });
            state.folders = folders;
            renderFolders();
            document.getElementById('folder-modal').classList.remove('show');
            loadFiles();
        } catch (error) {
            console.error('Failed to save folders:', error);
            alert('Failed to save folders');
        }
    });
    
    document.getElementById('cancel-folders-btn').addEventListener('click', () => {
        document.getElementById('folder-modal').classList.remove('show');
    });
    
    // List creation
    document.getElementById('create-list-btn').addEventListener('click', () => {
        document.getElementById('list-modal').classList.add('show');
        document.getElementById('list-name-input').value = '';
    });
    
    document.getElementById('save-list-btn').addEventListener('click', async () => {
        const name = document.getElementById('list-name-input').value.trim();
        if (!name) {
            alert('Please enter a list name');
            return;
        }
        
        try {
            await apiCall('/lists', 'POST', { name, files: [] });
            await loadLists();
            document.getElementById('list-modal').classList.remove('show');
        } catch (error) {
            console.error('Failed to create list:', error);
            alert('Failed to create list');
        }
    });
    
    document.getElementById('cancel-list-btn').addEventListener('click', () => {
        document.getElementById('list-modal').classList.remove('show');
    });
    
    // Search
    let searchTimeout;
    document.getElementById('search-input').addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            state.searchQuery = e.target.value;
            state.currentPage = 1;
            loadFiles();
        }, 300);
    });
    
    // Pagination
    document.getElementById('prev-page').addEventListener('click', () => {
        if (state.currentPage > 1) {
            state.currentPage--;
            loadFiles();
        }
    });
    
    document.getElementById('next-page').addEventListener('click', () => {
        if (state.currentPage < state.totalPages) {
            state.currentPage++;
            loadFiles();
        }
    });
    
    // Refresh
    document.getElementById('refresh-btn').addEventListener('click', () => {
        loadFiles();
    });
    
    // Rating
    document.getElementById('rating-slider').addEventListener('input', (e) => {
        document.getElementById('rating-value').textContent = e.target.value;
    });
    
    document.getElementById('save-rating-btn').addEventListener('click', saveRating);
    
    // Add to list
    document.getElementById('add-to-list-btn').addEventListener('click', addToList);
    
    // Random file
    document.getElementById('random-file-btn').addEventListener('click', getRandomFile);
    
    // Export ratings
    document.getElementById('export-ratings-btn').addEventListener('click', exportAllRatings);
    
    // Close all tabs
    document.getElementById('close-all-tabs').addEventListener('click', () => {
        state.openTabs = [];
        state.activeTab = null;
        state.selectedFile = null;
        renderTabs();
        clearPreview();
        clearFileInfo();
    });
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', init);
