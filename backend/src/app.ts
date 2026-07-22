import express from 'express';
import dotenv from 'dotenv';
import crypto from 'crypto';
import recipeRoutes from './routes/recipes';
import path from 'path';
import { auth, requiresAuth } from 'express-openid-connect';
import jwt from 'jsonwebtoken';
import cors from 'cors';

import * as userService from './services/userService';
import tagRoutes from './routes/tags';
import {
  processPendingImportJobs,
  reclaimExpiredLeases,
  requeueImportJob,
} from './services/importJobService';
import { findRecipesNeedingAnalysis, processRecipeAnalysisQueue } from './services/recipeAnalysisService';
import { backupDatabaseToWasabi } from './services/databaseBackupService';
import { prisma } from './lib/prisma';
import { corsOrigins, getBaseUrl, isProductionDeploy } from './lib/baseUrl';
import { env, requireEnv } from './lib/env';
import { isServerless } from './lib/serverless';
import { requiresEnabledUser, requiresAdmin } from './middleware/auth';
import { requireCronSecret } from './middleware/cronAuth';
import importJobRoutes from './routes/importJobs';

// Local only — on Vercel, project env vars are already injected (avoid .env clobbering).
if (!process.env.VERCEL) {
  dotenv.config({ path: path.join(__dirname, '../.env') });
}

const googleClientId = requireEnv('GOOGLE_CLIENT_ID');
const googleClientSecret = requireEnv('GOOGLE_CLIENT_SECRET');
const sessionSecret = env('SESSION_SECRET') ?? 'dev-secret';

const app = express();
app.set('trust proxy', 1);

app.use((req, res, next) => {
  console.log(`[${req.method}] ${req.originalUrl}`);
  next();
});

app.use(
  cors({
    origin: corsOrigins(),
    credentials: true,
  })
);

// Increase body size limit for recipe updates with images (base64 can be large)
// Vercel has a 4.5MB payload limit for serverless functions
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

const baseUrl = getBaseUrl();
console.log('[oidc] baseURL', baseUrl, {
  vercelEnv: process.env.VERCEL_ENV,
  baseUrlLen: process.env.BASE_URL?.length ?? 0,
  previewBaseUrlLen: process.env.PREVIEW_BASE_URL?.length ?? 0,
});

app.use(
  auth({
    issuerBaseURL: 'https://accounts.google.com',
    baseURL: baseUrl,
    clientID: googleClientId,
    clientSecret: googleClientSecret,
    secret: sessionSecret,
    idpLogout: false,
    authRequired: false,
    session: {
      cookie: {
        sameSite: isProductionDeploy() ? 'None' : 'Lax',
        secure: isProductionDeploy(),
      },
    },
    authorizationParams: {
      scope: 'openid email profile',
      prompt: 'select_account',
    },
    routes: {
      login: '/auth/google',
      callback: '/auth/google/callback',
      logout: '/logout',
      postLogoutRedirect: '/',
    },

    afterCallback: async (_req, _res, session) => {
      let user = session.user;
      if (!user && session.id_token) {
        user = jwt.decode(session.id_token) as typeof user;
      }
      if (!user || !user.email) {
        throw new Error(`No user email returned from Google ${JSON.stringify(user)}`);
      }
      const email = user.email.toLowerCase();
      const isAdmin = email === process.env.ADMIN_EMAIL?.toLowerCase();

      let dbUser = await prisma.user.findUnique({ where: { email } });
      if (!dbUser) {
        const defaultAlias = await userService.uniqueDefaultAlias(user.name || email, email);
        dbUser = await prisma.user.create({
          data: {
            email,
            name: user.name,
            alias: defaultAlias,
            picture: user.picture,
            oidcProvider: 'google',
            oidcSub: user.sub,
            isEnabled: isAdmin,
          },
        });
        console.log(`Created new user: ${email}, alias: ${defaultAlias}, enabled: ${isAdmin}`);
      }

      session.user = user;
      session.user.id = dbUser.id;
      session.user.isEnabled = dbUser.isEnabled;
      session.user.isAdmin = isAdmin;

      return session;
    },
  })
);

app.use((req: any, res, next) => {
  if (req.oidc?.user?.email) return next();
  const authHeader = req.headers.authorization;
  if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    return next();
  }
  const token = authHeader.slice(7).trim();
  if (!token) return next();
  prisma.user
    .findFirst({
      where: { apiToken: token, isEnabled: true },
      select: { id: true, email: true },
    })
    .then((user) => {
      if (user) {
        req.oidc = {
          user: { email: user.email, id: user.id },
          isAuthenticated: () => true,
        };
      }
      next();
    })
    .catch((err) => {
      console.error('Bearer token lookup failed:', err);
      next(err);
    });
});

