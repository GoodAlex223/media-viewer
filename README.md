# Media Viewer

Electron desktop application for browsing, rating, and managing media files (images and videos) with visual similarity sorting and ML-based prediction features.

## Features

- **Media Browsing** — Navigate through image and video files with keyboard shortcuts
- **Rating System** — Like/Dislike/Special with automatic file organization
- **Compare Mode** — Side-by-side comparison for decision making
- **Similarity Sorting** — Group visually similar images using perceptual hashing
- **ML Prediction** — Learn user preferences for intelligent sorting
- **Zoom & Pan** — Mouse wheel zoom, double-click cycle, drag to pan
- **Face Detection** — Detect faces in images using face-api

## Installation

```bash
# Clone the repository
git clone https://github.com/goodalex223/media_viewer.git
cd media_viewer

# Install dependencies
npm install

# Run the application
npm start
```

## Usage

### Basic Navigation

| Key | Action |
|-----|--------|
| `Left Arrow` / `A` | Previous media |
| `Right Arrow` / `D` | Next media |
| `Enter` / `F` | Like current media |
| `Space` / `J` | Dislike current media |
| `Backspace` / `Z` | Undo last action |
| `F1` | Open help/settings |
| `ESC` | Reset zoom / Exit fullscreen |

### View Modes

- **Single Mode** — View one media file at a time
- **Compare Mode** — View two files side-by-side for comparison

### Sorting Options

- **Original** — File system order
- **Random** — Shuffle files
- **Similarity** — Group visually similar images together
- **AI Sort** — ML-based sorting by predicted preference

## Requirements

- Node.js 18+
- npm 9+
- Windows/macOS/Linux

## Tech Stack

| Component | Technology |
|-----------|------------|
| Framework | Electron 39.x |
| Language | JavaScript (ES6+) |
| UI | HTML/CSS (no framework) |
| Image Hashing | blockhash-js |
| Face Detection | @vladmandic/face-api |
| Video Metadata | ffprobe-static |

## Project Structure

```
media_viewer/
├── main.js              # Electron main process
├── preload.js           # Security bridge (context isolation)
├── media-viewer.js      # Renderer process (UI logic)
├── sorting-worker.js    # Web Worker for sorting algorithms
├── ml-worker.js         # Web Worker for ML predictions
├── feature-extractor.js # Image feature extraction
├── face-detector.js     # Face detection features
├── index.html           # Main HTML entry point
├── styles.css           # Application styles
└── docs/                # Project documentation
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — System design and data flows
- [Project Context](docs/PROJECT_CONTEXT.md) — Decisions and patterns
- [TODO](docs/planning/TODO.md) — Active tasks
- [Done](docs/planning/DONE.md) — Completed tasks

## License

MIT

---

*For Claude Code configuration, see [CLAUDE.md](CLAUDE.md) and [PROJECT.md](PROJECT.md).*
