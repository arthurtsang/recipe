-- Create metrobistro schema tables matching the current Prisma model.
-- Intentionally leaves all existing public.* tables untouched (rollback / dual-read safety).

CREATE SCHEMA IF NOT EXISTS metrobistro;

-- User
CREATE TABLE IF NOT EXISTS metrobistro."User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "alias" TEXT,
    "picture" TEXT,
    "oidcProvider" TEXT NOT NULL,
    "oidcSub" TEXT NOT NULL,
    "apiToken" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- Recipe (currentVersionId FK added after RecipeVersion exists)
CREATE TABLE IF NOT EXISTS metrobistro."Recipe" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "sourceUrl" TEXT,
    "estimatedTime" TEXT,
    "difficulty" TEXT,
    "timeReasoning" TEXT,
    "difficultyReasoning" TEXT,
    "currentVersionId" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Recipe_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS metrobistro."RecipeVersion" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "name" TEXT,
    "title" TEXT NOT NULL,
    "ingredients" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecipeVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS metrobistro."Rating" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Rating_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS metrobistro."Comment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS metrobistro."Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS metrobistro."RecipeTag" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    CONSTRAINT "RecipeTag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS metrobistro."ImportJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "kind" TEXT NOT NULL DEFAULT 'url',
    "step" TEXT NOT NULL DEFAULT 'queued',
    "result" JSONB,
    "error" TEXT,
    "savedRecipeId" TEXT,
    "claimedAt" TIMESTAMP(3),
    "claimedBy" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "aiImportJobId" TEXT,
    "aiImportKind" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS metrobistro."_VersionTags" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_VersionTags_AB_pkey" PRIMARY KEY ("A","B")
);

-- Indexes (IF NOT EXISTS for re-runs / partial applies)
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON metrobistro."User"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "User_alias_key" ON metrobistro."User"("alias");
CREATE UNIQUE INDEX IF NOT EXISTS "User_apiToken_key" ON metrobistro."User"("apiToken");
CREATE UNIQUE INDEX IF NOT EXISTS "Recipe_currentVersionId_key" ON metrobistro."Recipe"("currentVersionId");
CREATE UNIQUE INDEX IF NOT EXISTS "Tag_name_key" ON metrobistro."Tag"("name");
CREATE UNIQUE INDEX IF NOT EXISTS "Rating_userId_recipeId_key" ON metrobistro."Rating"("userId", "recipeId");
CREATE INDEX IF NOT EXISTS "_VersionTags_B_index" ON metrobistro."_VersionTags"("B");
CREATE INDEX IF NOT EXISTS "ImportJob_status_leaseExpiresAt_idx" ON metrobistro."ImportJob"("status", "leaseExpiresAt");
CREATE INDEX IF NOT EXISTS "ImportJob_status_createdAt_idx" ON metrobistro."ImportJob"("status", "createdAt");

-- Foreign keys (add only when missing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = 'metrobistro' AND t.relname = 'Recipe' AND c.conname = 'Recipe_userId_fkey'
  ) THEN
    ALTER TABLE metrobistro."Recipe"
      ADD CONSTRAINT "Recipe_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES metrobistro."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = 'metrobistro' AND t.relname = 'RecipeVersion' AND c.conname = 'RecipeVersion_recipeId_fkey'
  ) THEN
    ALTER TABLE metrobistro."RecipeVersion"
      ADD CONSTRAINT "RecipeVersion_recipeId_fkey"
      FOREIGN KEY ("recipeId") REFERENCES metrobistro."Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = 'metrobistro' AND t.relname = 'Recipe' AND c.conname = 'Recipe_currentVersionId_fkey'
  ) THEN
    ALTER TABLE metrobistro."Recipe"
      ADD CONSTRAINT "Recipe_currentVersionId_fkey"
      FOREIGN KEY ("currentVersionId") REFERENCES metrobistro."RecipeVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = 'metrobistro' AND t.relname = 'Rating' AND c.conname = 'Rating_userId_fkey'
  ) THEN
    ALTER TABLE metrobistro."Rating"
      ADD CONSTRAINT "Rating_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES metrobistro."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = 'metrobistro' AND t.relname = 'Rating' AND c.conname = 'Rating_recipeId_fkey'
  ) THEN
    ALTER TABLE metrobistro."Rating"
      ADD CONSTRAINT "Rating_recipeId_fkey"
      FOREIGN KEY ("recipeId") REFERENCES metrobistro."Recipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = 'metrobistro' AND t.relname = 'Comment' AND c.conname = 'Comment_userId_fkey'
  ) THEN
    ALTER TABLE metrobistro."Comment"
      ADD CONSTRAINT "Comment_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES metrobistro."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = 'metrobistro' AND t.relname = 'Comment' AND c.conname = 'Comment_recipeId_fkey'
  ) THEN
    ALTER TABLE metrobistro."Comment"
      ADD CONSTRAINT "Comment_recipeId_fkey"
      FOREIGN KEY ("recipeId") REFERENCES metrobistro."Recipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = 'metrobistro' AND t.relname = 'RecipeTag' AND c.conname = 'RecipeTag_recipeId_fkey'
  ) THEN
    ALTER TABLE metrobistro."RecipeTag"
      ADD CONSTRAINT "RecipeTag_recipeId_fkey"
      FOREIGN KEY ("recipeId") REFERENCES metrobistro."Recipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = 'metrobistro' AND t.relname = 'RecipeTag' AND c.conname = 'RecipeTag_tagId_fkey'
  ) THEN
    ALTER TABLE metrobistro."RecipeTag"
      ADD CONSTRAINT "RecipeTag_tagId_fkey"
      FOREIGN KEY ("tagId") REFERENCES metrobistro."Tag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = 'metrobistro' AND t.relname = 'ImportJob' AND c.conname = 'ImportJob_userId_fkey'
  ) THEN
    ALTER TABLE metrobistro."ImportJob"
      ADD CONSTRAINT "ImportJob_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES metrobistro."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = 'metrobistro' AND t.relname = '_VersionTags' AND c.conname = '_VersionTags_A_fkey'
  ) THEN
    ALTER TABLE metrobistro."_VersionTags"
      ADD CONSTRAINT "_VersionTags_A_fkey"
      FOREIGN KEY ("A") REFERENCES metrobistro."RecipeVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = 'metrobistro' AND t.relname = '_VersionTags' AND c.conname = '_VersionTags_B_fkey'
  ) THEN
    ALTER TABLE metrobistro."_VersionTags"
      ADD CONSTRAINT "_VersionTags_B_fkey"
      FOREIGN KEY ("B") REFERENCES metrobistro."Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- RLS: same posture as public — app uses DB role that bypasses RLS; lock down PostgREST roles.
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'User',
    'Recipe',
    'RecipeVersion',
    'Rating',
    'Comment',
    'Tag',
    'RecipeTag',
    'ImportJob',
    '_VersionTags'
  ]
  LOOP
    EXECUTE format('ALTER TABLE metrobistro.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('REVOKE ALL ON TABLE metrobistro.%I FROM anon, authenticated', tbl);
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'metrobistro' AND tablename = tbl AND policyname = 'backend_only'
    ) THEN
      EXECUTE format(
        'CREATE POLICY "backend_only" ON metrobistro.%I AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)',
        tbl
      );
    END IF;
  END LOOP;
END $$;
