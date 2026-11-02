# Jatimetri Assessment Platform

**Live demo:** [jatimetri.belajarcarabelajar.com](https://jatimetri.belajarcarabelajar.com)

![Jatimetri landing page](docs/images/screenshot.png)

Jatimetri is a psychological assessment application designed to help users discover their true potential through an interactive assessment flow. It provides personal profiling, detailed reporting, and visual data representations using a modern React frontend and a serverless API backend.

## Architecture

The project is structured as a monorepo containing two primary layers:

- **Frontend (`/src`)**: A React Single Page Application built with Vite, TypeScript, TailwindCSS, and Shadcn UI. State is managed via Zustand, authentication is securely handled by Clerk, and reporting includes PDF generation and radar charts.
- **Backend (`/worker`)**: A Cloudflare Worker built with Hono and Drizzle ORM. It provides a secure API to save attempts, retrieve historical reports, and upload generated PDFs.

### Directory Structure

- `src/features/` - Core application feature modules (`assessment`, `dashboard`, `profile`, `pdf`).
- `src/components/` - Shared UI and layout components.
- `src/routes/` - Application routing definitions.
- `worker/src/` - Backend API entry point (`index.ts`) and database schema (`db/`).

## Prerequisites

- [Node.js](https://nodejs.org/) (v18 or newer recommended)
- `npm` package manager
- A [Clerk](https://clerk.com/) Account (for authentication)
- A [Cloudflare](https://dash.cloudflare.com/) Account (for Workers, D1 Database, and R2 Storage)

## Environment Variables

Configuration is required for both the frontend and the backend.

### Frontend (`.env`)
Create a `.env` file in the root directory for local development:
```env
# Your Clerk Publishable Key
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...

# In production (.env.production), define the API URL:
# VITE_API_URL=https://jatimetri-api.<your-subdomain>.workers.dev
```

### Backend (`worker/.dev.vars`)
Create a `.dev.vars` file in the `worker/` directory for local backend secrets:
```env
# Your Clerk Secret Key
CLERK_SECRET_KEY=sk_test_...
```

*Note: The backend also relies on `CLERK_PUBLISHABLE_KEY` configured within the `[vars]` block inside `wrangler.toml`.*

## Installation & Setup

1. **Install Frontend Dependencies**
   From the root of the project:
   ```bash
   npm install
   ```

2. **Install Backend Dependencies**
   Navigate to the worker directory and install its packages:
   ```bash
   cd worker
   npm install
   ```

3. **Configure Cloudflare Services**
   The backend relies on Cloudflare D1 and R2. Ensure `wrangler.toml` is updated with your specific IDs and bindings:
   - **D1 Database Binding:** `DB` (Database Name: `inner_potential_db`)
   - **R2 Bucket Binding:** `REPORTS_BUCKET` (Bucket Name: `jatimetri-reports`)

## Development

You need to run both the frontend and the backend simultaneously for full local functionality.

**Start the Backend (API)**
Open a terminal, navigate to the worker directory, and start the local Cloudflare dev server:
```bash
cd worker
npm run dev
```

**Start the Frontend**
Open a separate terminal in the root directory and start Vite:
```bash
npm run dev
```

## Testing

The frontend uses Vitest for testing. Run the following commands from the root directory:

- Run all tests: `npm run test`
- Run tests in watch mode: `npm run test:watch`
- Generate test coverage: `npm run test:coverage`

## Build & Deployment

### Frontend
To build the frontend for production:
```bash
npm run build
```
To preview the production build locally:
```bash
npm run preview
```

### Backend (API)
To deploy the Cloudflare worker to your production environment:
```bash
cd worker
npm run deploy
```
