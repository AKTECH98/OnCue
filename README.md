# OnCue

**Realtime voice orchestration for live broadcast production.**

> Talk to your operation like you talk to your team.

OnCue lets a technical director speak to the production system using the same
shorthand they already use with a human crew — _"Ready three." "Take Daniel."
"Actually hold."_ — and turns that conversation into coordinated, validated
changes across cameras, microphones, graphics, media and the run of show.

A voice remote maps one command to one action. OnCue maps
**conversation + production state + context** to **coordinated operational action**.

---

## Architecture

Three layers, strictly separated.

| Layer                | Responsibility                               |
| -------------------- | -------------------------------------------- |
| **Higgs Realtime**   | Hear → Understand → Converse → Choose action |
| **Server / LangGraph** | Validate → Resolve → Orchestrate → Execute |
| **React client**     | Visualize → Confirm → Allow manual override  |

The server owns the single authoritative `BroadcastState`. The client renders it
and sends intents; it never computes production logic.

```text
client/    React + Vite + TypeScript + Tailwind + Zustand
  realtime/    WebSocket connection to the server
  store/       Mirror of the authoritative state
server/    Node + TypeScript + ws
  config/      Validated environment loading
  state/       Authoritative broadcast state + derived values
  http/        Health, state, traces, tool test harness
  websocket/   Realtime client protocol
  tracing/     LangSmith + local trace buffer
shared/    Types and the demo scenario used by both sides
  types/       Domain + wire protocol
  scenario.ts  FutureTech Live 2026
```

---

## Getting started

Requires **Node 20.11+** (Node 22 recommended). Everything installs locally into
this repository — no global installs are needed or used.

```bash
git clone https://github.com/AKTECH98/OnCue.git
cd OnCue

cp .env.example .env     # optional: fill in API keys, see below
npm install              # installs all three workspaces
npm run dev              # server on :43128, client on :43127
```

Then open **http://localhost:43127**.

### Scripts

| Command             | What it does                                       |
| ------------------- | -------------------------------------------------- |
| `npm run dev`       | Server + client together with live reload           |
| `npm run dev:server`| Backend only (`:43128`)                             |
| `npm run dev:client`| Frontend only (`:43127`)                            |
| `npm run typecheck` | TypeScript across all workspaces                    |
| `npm run build`     | Production client bundle                            |
| `npm start`         | Run the backend without watch mode                  |

### Inspecting the running system

```bash
curl http://127.0.0.1:43128/api/health      # service, Higgs mode, tracing mode
curl http://127.0.0.1:43128/api/state       # full authoritative broadcast state
curl http://127.0.0.1:43128/api/traces      # recent orchestration traces
curl -X POST http://127.0.0.1:43128/api/reset   # restore the rehearsal state
```

---

## API keys

**None are required to run OnCue.** The app degrades deliberately rather than
breaking, so the console is always usable.

| Variable           | Needed for                        | Without it                                                       |
| ------------------ | --------------------------------- | ---------------------------------------------------------------- |
| `HIGGS_API_KEY`    | Live voice (Phase 4+)             | Simulated voice mode; every manual control still works            |
| `LANGSMITH_API_KEY`| Hosted traces (Phase 3+)          | Traces are buffered in memory and served from `/api/traces`       |

Set them in `.env` at the repository root. The client never receives them: the
browser talks only to the OnCue server, which holds the credentials.

---

## The demo scenario

**FutureTech Live 2026**, with a fixed cast and run of show.

| Camera | Subject     | Mic   |
| ------ | ----------- | ----- |
| CAM 1  | Sarah Chen — CEO, Nova Labs | MIC 1 |
| CAM 2  | Maya Patel — Host           | MIC 2 |
| CAM 3  | Daniel Kim — VP Product, Nova Labs | MIC 3 |
| CAM 4  | Wide stage  | —     |

Run of show: Opening → Maya Introduction → Sarah Interview → Product Video →
Daniel Interview → Q&A → Closing.

The show boots mid-flight with Sarah live and roughly two minutes of accumulated
delay, so schedule reasoning has something real to work with.

---

## Build phases

OnCue is built in strict phases; each one has to satisfy its acceptance criteria
before the next begins.

- [x] **Phase 0** — Project foundation: workspaces, shared domain types, WebSocket link, tracing config
- [x] **Phase 1** — Broadcast simulator (fully operable by hand, no AI)
- [x] **Phase 2** — Deterministic broadcast domain tools
- [ ] **Phase 3** — LangGraph orchestration layer
- [ ] **Phase 4** — Higgs Realtime foundation
- [ ] **Phase 5** — Higgs tool calling
- [ ] **Phase 6** — Contextual production language
- [ ] **Phase 7** — Corrections and hold behavior
- [ ] **Phase 8** — Cue stack
- [ ] **Phase 9** — Compound orchestration
- [ ] **Phase 10** — Run-of-show intelligence
- [ ] **Phase 11** — Code-switching
- [ ] **Phase 12** — Observability and reliability pass
- [ ] **Phase 13** — Deployment
- [ ] **Phase 14** — Visual polish

---

## Operating the show by hand

Everything in OnCue can be driven manually, with or without voice. This is the
fallback path a real operator needs, and the rehearsal harness for the AI layers.

| Control            | Where                        | Effect                                                    |
| ------------------ | ---------------------------- | --------------------------------------------------------- |
| Ready / Take camera| Camera grid                  | Sets preview or program                                     |
| Ready / Take guest | Speakers panel               | Compound switch: camera, mic, lower third, segment          |
| Mic live/ready/mute| Audio panel                  | Per-microphone state                                        |
| Music bed          | Audio panel                  | 0–100 music level                                           |
| Lower thirds       | Graphics panel               | Show a guest's lower third or clear it                      |
| Next / Skip        | Run of Show                  | Advance or drop a segment; skipping buys back its budget    |
| Reset              | Header                       | Restores the known rehearsal state                          |

The same operations are reachable over HTTP for scripted testing:

```bash
curl -X POST http://127.0.0.1:43128/api/tools/prepare_guest \
  -H 'content-type: application/json' -d '{"guest":"daniel"}'

curl -X POST http://127.0.0.1:43128/api/tools/take_guest \
  -H 'content-type: application/json' -d '{"guest":"daniel"}'
```
