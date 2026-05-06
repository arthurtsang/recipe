# User Page & Friends Plan

Plan for (1) a fixed-URL page that shows only the current user’s recipes, (2) public user profile pages, and (3) finding other users and adding them as friends.

---

## 1. User’s Own Page (Fixed URL – “My Recipes”)

### Goal

- One stable URL for “my recipes” (e.g. `/me` or `/me/recipes`).
- Same layout as the main recipe list, but filtered to the logged-in user only.
- Works even if the user has no alias set.

### Options

| Option | URL | Backend | Pros | Cons |
|--------|-----|---------|------|------|
| A | `/me` or `/me/recipes` | New: `GET /api/recipes/me` (auth required, returns `{ user, recipes }`) | Single fixed URL, no alias needed | New endpoint |
| B | `/users/me` | Resolve `alias === 'me'` in existing `GET /api/recipes/user/:alias` → treat as current user | Reuses existing route | “me” as special alias can clash if someone actually chooses alias “me” |
| C | Redirect `/me` → `/users/:alias` | User must set alias; `/me` redirects to `/users/{currentUser.alias}` | Reuses existing user page | No fixed URL until alias is set; worse UX if alias not set |

**Recommendation: Option A** – Add `GET /api/recipes/me` and a frontend route `/me` (or `/me/recipes`) that calls it. No dependency on alias; URL is always the same.

### Implementation Outline (Option A)

**Backend**

- Add `GET /api/recipes/me` (requires auth).
  - Use `req.oidc.user` (or API token) to get current user id.
  - Return same shape as `getRecipesByAlias`: `{ user, recipes }` (recipes = only that user’s, respecting `isPublic` for non-owner if needed; for “me” we can show all own recipes).
- Reuse existing recipe list logic (e.g. `recipeService.getRecipesByUserId(userId, isOwner)` with `isOwner = true` for “me”).

**Frontend**

- Add route: `/me` or `/me/recipes` → e.g. `UserRecipeList` or reuse `RecipeList` with a “mine only” mode.
- Page behavior:
  - If not logged in → redirect to login or home.
  - If logged in → fetch `GET /api/recipes/me`, then show:
    - Title like “My recipes” (or “{name}’s recipes”).
    - Same card grid as home, but only current user’s recipes (paginated if needed).
- Link to “My recipes” from the app bar or avatar menu (fixed place so users can always open “their” page from one URL).

**URL choice**

- Prefer **`/me`** as the single fixed URL (short, clear). Path `/me/recipes` is optional if you want to reserve `/me` for a future profile dashboard.

---

## 2. Public User Profile Page (“Someone Else’s Recipes”)

### Goal

- A stable URL for another user’s recipes: e.g. `/users/:alias` (or `/users/:id`).
- Shows only that user’s **public** recipes (and private to them if viewer is that user).

### Current State

- Backend already has: `GET /api/recipes/user/:alias` → `{ user, recipes }` (see `getRecipesByAlias`).
- Frontend: no route or page yet (see FEATURE_STATUS.md).

### Implementation Outline

**Frontend**

- Add route: `/users/:alias` (and optionally `/users/id/:id` if you want id-based URLs).
- New page (e.g. `UserProfile` or `UserRecipeList`):
  - Fetch `GET /api/recipes/user/:alias` (or by id if you add that).
  - If 404 (user not found) → show “User not found”.
  - Else show:
    - User display info (name, picture, alias if you show it).
    - Recipe grid of returned recipes (same card component as home).
- Link to this page wherever you show “owner” (e.g. “By {name}” on recipe cards or detail) → link to `/users/:alias` (or “By {name}” on list/detail → user profile).

**Optional: “Me” via alias**

- If current user has an alias, you can optionally redirect `/me` → `/users/:alias` so “my” page and “public profile” are the same URL when viewing self. Otherwise keep `/me` as the fixed “my recipes” URL that uses `GET /api/recipes/me`.

---

## 3. Finding Other Users & Adding Friends

### Goal

- Users can **find** other users (search, discover).
- Users can **add** them as “friends” (or “follow”).
- Clear rules for what “friends” see (e.g. “recipes from friends” filter).

### 3.1 Data Model: Friends vs Follow

| Model | Description | Use case |
|-------|-------------|----------|
| **Friendship (two-way)** | Two users are “friends” only after both agree (e.g. accept request). | Symmetric: “we’re friends,” see each other’s content. |
| **Follow (one-way)** | User A “follows” User B; B does not have to follow A. | Asymmetric: “I follow their recipes”; simpler, no accept flow. |

**Recommendation:** Start with **Follow** (one-way) for simplicity: “Follow” / “Unfollow,” and a “Recipes from people I follow” view. You can add a two-way “Friends” concept later if needed.

**Schema (Follow)**

- New table: `Follow` (or `Follows`).
  - `followerId` (userId of the person who follows).
  - `followeeId` (userId of the person being followed).
  - `createdAt`.
  - Unique on `(followerId, followeeId)`.
  - Index on `followerId` (list who I follow) and `followeeId` (list my followers, optional for “X follows you” or stats).

**No “pending” state** for follow: one click = following; one click again = unfollow.

### 3.2 How Users Find Other Users

**Discovery options**

1. **Search**
   - Search by display name or alias (e.g. `GET /api/users/search?q=...`).
   - Privacy: only return users who are “discoverable” (e.g. has public profile; you can add a `profileVisible` or rely on “has at least one public recipe” later).
