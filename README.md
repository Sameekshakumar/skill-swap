# Skill Swap Platform

A credit-based peer-to-peer skill exchange platform with separate frontend and backend.

## Project Structure

```
skill-swap/
├── backend/              # Express.js API server
│   ├── server.js
│   ├── routes/
│   ├── models/
│   ├── middleware/
│   ├── package.json
│   ├── .env
│   └── node_modules/
├── frontend/             # React + Vite frontend
│   ├── src/
│   ├── index.html
│   ├── vite.config.js
│   ├── package.json
│   └── node_modules/
├── package.json          # Root scripts for convenience
└── README.md
```

## Getting Started

### Install Dependencies

Install all dependencies for both backend and frontend:

```bash
npm run install-all
```

Or manually:

```bash
cd backend && npm install
cd ../frontend && npm install
cd ..
```

### Development

Start both backend (port 5001) and frontend (port 3000) simultaneously:

```bash
npm run dev
```

Or run them separately:

```bash
# Terminal 1: Backend
npm run backend

# Terminal 2: Frontend
npm run frontend
```

### Environment Variables

Backend environment variables are in `backend/.env`:

```env
MONGO_URI=mongodb://localhost:27017/skillswap
JWT_SECRET=skillswap_secret_key_2025
PORT=5001
```

### Frontend API Configuration

The frontend is configured to proxy API requests to the backend via Vite's proxy setting in `frontend/vite.config.js`:

- Frontend runs on `http://localhost:3000`
- Backend runs on `http://localhost:5001`
- API requests to `/api/*` are proxied to `http://localhost:5001/api/*`

## Build & Deploy

### Build Frontend

```bash
npm run build
```

This creates an optimized production build in `frontend/dist/`.

### Start Backend

```bash
npm start
```

This starts the backend server on the configured PORT (default 5001).

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login user

### Profile
- `GET /api/profile` - Get user profile
- `PUT /api/profile` - Update user profile
- `POST /api/profile/skills/teach` - Add a teaching skill
- `POST /api/profile/skills/learn` - Add a learning skill
- `DELETE /api/profile/skills/teach/:skillId` - Remove a teaching skill
- `DELETE /api/profile/skills/learn/:skillName` - Remove a learning skill

### Bookings
- `GET /api/bookings` - Get user's bookings
- `POST /api/bookings` - Create a booking

### Users
- `GET /api/users` - List all users
- `GET /api/users/:id` - Get user details

## Technology Stack

### Backend
- Node.js + Express.js
- MongoDB + Mongoose
- JWT for authentication
- bcryptjs for password hashing

### Frontend
- React 18
- TypeScript
- Vite
- React Router
- Axios
- Tailwind CSS

## Development Notes

- Make sure MongoDB is running before starting the backend
- The frontend proxy will only work in development mode
- For production, the backend should serve the built frontend or they should be deployed separately

