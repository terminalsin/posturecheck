#!/bin/bash
cd backend
echo "🚀 Starting Posture Check Backend Server..."

# Check if virtual environment exists
if [ ! -d ".venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv .venv
fi

# Activate virtual environment
echo "🔧 Activating virtual environment..."

# Install requirements
echo "📥 Installing Python dependencies..."
pip install -r requirements.txt
pip install flask flask-cors

# Check if GOOGLE_API_KEY is set
if [ -z "$GOOGLE_API_KEY" ]; then
    echo "⚠️  Warning: GOOGLE_API_KEY environment variable is not set."
    echo "   Image analysis will be disabled."
    echo "   Set it with: export GOOGLE_API_KEY=your_api_key_here"
    echo ""
fi

# Start the Flask server
echo "🌟 Starting Flask backend server on http://localhost:5000..."
python backend_server.py 