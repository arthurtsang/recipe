# Feature Status Overview

This document tracks all major features for the Recipe App project, including their implementation status.

---

## Features & Status

### Backend
- [x] User alias/handle support (schema, set/get, unique)
- [x] User recipe page at `/api/recipes/user/:alias`
- [x] `isPublic` logic for recipe visibility (backend)
- [x] Tag/category support in data model and queries
- [ ] Tag/category endpoints for CRUD (if you want users to create/manage tags)
- [ ] Import recipe endpoint (from external website, e.g., myrecipe.kitchen)
- [ ] Expose AI auto-category endpoint (callable from frontend)

### Frontend (Web)
- [ ] Alias setup UI (profile/settings page)
- [ ] User recipe page at `/user/:alias`
- [ ] Search by alias on home page
- [ ] "By owner" in each recipe links to owner's recipe page
- [ ] Rename app header to "Recipes", add logo, remove home button, make header/logo clickable to go home
- [ ] Move "Add Recipe" button to main content area, add icon
- [ ] Show/hide recipes based on `isPublic` and ownership
- [ ] Tag/category UI: add, search/filter by tag/category
- [ ] Import recipe UI and connect to backend/AI service

### AI Service
- [ ] AI auto-category using DistilBERT (endpoint and logic)
- [ ] Recipe import logic (scrape and parse from external site, endpoint)

---

## Summary Table

| Feature/Task                                 | Status         |
|----------------------------------------------|----------------|
| User alias/handle backend                    | Implemented    |
| User recipe page backend                     | Implemented    |
| isPublic backend logic                       | Implemented    |
| Tag/category backend model/query             | Implemented    |
| Tag/category backend endpoints (CRUD)        | Not implemented|
| Import recipe backend endpoint               | Not implemented|
| AI auto-category backend endpoint            | Not implemented|
| Alias setup UI                               | Not implemented|
| User recipe page UI                          | Not implemented|
| Search by alias UI                           | Not implemented|
| Owner link in recipe card                    | Not implemented|
| Header/logo/nav changes                      | Not implemented|
| Add Recipe button move/icon                  | Not implemented|
| isPublic UI logic                            | Not implemented|
| Tag/category UI                              | Not implemented|
| Import recipe UI                             | Not implemented|
| AI auto-category endpoint (AI service)       | Not implemented|
| Recipe import logic (AI service)             | Not implemented|

---

**Legend:**
- [x] Implemented
- [ ] Not implemented 