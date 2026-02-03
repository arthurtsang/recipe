# Video Import Plan: YouTube & Instagram → Recipe Extraction

**Goal:** Import recipe content from YouTube and Instagram video URLs by downloading audio, transcribing (EN / ZH / ES), combining with video description, and sending to the existing LLM recipe-extraction pipeline. Optional: show embedded video when supported.

**Status:** Planning only — no implementation yet.

---

## 1. High-Level Flow

```
User submits URL (YouTube or Instagram)
    → Detect source (YouTube / Instagram)
    → Download video (or audio-only) + metadata (description)
    → Extract audio (if we downloaded video)
    → Transcribe audio (Whisper) — EN, ZH, ES
    → Combine: description + transcription
    → Send to LLM → extract recipe (reuse existing extract_recipe_with_llm-style flow)
    → Return ImportRecipeResponse (same as current web import)
```

- **Display:** We do not need to support playback; if we want, we can show an embedded player for YouTube (and Instagram where iframe/oEmbed is available) using the original URL.
- **Primary output:** Recipe (title, ingredients, instructions, description, etc.) from description + transcript.

---

## 2. Current System Context

- **Backend (recipe):** Creates `ImportJob` with `url`, POSTs to AI service `POST /import-recipe` with `{ url }`, polls `GET /import-recipe/status/{jobId}`, then saves result as recipe.
- **AI service:** `import_recipe_from_url(url)` → Playwright fetches HTML → clean HTML → `extract_recipe_with_llm(visible_text)` → `ImportRecipeResponse`. So current import is **web-page-only** (HTML text + images).
- **Video path:** We need a **parallel path** in the AI service: for video URLs, run download → audio → transcribe → description+transcript → LLM, and return the same `ImportRecipeResponse` shape so the backend and UI stay unchanged.

---

## 3. Key Integrations & Tools

### 3.1 Download: YouTube & Instagram

| Tool | Role | Notes |
|------|------|--------|
| **yt-dlp** | Download video/audio + metadata | Single tool for both YouTube and Instagram. |

**YouTube**

- **Public videos:** No login. `yt-dlp <url>` works.
- **Age-restricted / private / members-only:** Login required. Options:
  - **Cookies:** `yt-dlp --cookies-from-browser chrome <url>` (user has logged-in browser).
  - **OAuth:** yt-dlp can use browser cookies; no first-class “YouTube OAuth app” flow needed for basic download.
- **Saved / Watch Later:** No official API. Playlist URL `https://www.youtube.com/playlist?list=WL` works **only when the user is logged in**. With `--cookies-from-browser chrome` (or similar), yt-dlp can download the WL playlist. So “import from saved” = user exports Watch Later (or we use cookies and pass `playlist?list=WL`); we can also support “import all from this playlist” for any playlist URL.

**Instagram**

- **Public posts/reels:** Often work without login; can break. **Private / Reels / Stories:** Login required.
- **yt-dlp supports Instagram** with auth:
  - `--cookies-from-browser chrome` (or firefox, etc.)
  - Or `--cookies /path/to/cookies.txt`
- **Saved posts:** No official API. Options:
  - **User provides URLs:** User copies links from their saved collection; we accept single URL or list (same as current multi-URL import).
  - **Unofficial:** e.g. `instagram-private-api` (Node/Python) can list saved with login — higher risk (ToS, breakage). For “clean path,” plan for **manual URL list** first; optional later: explore saved-collection with clear ToS/risk disclaimer.

**Recommendation**

- Use **yt-dlp** as the single downloader for both YouTube and Instagram.
- **YouTube:** Support single URL and playlist URL (e.g. `list=WL` or any `list=...`). For WL/saved, require cookies (e.g. “use Chrome while logged in” and `--cookies-from-browser chrome`).
- **Instagram:** Support single URL (and batch list of URLs). Require cookies for private/saved; document that user must be logged in (e.g. Chrome) and we use `--cookies-from-browser chrome`.

**Implementation note:** Run yt-dlp from Python (subprocess or `yt_dlp` Python package). Prefer **audio-only** to save space and speed: e.g. `-x --audio-format mp3` or best available.

---

