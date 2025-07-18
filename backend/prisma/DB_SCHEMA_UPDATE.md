# Database Schema/Model Update Flow (Prisma)

This guide explains how to safely update the database schema/model using Prisma in this project.

---

## 1. Edit the Prisma Schema
- Open `backend/prisma/schema.prisma`.
- Make your changes (add/remove/modify models, fields, or relations).
- For cascade deletes, use `onDelete: Cascade` in relation definitions.

## 2. Save the File

## 3. Create and Apply a Migration
- In your terminal, from the `backend` directory, run:
  ```sh
  npx prisma migrate dev --name <migration-name>
  ```
  - Replace `<migration-name>` with a short, descriptive name (e.g., `add-rating-cascade`).
- This will:
  - Create a new migration in `backend/prisma/migrations/`
  - Apply the migration to your local database
  - Regenerate the Prisma client

## 4. (Optional) Review the Migration
- Check the generated SQL in `backend/prisma/migrations/<timestamp>_<migration-name>/migration.sql` if you want to see the exact DB changes.

## 5. Update Your Application Code
- Update your backend TypeScript code to use the new/changed models or fields.
- The regenerated Prisma client will have updated types.

## 6. Test Your Changes
- Run your backend and test the new/updated features.
- Check for errors or warnings in the terminal.

## 7. Commit Your Changes
- Commit the following files:
  - `backend/prisma/schema.prisma`
  - The new migration folder in `backend/prisma/migrations/`
  - Any updated TypeScript code

## 8. (If working with a team or deploying)
- Other developers or your deployment server should run:
  ```sh
  npx prisma migrate deploy
  ```
  - This applies all pending migrations in production or CI/CD.

---

## Example: Add a Field to a Model

1. Edit `schema.prisma`:
   ```prisma
   model Recipe {
     id    String @id @default(uuid())
     title String
     // Add a new field:
     summary String?
   }
   ```
2. Run:
   ```sh
   npx prisma migrate dev --name add-recipe-summary
   ```
3. Update your code to use `summary`.
4. Test, commit, and push.

---

## Tips
- Always use `npx prisma migrate dev` for local/dev changes.
- Use `npx prisma migrate deploy` for production.
- If you only want to update the client after a schema change (no migration needed), run:
  ```sh
  npx prisma generate
  ```
- For destructive changes (dropping columns/tables), Prisma will warn you and may require confirmation. 