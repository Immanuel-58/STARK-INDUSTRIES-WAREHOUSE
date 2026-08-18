# STARK INDUSTRIES WAREHOUSE — J.A.R.V.I.S 

> AI-Powered Autonomous Warehouse Decision Intelligence & Real-Time Fulfillment Orchestration Platform.

---

##⚡ System Overview

**STARK INDUSTRIES WAREHOUSE** is a deterministic warehouse management and decision execution system powered by **J.A.R.V.I.S**. It dynamically resolves fulfillment bottlenecks, executes intelligent inventory allocation, manages SLA breach risks, orchestrates workstation pipelines, and traces causal decision graphs.

### Core Modules

1. **Mission Control (Control Tower)**: Real-time telemetry, backlog monitoring, SLA risk tracking, and throughput analytics.
2. **Deterministic Decision Engine**: Multi-factor priority scoring, inventory conflict resolution, stock shortage handling, and order-splitting rules.
3. **Workstation Sub-systems**:
   - 🚜 Field Deployment (Picking Station)
   - 🎁 Assembly Station (Packing Station)
   - 🔍 Suit Inspection (Quality Control)
   - 🚀 Launch Sequence (Dispatch Dock)
4. **J.A.R.V.I.S Decision Graph**: Interactive DAG visualizing the causal reasoning chain behind all routing and allocation events.
5. **God Mode / What-If Simulator**: Real-time simulation environment for injecting demand surges, inventory damage, and rush orders.
6. **Live Keynote Playbook**: Presenter HUD for live demonstrations with hotkey controls and audio telemetry.

---

## 🛠️ Technology Stack

- **Framework**: Next.js 16 (App Router + Turbopack)
- **UI & Styling**: React 19, Tailwind CSS v4, Custom STARK HUD Theme
- **Data & Storage**: Supabase (PostgreSQL) + Resilient In-Memory Fallback Store
- **Type Safety & Validation**: TypeScript 5, Zod v4
- **Visualization**: Recharts, SVG Causal Graph Engine
- **Testing**: Vitest, React Testing Library

---

## 🚀 Getting Started

### 1. Prerequisites

- Node.js 18+ (Node.js 20+ recommended)
- npm, pnpm, or yarn

### 2. Environment Setup

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Configure your environment variables:

```env
# Supabase (Optional for full cloud persistence; in-memory fallback enabled by default)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Application Base URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development
```

### 3. Install Dependencies & Run

```bash
npm install
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧪 Verification & Testing

Run the automated test suite:

```bash
npm test
```

Run TypeScript typecheck:

```bash
npx tsc --noEmit
```

Build for production:

```bash
npm run build
```

---

## 🌐 Production Deployment

### Deploying to Vercel

1. Push this repository to GitHub (ensure `.env.local` is ignored as configured in `.gitignore`).
2. Import the project in [Vercel](https://vercel.com).
3. Set the environment variables from `.env.example` in your Vercel Project Settings.
4. Deploy! Next.js will automatically detect build settings (`npm run build`).

---

## 🔒 Security & Safe Defaults

- Secrets and `.env*.local` are strictly protected in `.gitignore`.
- Safe in-memory store allows the platform to boot and run out-of-the-box in stateless / preview environments without hardcoded credentials.
- All client-side APIs and services enforce strict input validation via Zod schemas.

---

*STARK INDUSTRIES © J.A.R.V.I.S WMS System.*
