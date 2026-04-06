<p align="center">
  <img src="docs/assets/logo.png" alt="BiamOS Logo" width="180"/>
</p>

# 🧬 BiamOS (Concept & Archive)

> **⚠️ IMPORTANT NOTICE: This project has been discontinued.**
>
> BiamOS is purely a **conceptual study** and idea collection. It is **not** a functioning software or a ready-to-use product. Active development has been stopped. This repository now serves solely as an archive for the conceptual approaches and architectural ideas.

---

## 🎯 What problem was it trying to solve?

The project originated from the observation that current AI agents and web automation tools (like Playwright, Puppeteer, or Selenium) often fail on modern, dynamic websites (Single Page Applications - SPAs).

The core problems of traditional approaches that we wanted to solve:
- **Fragile DOM Selectors:** AI agents rely on HTML code, which can change with every site update.
- **Bot Detection:** Automated interactions are reliably blocked by captchas (like Cloudflare Turnstile or Recaptcha v3).
- **Lack of Context:** AI agents suffer from "amnesia." They do not learn from past mistakes on specific websites.

## 💡 The BiamOS Concept

BiamOS was designed as an **Autonomous AI Web Browser** functioning as a native desktop system. The goal was to elevate the interaction between AI and web browsers to a human-like perception level ("Vision-First").

The central architectural ideas (Theoretical Approaches):

### 1. 🕷️ Autonomous Web Agent (The WORMHOLE Engine)
Instead of relying on DOM selectors, the AI was designed to use visual perception (Live 4D Raycasting / Kinetic Sonar). The agent would understand where elements are on the screen (Vision-First) and simulate genuine, human-like OS-level mouse clicks via calculated Bézier curves (GhostCursor) to bypass bot detections.

### 2. 🧠 Domain Brain & The Librarian
A local, learning RAG knowledge base. The agent was supposed to learn how websites work over time. If an approach failed or the agent got caught in an infinite loop, a background process ("The Librarian") would intervene, analyze the mistake, and permanently save an avoidance rule.

### 3. 👻 Ghost-Auth (Zero-OAuth)
A radically local and private approach to permissions. Instead of issuing API keys or insecure OAuth tokens to startups, the user would log in directly via the embedded Chromium module (e.g., YouTube, Gmail). The AI would then safely and completely locally piggyback on this existing session.

### 4. 💪 Muscle Memory (Workflow-Replay)
A caching layer for complex workflows. Once a task was successfully solved and marked as a "success" (e.g., flight search with specific filters), the exact execution sequence would be stored in a local SQLite database ("Muscle Memory"). Future identical intent calls would no longer require expensive LLM compute time but instantly play back the learned solution.

## 🏗️ Theoretical Technology Stack

- **Desktop Shell:** Electron (Chromium Webview, native OS access)
- **Frontend / UI:** React 19 (Spatial Canvas for AI perception)
- **Backend:** Node.js / Hono
- **Storage:** Drizzle ORM + local SQLite

---

*This project remains as an open concept and technological inspiration.*
*Conceived in Vienna, Austria 🇦🇹.*
