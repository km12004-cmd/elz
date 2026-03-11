# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Elzaman is a React SPA for learning the Kyrgyz language through songs and games. It connects to a backend API at `http://127.0.0.1:8000`.

## Commands

```bash
npm run dev       # Start Vite dev server with HMR
npm run build     # Production build
npm run lint      # Run ESLint
npm run preview   # Preview production build
```

No test suite is configured.

## Architecture

### Tech Stack
- React 19 + Vite (rolldown-vite)
- React Router DOM 6 for routing
- CSS Modules for styling (no CSS framework)
- No TypeScript, no Redux/Zustand

### API Layer (`src/api/`)
All API calls go through `client.js`, which exports `apiRequest()`. This function:
- Injects the JWT Bearer token from auth context automatically
- Wraps errors in a custom `ApiError` class (with `.status` and `.data`)
- Sets `credentials: 'include'`

Each module (`songs.js`, `flashcards.js`, `playlists.js`, `pairsGame.js`, `auth.js`) normalizes API responses via dedicated `normalize*()` functions that handle snake_case/camelCase variants and missing fields.

The Vite dev proxy maps `/api` → `http://127.0.0.1:8000`. Override with `VITE_API_BASE_URL` env var.

### Authentication (`src/auth/`)
- `AuthProvider.jsx` stores auth state in localStorage under key `'elzaman_auth'`
- Session TTL: 15 days; token auto-refreshes every 12 hours
- Access via `useAuth()` hook → `{ token, user, isAuthenticated, signIn, signUp, signOut, setUser }`

### Routing (`src/App.jsx`)
```
/                          → Home (placeholder)
/songs/:songId             → Song lesson (SongLessonPage - largest page, ~2600 lines)
/cards                     → Flashcard folders
/cards/:folderId           → Cards in folder
/playlists                 → Playlists list
/playlists/:playlistId     → Playlist detail
/profile                   → User profile
```

### Progress / XP State (`src/contexts/`)
- `ProgressContext.jsx` — `ProgressProvider` component; fetches `GET /api/progress` on login
- `progressContext.js` — bare `createContext(null)` (separate file to satisfy react-refresh lint rule)
- `useProgress.js` — `useProgress()` hook (separate file, same reason)
- Exposed: `{ progress, applyXpResult, xpNotification, levelUpNotification, dismissXpNotification, dismissLevelUpNotification }`
- `applyXpResult({ applied, xpDelta, newXp, newLevel, ... })` — call after any completion endpoint; updates state and queues XP toast / level-up modal automatically
- `src/utils/xpLevels.js` — mirrors the backend `LEVEL_THRESHOLDS` array and `xpFillPercent(level, xpTotal)` helper

### XP UI Components
- `src/components/ui/XpToast/` — fixed top-right toast, reads `xpNotification` from context, auto-dismisses after 3s
- `src/components/ui/LevelUpModal/` — overlay modal, reads `levelUpNotification`, auto-dismisses after 3.5s
- `src/components/layout/Header/XpWidget.jsx` — compact level badge + progress bar in header (hidden when unauthenticated)

### Key Patterns
- **Normalization resilience**: API modules include retry logic for 400/422/404 responses and fallback endpoint paths to handle backend inconsistencies.
- **Global state**: Auth (`src/auth/`) and XP progress (`src/contexts/`) are global; everything else uses local `useState`/`useEffect`.
- **Responsive breakpoint**: 900px (desktop sidebar collapsible, mobile sidebar is an overlay).
- **ESLint config**: `no-unused-vars` ignores uppercase and underscore-prefixed identifiers. `react-hooks/set-state-in-effect` prohibits synchronous `setState` inside `useEffect` bodies.
