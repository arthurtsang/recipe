-- Enable RLS on all public tables. The app connects as postgres (Prisma), which bypasses RLS.
-- anon/authenticated (Supabase PostgREST) are explicitly denied so the Security Advisor is satisfied.

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
    '_VersionTags',
    '_prisma_migrations'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('REVOKE ALL ON TABLE %I FROM anon, authenticated', tbl);
    EXECUTE format(
      'CREATE POLICY "backend_only" ON %I AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)',
      tbl
    );
  END LOOP;
END $$;