### 3.2 Metadata (Description)

- **yt-dlp** can write full metadata (including description) to JSON: `--write-info-json`. 
- We only need the description (and title) in memory for the LLM; we can run yt-dlp with `--write-info-json` to a temp dir, read the `.info.json`, then discard. Or use the Python API and get `info_dict['description']`, `info_dict['title']` without writing files if the API supports it.
- **Key point:** Always fetch description from yt-dlp metadata; combine with transcript for recipe extraction.

---

### 3.3 Transcription (EN, ZH, ES)

Requirements: at least **English, Chinese, Spanish**; long videos (e.g. 30+ min).

| Option | Pros | Cons |
|--------|------|------|
| **OpenAI Whisper API** | No GPU, good quality, multi-language | 25 MB file limit → must chunk long audio |
| **Local Whisper (openai/whisper)** | No 25 MB limit, long files handled internally | Needs GPU/CPU; slower |
| **faster-whisper** | Faster, less VRAM, same languages | Same as local Whisper (deploy on our side) |

**Recommendation**

- **Preferred:** **Local Whisper** (e.g. **faster-whisper** in Python) in the AI service so we don’t have to chunk or hit 25 MB API limit. Supports EN, ZH, ES and auto-detect.
- **Alternative:** Whisper API + chunking (e.g. PyDub/FFmpeg 25 MB chunks, overlap, merge) if we don’t want to run GPU in the AI service.
- **Language:** Use auto-detect or allow optional hint (e.g. `language=en` or `language=zh`). No need to force user to pick if we use auto.

---

### 3.4 Recipe Extraction from Description + Transcript

- Reuse the same **LLM extraction** as today: input = one blob of text (here: “description + transcript” instead of HTML-cleaned text).
- **Implementation:** In the AI service, add a path: if URL is video (YouTube/Instagram), run download → audio → transcribe → build `combined_text = f"Video title: {title}\n\nDescription:\n{description}\n\nTranscript:\n{transcript}"`, then call the same `extract_recipe_with_llm(combined_text)` (or a thin wrapper that expects this format). Output remains `ImportRecipeResponse` so backend/UI unchanged.
- Optional: add a small “source type” in the recipe (e.g. `sourceType: 'video'`, `videoUrl: url`) for display/embedding later.

---

### 3.5 Optional: Embedded Video

- **YouTube:** Standard iframe embed from the same URL we imported (e.g. `https://www.youtube.com/embed/<id>`). No extra integration.
- **Instagram:** Embed via oEmbed or Instagram’s embed snippet; some Reels may have limited embed support. Can be “best effort” and fall back to link.
- **Scope:** Not required for MVP; add when we have a recipe detail UI that can show “source video.”

---

## 4. Where Each Piece Lives

| Piece | Where | Notes |
|-------|--------|--------|
| URL type detection | AI service | Detect YouTube vs Instagram vs “normal” URL; dispatch to web vs video pipeline. |
| yt-dlp (download + metadata) | AI service | Subprocess or `yt_dlp` Python lib; temp dir for audio + info.json. |
| FFmpeg | AI service (or system) | yt-dlp uses it for audio extraction; ensure installed. |
| Whisper (transcription) | AI service | faster-whisper (or openai/whisper) in Python. |
| LLM recipe extraction | AI service | Existing `extract_recipe_with_llm`; new input = description + transcript. |
| Import job lifecycle | Backend (recipe) | Unchanged: create job, POST url to AI, poll status, save recipe. |
| Cookies (YouTube/Instagram) | TBD | Option A: server-side cookies file path (e.g. from user upload or admin). Option B: “use browser” flow where user runs a one-time export and we don’t store credentials. For WL/saved, we need a clear story (e.g. “log in in Chrome, then run import” with `--cookies-from-browser`). |

---

## 5. Clean Path Forward (Phased)

### Phase 1: Single video URL (YouTube, then Instagram)

1. **AI service**
   - Add URL classifier: `is_youtube_url(url)`, `is_instagram_url(url)`.
   - If video URL → new pipeline:  
     `download_with_yt_dlp(url) → get description/title from metadata → extract_audio → transcribe (faster-whisper) → combine description + transcript → extract_recipe_with_llm(combined) → ImportRecipeResponse`.
   - Keep existing web import for non-video URLs.
   - No cookie support in Phase 1: public YouTube and public Instagram only (accept age-restricted failures with a clear error).

