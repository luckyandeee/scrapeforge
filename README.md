<div align="center">

# 🛡️ SCRAPEFORGE
### Telemetry & Harvester Core

![SCRAPEFORGE Header](frontend/public/installer/header.jpg)

[![Electron](https://img.shields.io/badge/Electron-Desktop_Core-0f172a?style=flat&logo=electron)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-UI_Matrix-0f172a?style=flat&logo=react)](https://reactjs.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Cloud_Sync-0f172a?style=flat&logo=mongodb)](https://www.mongodb.com/)
[![Ollama](https://img.shields.io/badge/Ollama-Local_AI-0f172a?style=flat&logo=ollama)](https://ollama.ai/)

**Engineered by VSS Gowri Tech Online Private Limited**

</div>

---

## 📡 System Overview
ScrapeForge is an enterprise-grade, local-first desktop application designed for autonomous data telemetry and harvesting. It utilizes a hybrid architecture: leveraging local machine hardware for resource-intensive tasks (like AI enrichment via embedded Ollama and SQLite caching) while securely transmitting verified datasets to a centralized MongoDB cloud matrix.

## ⚡ Core Capabilities

*   **Hybrid Data Architecture:** Operates with a local SQLite database for real-time buffering, automatically syncing sanitized records to a centralized MongoDB cluster.
*   **Local AI Enrichment:** Integrates directly with open-source LLMs via Ollama, processing data locally to ensure zero prompt leakage to third-party cloud APIs.
*   **Hardware-Gated Installation:** Custom NSIS installer scripts verify system capabilities (minimum 64-bit architecture and 4 CPU cores) prior to deployment to prevent hardware overload.
*   **Stealth Admin Matrix:** Features a securely hidden, multi-click biometric lock system preventing unauthorized end-user access to master cloud controls.
*   **Data Portability:** Instantly export active vectors to beautifully formatted PDF reports or Excel-safe CSV manifests.

---

## 🛠️ Technical Stack

**Frontend / UI:**
*   React 18 + Vite
*   TypeScript
*   Tailwind CSS (Custom Cyber-Aesthetic Theme)
*   Lucide React (Iconography)

**Backend / Core:**
*   Electron (Desktop Engine)
*   Node.js (Internal Routing)
*   Ollama (Local AI Processing Bridge)

**Data Layer:**
*   Local: SQLite
*   Cloud: MongoDB Centralized Cluster

---

## ⚙️ Development & Build Setup

### Prerequisites
*   Node.js (v18+)
*   Git
*   Minimum hardware for testing: 4-Core CPU, 64-bit OS.
*   **Access Rights:** Authorized GitHub credentials (SSH Key or Personal Access Token) for private repository access.

### Initialization
```bash
# Clone the private repository (requires authentication)
git clone https://github.com/luckyandeee/scrapeforge.git

# Navigate into the matrix
cd scrapeforge

# Install core dependencies
npm install

## 🚀 Available Scripts

### Frontend Development
* `cd frontend && npm run dev` — Start the Vite frontend development server.
* `cd frontend && npm run build` — Build the production React frontend assets.

### Backend & Core Development
* `npm run dev` — Start the local backend development server using `tsx`.
* `npm run build:react` — Build the frontend application and stage assets.
* `npm run build:electron` — Compile the Electron backend TypeScript code.
* `npm run dist` — Build the standalone Windows NSIS installer locally (`.exe`).

### Git & Release Automation
* `npm run save` — Quickly stage, commit, and push code changes to GitHub without building an installer.
* `npm run release` — Interactively bump versions (patch/minor/major), compile the app, and publish the release payload to GitHub Releases.