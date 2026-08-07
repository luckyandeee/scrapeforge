<div align="center">

# 🛡️ SCRAPEFORGE
### Telemetry & Harvester Core

![SCRAPEFORGE Header](frontend/public/installer/header.jpg)

[![Electron](https://img.shields.io/badge/Electron-Desktop_Core-0f172a?style=flat&logo=electron)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-UI_Matrix-0f172a?style=flat&logo=react)](https://reactjs.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Cloud_Sync-0f172a?style=flat&logo=mongodb)](https://www.mongodb.com/)
[![Ollama](https://img.shields.io/badge/Ollama-Local_AI-0f172a?style=flat&logo=ollama)](https://ollama.ai/)
[![Release](https://img.shields.io/badge/Release-v1.0.16-blue?style=flat)]()

**Engineered by VSS Gowri Tech Online Private Limited**

</div>

---

## 📡 System Overview
ScrapeForge is an enterprise-grade, local-first desktop application designed for autonomous data telemetry and harvesting. It utilizes a hybrid architecture: leveraging local machine hardware for resource-intensive tasks (like AI enrichment via embedded Ollama and SQLite caching) while securely transmitting verified datasets to a centralized MongoDB cloud matrix.

## ⚡ Core Capabilities

*   **Hybrid Data Architecture:** Operates with a local SQLite database for real-time buffering, automatically syncing sanitized records to a centralized MongoDB cluster.
*   **Local AI Enrichment:** Integrates directly with open-source LLMs via Ollama, processing data locally to ensure zero prompt leakage to third-party cloud APIs.
*   **Hardware-Gated Installation:** Custom installer scripts verify system capabilities (minimum 64-bit architecture and 4 CPU cores) prior to deployment to prevent hardware overload.
*   **Stealth Admin Matrix:** Features a securely hidden, multi-click biometric lock system preventing unauthorized end-user access to master cloud controls.
*   **Data Portability:** Instantly export active vectors to beautifully formatted PDF reports or Excel-safe CSV manifests.

---

## 📥 Direct Downloads

Get the latest stable release of ScrapeForge directly for your operating system:

| Platform | Direct Download Link | Target Architecture |
| :--- | :--- | :--- |
| **Windows** (.exe) | [Download for Windows](https://github.com/luckyandeee/scrapeforge/releases/latest/download/ScrapeForge-Setup.exe) | x64 (64-bit) |
| **macOS** (.dmg) | [Download for Mac](https://github.com/luckyandeee/scrapeforge/releases/latest/download/ScrapeForge.dmg) | Apple Silicon / Intel |
| **Linux** (.AppImage) | [Download for Linux](https://github.com/luckyandeee/scrapeforge/releases/latest/download/ScrapeForge.AppImage) | x64 |

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

### Initialization
```bash
# Clone the repository
git clone [https://github.com/luckyandeee/scrapeforge.git](https://github.com/luckyandeee/scrapeforge.git)

# Navigate into the matrix
cd scrapeforge

# Install core dependencies
npm install