2. **Backend**
   - No change: same `POST /import-recipe` with `url`; backend already polls and saves result.

3. **Dependencies**
   - AI service: add `yt-dlp` (or `yt-dlp` binary), `ffmpeg`, `faster-whisper` (or `openai-whisper`). Document in README/setup.

### Phase 2: Login / cookies and “saved” sources

1. **Cookies**
   - Support `--cookies-from-browser` or `--cookies /path/to/cookies.txt` for yt-dlp (e.g. via env or config: `YTDLP_COOKIES_BROWSER=chrome` or `YTDLP_COOKIES_FILE=/path`). Use only for the import worker that runs yt-dlp.
   - Document: “For age-restricted YouTube or Instagram, log in in Chrome (or export cookies) and configure the server.”

2. **YouTube “saved”**
   - Support playlist URL: `https://www.youtube.com/playlist?list=WL` (Watch Later). When cookies are configured, yt-dlp can download the whole playlist; we create one import job per video (or batch N URLs per job). Backend already supports multiple URLs.

3. **Instagram “saved”**
   - No official API. Phase 2: accept **multiple URLs** (user pastes list from their saved). Optional later: explore instagram-private-api or similar with clear risk/ToS note.

### Phase 3: UX and embedding

1. **Recipe source**
   - Store `sourceUrl` (already exists); optionally `sourceType: 'video'` and `videoEmbedUrl` for display.
2. **Embed**
   - On recipe detail page: if `sourceUrl` is YouTube/Instagram, show iframe or embed link.

---

## 6. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| yt-dlp breakage (YouTube/Instagram changes) | Pin yt-dlp version; watch releases; test periodically. |
| Instagram ToS | Use for personal recipe import; avoid redistributing video; consider disclaimer. |
| Long / large videos | Prefer audio-only download; local Whisper handles long audio. |
| Language misdetection | Prefer Whisper auto-detect; optional `language` hint in a later phase. |
| Cookies on server | Prefer “user exports cookies” or “use browser on a dedicated machine” rather than storing passwords. |

---

## 7. Summary

- **Download:** yt-dlp only (YouTube + Instagram); audio-only preferred; metadata gives description.
- **Transcription:** Local Whisper (e.g. faster-whisper), EN/ZH/ES (and others via auto-detect).
- **Recipe:** Same LLM pipeline; input = video description + transcript; output = existing `ImportRecipeResponse`.
- **Saved / playlists:** YouTube Watch Later via playlist URL + cookies; Instagram via list of URLs (and optional unofficial saved later).
- **Display:** Optional embed later; not required for MVP.

Next step: implement Phase 1 in the AI service (YouTube single URL → download → transcribe → recipe), then extend to Instagram and cookies/playlists.

---

## 8. Existing Tools (References)

| Purpose | Tool | Notes |
|--------|------|--------|
| Download (YouTube + Instagram) | **yt-dlp** | [yt-dlp/yt-dlp](https://github.com/yt-dlp/yt-dlp). CLI or Python: `pip install yt-dlp`. Use `-x` for audio-only, `--write-info-json` for description. |
| Audio extraction | **FFmpeg** | Used by yt-dlp for `-x`. Must be installed on system or in container. |
| Transcription (local) | **faster-whisper** | [guillaumekln/faster-whisper](https://github.com/guillaumekln/faster-whisper). `pip install faster-whisper`. Multi-language, no 25 MB limit. |
| Transcription (API) | **OpenAI Whisper API** | 25 MB limit; chunk with PyDub/FFmpeg if needed. [Speech to text](https://platform.openai.com/docs/guides/speech-to-text). |
| Instagram saved (unofficial) | **instagram-private-api** (Node) / Python equivalents | Use only with clear ToS/risk; not required for Phase 1/2 URL-based import. |
| YouTube Watch Later | Playlist URL `?list=WL` | Works with yt-dlp when user is logged in (cookies). No official Data API for WL. |
