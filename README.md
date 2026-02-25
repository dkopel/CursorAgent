# CursorAgent

User authentication system with secure password management.

## Features

- **User Registration** with unique email enforcement (case-insensitive)
- **Secure Password Storage** using bcrypt (12 salt rounds)
- **Strong Password Validation** — minimum 8 chars, uppercase, lowercase, number, special character, with real-time strength indicator
- **Password Reset via Email** — tokenized, time-limited (1 hour), single-use
- **Change Password** for authenticated users
- **JWT-based Authentication**

## Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:3000 in your browser.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with auto-reload |
| `npm start` | Start production server |
| `npm test` | Run all tests |
| `npm run lint` | Run ESLint |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/forgot-password` | Request password reset |
| POST | `/api/auth/reset-password` | Reset password with token |
| POST | `/api/auth/change-password` | Change password (auth required) |
| GET | `/api/health` | Health check |

## Tech Stack

- **Runtime:** Node.js 22
- **Framework:** Express
- **Database:** SQLite (better-sqlite3)
- **Password Hashing:** bcryptjs
- **Tokens:** jsonwebtoken
- **Email:** nodemailer