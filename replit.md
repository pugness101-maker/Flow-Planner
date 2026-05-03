# Flow Planner

## Overview
A simple static web app (HTML/CSS/JS) for personal planning. Features include time blocks, habits, social hangouts tracking, and a daily planner. All data is stored in the browser's localStorage.

## Project Structure
- `index.html` — Main HTML entry point
- `styles.css` — App styles (579 lines)
- `app.js` — All application logic (2613 lines, vanilla JS)
- `server.js` — Lightweight Node.js HTTP server for serving static files

## Running the App
The app is served via a Node.js static file server on port 5000.

**Workflow:** `Start application` → `node server.js`

## Architecture
- Pure frontend: no backend, no database, no build step
- Data persistence: browser localStorage
- No npm packages or build system required

## Deployment
- Type: static
- Public directory: `.` (project root)