2. **From recipes**
   - On recipe card/detail: “By {name}” → link to `/users/:alias`. So “finding users” = browsing recipes and clicking through to their profile.
3. **“Discover” or “Suggested”**
   - List users who have public recipes, sorted by recent activity or recipe count; optionally “users you might know” (e.g. same-domain email, or “followed by people you follow”) if you add that later.
4. **Followers / Following lists**
   - On profile: “Following (12)”, “Followers (5)” → list of users (links to their profile). Requires `GET /api/users/:id/following` and `GET /api/users/:id/followers` (or by alias).

**Recommendation for MVP**

- **From recipes:** “By {name}” links to `/users/:alias` (user profile page).
- **Search:** Add `GET /api/users/search?q=...` (by name/alias), auth optional; return minimal public info (id, name, alias, picture) for users that have at least one public recipe (or all enabled users, depending on privacy).
- **Discover:** Optional later; can be a “Browse users” page that lists recent/public users.

### 3.3 Add as Friend / Follow Flow (If Using Follow)

- On a **user profile page** (`/users/:alias`):
  - If viewer is logged in and viewing someone else (not self):
    - Show **Follow** button if not following.
    - Show **Unfollow** button if already following.
- API:
  - `POST /api/users/:id/follow` (or `POST /api/follows` with body `{ followeeId }`) → add follow; idempotent.
  - `DELETE /api/users/:id/follow` (or `DELETE /api/follows/:followeeId`) → remove follow.
  - `GET /api/users/:id/following` and `GET /api/users/:id/followers` (for profile page counts and lists).
- Show follow state on recipe cards if you show owner: e.g. “By {name} · Follow” (optional).

### 3.4 What “Friends” (or Followers) See

- **“Recipes from people I follow”**
  - New filter on home (or new route e.g. `/feed`):
    - Backend: `GET /api/recipes?followedBy=me` (or `GET /api/recipes/feed`) → recipes from users that the current user follows, ordered by date.
  - Reuse same recipe card grid; only data source changes.
- **Privacy**
  - Only **public** recipes of followees are shown in this feed (already have `isPublic` on Recipe).
  - Optionally: “Private to me” recipes for “friends” later (would need a separate visibility rule; skip for first version).

### 3.5 Summary: Friends/Follow MVP

| Item | Action |
|------|--------|
| Schema | Add `Follow` (followerId, followeeId, createdAt). |
| APIs | Follow/Unfollow, list following/followers; optional search users. |
| Discovery | “By {name}” → `/users/:alias`; optional user search. |
| Profile page | Show Follow/Unfollow; show “Following (n)” / “Followers (n)” (optional). |
| Feed | `GET /api/recipes?followedBy=me` or `/api/recipes/feed` → recipes from followed users. |
| Home | Add tab or filter: “All” vs “From people I follow”. |

---

## 4. Implementation Order (Suggested)

1. **User’s own page (fixed URL)**  
   - Backend: `GET /api/recipes/me`.  
   - Frontend: route `/me`, page “My recipes,” link in nav/menu.

2. **Public user profile**  
   - Frontend: route `/users/:alias`, page that calls existing `GET /api/recipes/user/:alias`.  
   - Add “By {name}” (or “By {alias}”) on recipe cards/detail → link to `/users/:alias`.

3. **Follow model and APIs**  
   - Prisma: add `Follow`; migrations.  
   - APIs: follow, unfollow, list following/followers.

4. **Follow UI**  
   - On `/users/:alias`: Follow/Unfollow button; optionally show following/followers count.

5. **“Recipes from people I follow”**  
   - Backend: feed endpoint or `GET /api/recipes?followedBy=me`.  
   - Frontend: “Feed” or home filter “From people I follow”.

6. **Optional later**  
   - User search (`GET /api/users/search`).  
   - Discover page; “followed by people you follow”; two-way “friends” if desired.

---

## 5. Open Decisions

- **URL for “my” page:** `/me` vs `/me/recipes` (recommend `/me`).
- **Profile URL:** alias only (`/users/:alias`) vs also support id (`/users/id/:id`) for users without alias.
- **Follow vs Friends:** Start with follow (one-way); add two-way friends later if needed.
- **Visibility of “following” list:** Public (anyone can see who you follow) vs only you (or only followers). Recommendation: public for simplicity (like many social apps).

---

## 6. Implementation notes (shareable URL + alias)

**Decisions implemented:**

- **Shareable URL:** One URL per user at `/users/:alias` (not `/me`). You can share this link; visitors see that user's recipes and can use "Browse all recipes" to go back to the full list.
- **Alias:** Default alias = sanitized `name || email` on account create. Editable under user dropdown: "Set profile link" / "Edit profile link". Display everywhere: **alias || name || email**.
- **Backfill:** Run `npx ts-node scripts/backfill-user-alias.ts` once to set alias for existing users (unique per user).

**Backend:** Default alias on user create (`userService.uniqueDefaultAlias`); alias in recipe user selects; `GET /api/recipes/user/:alias` unchanged. **Frontend:** Route `/users/:alias` (UserRecipePage with "X's recipes" banner and "Browse all recipes"); SetAliasDialog under user dropdown; "My recipes" → `/users/:alias`; RecipeCard and RecipeDetail show alias and link to `/users/:alias`.

---

*Doc created for planning; update as decisions are made and features are implemented.*