app.get('/api/me', requiresAuth(), async (req: any, res) => {
  try {
    const email = req.oidc?.user?.email?.toLowerCase();
    if (!email) return res.status(401).json({ error: 'No email' });
    const dbUser = await userService.getUserByEmail(email);
    if (!dbUser) return res.status(404).json({ error: 'User not found' });

    const isAdmin = email === process.env.ADMIN_EMAIL?.toLowerCase();
    const picture = req.oidc?.user?.picture ?? dbUser.picture ?? undefined;
    const name = req.oidc?.user?.name ?? dbUser.name ?? undefined;
    const displayName = userService.userDisplayName({ ...dbUser, name });

    // Never expose apiToken on /api/me — use GET /api/me/token
    const { apiToken: _apiToken, ...safeUser } = dbUser as typeof dbUser & {
      apiToken?: string | null;
    };

    res.json({
      ...safeUser,
      picture,
      name,
      alias: dbUser.alias ?? undefined,
      displayName,
      isAdmin,
      isEnabled: dbUser.isEnabled,
    });
  } catch (err) {
    console.error('/api/me error:', err);
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

/** Current user's API token (for agent/script Bearer auth). */
app.get('/api/me/token', requiresAuth(), requiresEnabledUser(), async (req: any, res) => {
  try {
    const email = req.oidc?.user?.email?.toLowerCase();
    if (!email) return res.status(401).json({ error: 'No email' });
    const dbUser = await prisma.user.findUnique({
      where: { email },
      select: { apiToken: true },
    });
    if (!dbUser) return res.status(404).json({ error: 'User not found' });
    res.json({ apiToken: dbUser.apiToken ?? null });
  } catch (err) {
    console.error('/api/me/token error:', err);
    res.status(500).json({ error: 'Failed to get API token' });
  }
});

/** Generate a new API token (invalidates the previous one). */
app.post('/api/me/token/refresh', requiresAuth(), requiresEnabledUser(), async (req: any, res) => {
  try {
    const email = req.oidc?.user?.email?.toLowerCase();
    if (!email) return res.status(401).json({ error: 'No email' });
    const apiToken = crypto.randomBytes(32).toString('hex');
    const updated = await prisma.user.update({
      where: { email },
      data: { apiToken },
      select: { apiToken: true },
    });
    res.json({ apiToken: updated.apiToken });
  } catch (err: any) {
    if (err?.code === 'P2025') {
      return res.status(404).json({ error: 'User not found' });
    }
    console.error('/api/me/token/refresh error:', err);
    res.status(500).json({ error: 'Failed to refresh API token' });
  }
});

app.get('/api/admin/users', requiresAuth(), requiresAdmin(), async (_req, res) => {
  try {
    const rows = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        alias: true,
        isEnabled: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    const users = rows.map((u) => ({ ...u, displayName: userService.userDisplayName(u) }));
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.patch('/api/admin/users/:id/enable', requiresAuth(), requiresAdmin(), async (req, res) => {
  try {
    const { id } = req.params;
    const { enabled } = req.body;

    const user = await prisma.user.update({
      where: { id },
      data: { isEnabled: enabled },
      select: {
        id: true,
        email: true,
        name: true,
        isEnabled: true,
        updatedAt: true,
      },
    });

    console.log(`Admin ${req.oidc.user.email} ${enabled ? 'enabled' : 'disabled'} user ${user.email}`);
    res.json(user);
  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).json({ error: 'Failed to update user status' });
  }
});

app.get('/api/admin/queues', requiresAuth(), requiresAdmin(), async (_req, res) => {
  try {
    await reclaimExpiredLeases();
    const [pendingJobs, processingJobs, recentFailed, recentCompleted, pendingRecipeIds, recentAnalyzed] =
      await Promise.all([
        prisma.importJob.findMany({
          where: { status: 'pending' },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            url: true,
            kind: true,
            step: true,
            userId: true,
            createdAt: true,
            updatedAt: true,
            startedAt: true,
            completedAt: true,
            error: true,
          },
        }),
        prisma.importJob.findMany({
          where: { status: 'processing' },
          orderBy: { startedAt: 'asc' },
          select: {
            id: true,
            url: true,
            kind: true,
            step: true,
            claimedBy: true,
            leaseExpiresAt: true,
            userId: true,
            createdAt: true,
            updatedAt: true,
            startedAt: true,
            completedAt: true,
            error: true,
          },
        }),
        prisma.importJob.findMany({
          where: { status: 'failed' },
          orderBy: { completedAt: 'desc' },
          take: 20,
          select: {
            id: true,
            url: true,
            userId: true,
            createdAt: true,
            updatedAt: true,
            startedAt: true,
            completedAt: true,
            error: true,
          },
        }),
        prisma.importJob.findMany({
          where: { status: 'completed' },
          orderBy: { completedAt: 'desc' },
          take: 20,
          select: {
            id: true,
            url: true,
            userId: true,
            createdAt: true,
            updatedAt: true,
            startedAt: true,
            completedAt: true,
            error: true,
          },
        }),
        findRecipesNeedingAnalysis(100),
        prisma.recipe.findMany({
          where: { estimatedTime: { not: null }, difficulty: { not: null } },
          orderBy: { updatedAt: 'desc' },
          take: 20,
          select: { id: true, title: true, createdAt: true, updatedAt: true },
        }),
      ]);

    const pendingRecipes =
      pendingRecipeIds.length === 0
        ? []
        : await prisma.recipe.findMany({
            where: { id: { in: pendingRecipeIds } },
            select: { id: true, title: true, createdAt: true, updatedAt: true },
            orderBy: { createdAt: 'desc' },
          });

    res.json({
      import: {
        pendingCount: pendingJobs.length,
        processingCount: processingJobs.length,
        pendingJobs,
        processingJobs,
        recentFailed,
        recentCompleted,
      },
      recipeAnalysis: {
        pendingCount: pendingRecipeIds.length,
        pendingRecipes,
        recentAnalyzedRecipes: recentAnalyzed,
      },
    });
  } catch (error) {
    console.error('Error fetching admin queues:', error);
    res.status(500).json({ error: 'Failed to fetch queues' });
  }
});

app.post('/api/admin/import-jobs/retry-all', requiresAuth(), requiresAdmin(), async (_req, res) => {
  try {
    const result = await prisma.importJob.updateMany({
      where: { status: 'failed' },
      data: {
        status: 'pending',
        step: 'queued',
        error: null,
        result: null,
        startedAt: null,
        completedAt: null,
        savedRecipeId: null,
        claimedAt: null,
        claimedBy: null,
        leaseExpiresAt: null,
        aiImportJobId: null,
        aiImportKind: null,
        updatedAt: new Date(),
      },
    });
    res.json({ message: `${result.count} failed job(s) queued for retry`, count: result.count });
  } catch (error) {
    console.error('Error retrying failed import jobs:', error);
    res.status(500).json({ error: 'Failed to retry jobs' });
  }
});

app.post('/api/admin/import-jobs/:id/retry', requiresAuth(), requiresAdmin(), async (req, res) => {
  try {
    const { id } = req.params;
    const job = await requeueImportJob(id);
    if (!job) return res.status(404).json({ error: 'Import job not found' });
    res.json({ message: 'Job queued for OCI worker', jobId: id });
  } catch (error) {
    console.error('Error retrying import job:', error);
    res.status(500).json({ error: 'Failed to retry job' });
  }
});

app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', db: 'ok' });
  } catch (err: any) {
    console.error('/api/health db check failed:', err?.message ?? err);
    res.status(503).json({ status: 'degraded', db: 'error', error: err?.message ?? 'Database unavailable' });
  }
});

app.get('/api/cron/daily', requireCronSecret, async (_req, res) => {
  try {
    await reclaimExpiredLeases();
    await processPendingImportJobs();
    await processRecipeAnalysisQueue();
    res.json({ ok: true });
  } catch (err) {
    console.error('[cron] daily error:', err);
    res.status(500).json({ error: 'Cron failed' });
  }
});

app.get('/api/cron/import-jobs', requireCronSecret, async (_req, res) => {
  try {
    const reclaimed = await reclaimExpiredLeases();
    res.json({ ok: true, reclaimed });
  } catch (err) {
    console.error('[cron] import-jobs error:', err);
    res.status(500).json({ error: 'Cron failed' });
  }
});

app.get('/api/cron/recipe-analysis', requireCronSecret, async (_req, res) => {
  try {
    await processRecipeAnalysisQueue();
    res.json({ ok: true });
  } catch (err) {
    console.error('[cron] recipe-analysis error:', err);
    res.status(500).json({ error: 'Cron failed' });
  }
});

app.get('/api/cron/backup', requireCronSecret, async (_req, res) => {
  try {
    const result = await backupDatabaseToWasabi();
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[cron] backup error:', err);
    const msg = err instanceof Error ? err.message : 'Backup failed';
    res.status(500).json({
      error: msg,
      hint: 'DB backups currently require a working pg_dump binary. See install-pg-dump-for-vercel.sh and BACKUP_STRATEGY.md',
    });
  }
});

if (!isServerless()) {
  const uploadsPath = path.resolve(process.cwd(), 'uploads');
  app.use('/uploads', express.static(uploadsPath));
  app.use('/api/uploads', express.static(uploadsPath));
}

app.use('/api/imports', async (req: any, res, next) => {
  if (req.oidc?.user?.email) return next();
  const authHeader = req.headers.authorization;
  if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) {
      const user = await prisma.user.findFirst({
        where: { apiToken: token, isEnabled: true },
        select: { email: true },
      });
      if (user) {
        req.oidc = { user: { email: user.email } };
      }
    }
  }
  next();
});

app.use('/api/recipes', recipeRoutes);
app.use('/api/tags', tagRoutes);
app.use('/api/imports', importJobRoutes);

if (!isServerless()) {
  app.use(
    express.static(path.join(__dirname, '../../web/dist'), {
      index: false,
    })
  );
}

app.use('/api', (req, res) => {
  console.log(`[404] API route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    error: 'Not Found',
    path: req.originalUrl,
    message: 'API endpoint not found',
  });
});

if (!isServerless()) {
  app.get(/^\/(?!api|uploads|auth|static|logout).*/, (_req, res) => {
    res.sendFile(path.join(__dirname, '../../web/dist', 'index.html'));
  });
}

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Express error handler:', err?.message ?? err);
  if (res.headersSent) return;
  res.status(500).json({ error: err?.message ?? 'Internal server error' });
});

export default app;
