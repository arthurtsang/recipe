# Recipe App Project Plan

## Overview

A cross-platform recipe app (web & mobile) where users can browse, search, and manage recipes. Authenticated users (via Google OIDC) can add, edit, and delete their own recipes. AI features enhance user experience, including smart categorization, ingredient extraction, cooking guidance, and more.

## Tech Stack

- **Backend:** Node.js (TypeScript) + Express.js
- **Web Frontend:** React (TypeScript) + Vite or Next.js
- **Mobile App:** React Native (Expo)
- **Database:** PostgreSQL
- **AI Integration:** HuggingFace Inference API (Llama LLM, image models, etc.)
- **Authentication:** Google OIDC (using Passport.js or Auth0)
- **Image Storage:** Cloud storage (e.g., AWS S3, or local for dev)
- **API:** REST (optionally GraphQL later)
- **Monorepo Tooling:** Turborepo or Nx (optional, for shared code)

## Directory Structure

```
recipe/
  backend/         # Node.js/Express API, DB models, AI integration
  web/             # React web app
  mobile/          # React Native app (Expo)
  shared/          # Shared code (types, utils, validation)
  docs/            # Documentation
  scripts/         # Dev scripts, DB migrations, etc.
  README.md
```

## Feature List

### MVP Features

- [x] Public recipe browsing/search (no login required)
- [x] Google OIDC login for recipe management
- [x] Recipe CRUD (title, ingredients, instructions, description, image)
- [x] Image upload with format validation (browser-supported formats)
- Recipe categories/tags (AI-assisted)
- [x] Ratings (kids can log in to rate)
- [ ] Comments
- [x] Perma-link for each recipe
- [x] Responsive web design
- [x] Recipe versioning
- [x] Localization (i18n)
- [x] PostgreSQL database
- [ ] auto archive to archive.is

### AI Features

- [ ] chat bot
- [ ] import from other site -> ai?
- [ ] transcribe from video 
- AI-assisted category/tag suggestion
- Ingredient/instruction extraction from pasted text
- Recipe suggestions based on preferences/ingredients
- Image recognition (food detection, auto-tagging)
- Nutrition analysis from ingredients
- Semantic (smart) search
- Recipe summarization
- Voice input for search/recipe entry
- AI-guided cooking process (step reminders, alarms, voice guidance; focus on mobile)

### Future Features

- Shopping list generation
- Recipe sharing (optional)
- Social features (following, feeds, etc.)

## Initial TODO Task List

### Project Setup

1. Create monorepo structure with backend, web, mobile, shared directories
2. Initialize backend (Node.js/Express, TypeScript, PostgreSQL)
3. Set up web frontend (React, TypeScript, Vite/Next.js)
4. Set up shared code (types, validation)
5. Set up database schema (users, recipes, ratings, comments, versions, etc.)
6. Set up authentication (Google OIDC)
7. Implement basic recipe CRUD API
8. Implement image upload & validation
9. Implement public recipe browsing/search
10. Implement AI integration (HuggingFace API, Llama LLM)
11. Implement recipe categories/tags (AI-assisted)
12. Implement ratings/comments
13. Implement perma-link for recipes
14. Implement responsive design
15. Implement recipe versioning
16. Implement localization (i18n)
17. Write documentation

### AI Features (Phase 2)

18. Ingredient/instruction extraction
19. Recipe suggestions
20. Image recognition
21. Nutrition analysis
22. Semantic search
23. Recipe summarization
24. Voice input

### Mobile App (Phase 3)

25. Set up React Native app (Expo)
26. Implement mobile UI/UX
27. Implement AI-guided cooking process (step reminders, alarms, voice guidance)
