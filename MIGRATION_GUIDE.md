# Project Reorganization Migration Guide

This guide explains how to complete the reorganization from a monolithic structure to separate backend/frontend folders.

## What Has Been Created

✅ **Already done (automated):**
- Created `/backend` and `/frontend` folder structure
- Created `backend/package.json` with backend dependencies only
- Created `frontend/package.json` with frontend dependencies only
- Created `backend/server.js` (copy of root server.js)
- Created `frontend/vite.config.js`, `frontend/index.html`, `frontend/tailwind.config.js`
- Updated root `package.json` with convenient scripts
- Updated `.gitignore` for the new structure
- Created comprehensive README.md

## What You Need to Move Manually

You'll need to move the following folders/files. You can do this using your file explorer or terminal:

### Move to `/backend`:

```bash
# From root to backend/
mv middleware/ backend/
mv models/ backend/
mv routes/ backend/
mv .env backend/.env  # (already created, but you can update it)
```

### Move to `/frontend`:

```bash
# From root to frontend/
mv src/ frontend/
mv public/ frontend/  # (if you have it)
```

### Files That Can Stay in Root (or Delete)

These are now handled by the new structure:

```bash
# You can delete these files from root (they're now in backend/ or frontend/):
rm server.js           # → moved to backend/server.js
rm vite.config.js      # → moved to frontend/vite.config.js
rm tailwind.config.js  # → moved to frontend/tailwind.config.js
rm eslint.config.js    # → moved to frontend/eslint.config.js
rm index.html          # → moved to frontend/index.html
rm .env                # → copy created in backend/.env
```

## Setup Instructions

### Step 1: Move Directories

Run the move commands from the root directory:

```bash
cd /Users/sameekshakumar/Documents\ -\ MacOS/my-project-name

# Move backend files
mv middleware backend/
mv models backend/
mv routes backend/

# Move frontend files
mv src frontend/
```

### Step 2: Update Backend Routes

Your backend routes are still importing from relative paths. This should work fine since the routes folder is now in the same directory as `server.js`.

Check that `backend/server.js` still correctly imports:
```javascript
app.use('/api/auth', require('./routes/auth'));
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/users', require('./routes/users'));
app.use('/api/profile', require('./routes/profile'));
```

### Step 3: Install Dependencies

From the root directory:

```bash
npm run install-all
```

This will install:
- Root dependencies (just concurrently)
- Backend dependencies
- Frontend dependencies

### Step 4: Test the Setup

Start the development environment:

```bash
npm run dev
```

This should:
1. Start the backend on `http://localhost:5001`
2. Start the frontend on `http://localhost:3000`
3. Show both processes in your terminal

## Verification Checklist

After moving files, verify:

- [ ] Backend folder has: `server.js`, `middleware/`, `models/`, `routes/`, `package.json`, `.env`
- [ ] Frontend folder has: `src/`, `index.html`, `vite.config.js`, `tailwind.config.js`, `eslint.config.js`, `package.json`
- [ ] Root folder has: `backend/`, `frontend/`, `package.json`, `README.md`, `.gitignore`, `.git/`
- [ ] `npm run dev` starts both processes
- [ ] Frontend can access backend API via `http://localhost:3000` → proxy → `http://localhost:5001/api`

## Cleaning Up

After everything works, you can delete the old root-level files:

```bash
rm -f server.js vite.config.js tailwind.config.js eslint.config.js index.html
# Keep .env in backend/, but remove root .env if you moved it
```

## Development Commands

### From Root

```bash
npm run dev              # Run both backend and frontend
npm run backend          # Run just backend
npm run frontend         # Run just frontend
npm run install-all      # Install all dependencies
npm run build            # Build frontend
npm start                # Start backend server (production)
```

### From Individual Folders

```bash
# Backend only
cd backend
npm run dev              # Run with nodemon
npm start                # Run normally

# Frontend only
cd frontend
npm run dev              # Run Vite dev server
npm run build            # Build for production
```

## Troubleshooting

### `npm run dev` fails

Make sure both `backend/node_modules` and `frontend/node_modules` exist. Run:
```bash
npm run install-all
```

### Port already in use

If port 5001 or 3000 is already in use:
- Change backend port in `backend/.env`: `PORT=5002`
- Change frontend port in `frontend/vite.config.js`: `port: 3001`

### Module not found errors

Make sure all files are in the right place. Double-check:
- `backend/routes/` exists and has auth.js, bookings.js, etc.
- `backend/models/` exists and has User.js, Booking.js, etc.
- `backend/middleware/` exists and has auth.js
- `frontend/src/` exists with all React components

## Next Steps

After successful migration:

1. Test all features (registration, login, profile, etc.)
2. Update your deployment configuration if needed
3. Commit to git with a clear message: `Refactor: Separate frontend and backend into distinct folders`
4. Update any CI/CD pipelines to build/deploy both folders separately if desired
