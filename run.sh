#!/bin/bash
# Start the Media Library Manager

echo "Starting Media Library Manager..."
echo "Navigate to http://localhost:8000 in your browser"
echo ""

cd "$(dirname "$0")/backend/app"
python main.py
