import express from 'express';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import recipeRoutes from './routes/recipes';
import path from 'path';
import { auth, requiresAuth } from 'express-openid-connect';
import jwt from 'jsonwebtoken';
import cors from 'cors';

import * as recipeController from './controllers/recipeController';
import * as userService from './services/userService';
import tagRoutes from './routes/tags';
import { startImportJobOnly, ensureAtMostOneProcessing } from './services/importJobService';
import { findRecipesNeedingAnalysis } from './services/recipeAnalysisService';

// Load environment variables
dotenv.config();

const app = express();
app.set('trust proxy', 1);
export const prisma = new PrismaClient();
const allowedEmails = (process.env.ALLOWED_EMAILS || '').split(',').map(e => e.trim().toLowerCase());

app.use((req, res, next) => {
  console.log(`[${req.method}] ${req.originalUrl}`);
  next();
});

app.use(cors({
  origin: ['https://recipe.youramaryllis.com', 'http://localhost:4000'],
  credentials: true,
}));

app.use(express.json());

// OIDC config for Google
app.use(auth({
  issuerBaseURL: 'https://accounts.google.com',
  baseURL: process.env.NODE_ENV === 'production' ? 'https://recipe.youramaryllis.com' : (process.env.BASE_URL || 'http://localhost:4000'),
  clientID: process.env.GOOGLE_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  secret: process.env.SESSION_SECRET || 'dev-secret',
  idpLogout: false,
  authRequired: false,
  session: {
    cookie: {
      sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Lax',
      secure: process.env.NODE_ENV === 'production',
    }
  },
  authorizationParams: {
    scope: 'openid email profile',
    prompt: 'select_account',
  },
  routes: {
    login: '/auth/google',
    callback: '/auth/google/callback',
    logout: '/logout',
  },

  afterCallback: async (req, res, session) => {
    let user = session.user;
    if (!user && session.id_token) {
      user = jwt.decode(session.id_token);
    }
    if (!user || !user.email) {
      throw new Error(`No user email returned from Google ${JSON.stringify(user)}`);
    }
    const email = user.email.toLowerCase();
    const isAdmin = email === process.env.ADMIN_EMAIL?.toLowerCase();
    
    // Find or create user in DB
    let dbUser = await prisma.user.findUnique({ where: { email } });
    if (!dbUser) {
      dbUser = await prisma.user.create({
        data: {
          email,
          name: user.name,
          picture: user.picture,
          oidcProvider: 'google',
          oidcSub: user.sub,
          isEnabled: isAdmin, // Admin is enabled by default, others need approval
        },
      });
      console.log(`Created new user: ${email}, enabled: ${isAdmin}`);
    }
    
    // Attach user info to session for later use
    session.user = user;
    session.user.id = dbUser.id;
    session.user.isEnabled = dbUser.isEnabled;
    session.user.isAdmin = isAdmin;
    
    return session;
  },
}));

// Middleware to check if user is enabled
export const requiresEnabledUser = () => {
  return (req: any, res: any, next: any) => {
    if (!req.oidc?.user?.email) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    const isAdmin = req.oidc.user.email.toLowerCase() === process.env.ADMIN_EMAIL?.toLowerCase();
    if (isAdmin) {
      return next(); // Admin always has access
    }
    
    // Check if user is enabled in database
    prisma.user.findUnique({ 
      where: { email: req.oidc.user.email.toLowerCase() } 
    }).then(user => {
      if (!user || !user.isEnabled) {
        return res.status(403).json({ 
          error: 'Account pending approval', 
          message: 'Your account is waiting for admin approval. Please contact the administrator.' 
        });
      }
      next();
    }).catch(err => {
      console.error('Error checking user status:', err);
      res.status(500).json({ error: 'Internal server error' });
    });
  };
};

// Middleware to check if user is admin
const requiresAdmin = () => {
  return (req: any, res: any, next: any) => {
    if (!req.oidc?.user?.email) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    const isAdmin = req.oidc.user.email.toLowerCase() === process.env.ADMIN_EMAIL?.toLowerCase();
    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    next();
  };
};

// Resolve Bearer token so /api/me and other routes accept API-token auth (e.g. save-mabels-imports.ts)
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

// Endpoint to get current user info
app.get('/api/me', requiresAuth(), async (req: any, res) => {
  try {
    const email = req.oidc?.user?.email?.toLowerCase();
    if (!email) return res.status(401).json({ error: 'No email' });
    const dbUser = await userService.getUserByEmail(email);
    if (!dbUser) return res.status(404).json({ error: 'User not found' });

    const isAdmin = email === process.env.ADMIN_EMAIL?.toLowerCase();
    const picture = req.oidc?.user?.picture ?? dbUser.picture ?? undefined;
    const name = req.oidc?.user?.name ?? dbUser.name ?? undefined;

    res.json({
      ...dbUser,
      picture,
      name,
      isAdmin,
      isEnabled: dbUser.isEnabled,
    });
  } catch (err) {
    console.error('/api/me error:', err);
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

// Admin endpoints
app.get('/api/admin/users', requiresAuth(), requiresAdmin(), async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        isEnabled: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' }
    });
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
      }
    });
    
    console.log(`Admin ${req.oidc.user.email} ${enabled ? 'enabled' : 'disabled'} user ${user.email}`);
    res.json(user);
  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).json({ error: 'Failed to update user status' });
  }
});

// Admin queue status (import queue + recipe analysis queue)
app.get('/api/admin/queues', requiresAuth(), requiresAdmin(), async (req, res) => {
  try {
    // We only ever have 1 import processing at a time; fix DB if stale
    await ensureAtMostOneProcessing();
    const [pendingJobs, processingJobs, recentFailed, recentCompleted, pendingRecipeIds, recentAnalyzed] = await Promise.all([
      prisma.importJob.findMany({
        where: { status: 'pending' },
        orderBy: { createdAt: 'asc' },
        select: { id: true, url: true, userId: true, createdAt: true, updatedAt: true, startedAt: true, completedAt: true, error: true },
      }),
      prisma.importJob.findMany({
        where: { status: 'processing' },
        orderBy: { startedAt: 'asc' },
        select: { id: true, url: true, userId: true, createdAt: true, updatedAt: true, startedAt: true, completedAt: true, error: true },
      }),
      prisma.importJob.findMany({
        where: { status: 'failed' },
        orderBy: { completedAt: 'desc' },
        take: 20,
        select: { id: true, url: true, userId: true, createdAt: true, updatedAt: true, startedAt: true, completedAt: true, error: true },
      }),
      prisma.importJob.findMany({
        where: { status: 'completed' },
        orderBy: { completedAt: 'desc' },
        take: 20,
        select: { id: true, url: true, userId: true, createdAt: true, updatedAt: true, startedAt: true, completedAt: true, error: true },
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

// Retry all failed import jobs: reset to pending; scheduler will pick them up one at a time
app.post('/api/admin/import-jobs/retry-all', requiresAuth(), requiresAdmin(), async (req, res) => {
  try {
    const result = await prisma.importJob.updateMany({
      where: { status: 'failed' },
      data: { status: 'pending', error: null, result: null, startedAt: null, completedAt: null, savedRecipeId: null, aiImportJobId: null, updatedAt: new Date() },
    });
    res.json({ message: `${result.count} failed job(s) queued for retry`, count: result.count });
  } catch (error) {
    console.error('Error retrying failed import jobs:', error);
    res.status(500).json({ error: 'Failed to retry jobs' });
  }
});

// Retry a single import job: reset to pending and start it (POST to AI); status poll will complete it
app.post('/api/admin/import-jobs/:id/retry', requiresAuth(), requiresAdmin(), async (req, res) => {
  try {
    const { id } = req.params;
    const job = await prisma.importJob.findUnique({ where: { id } });
    if (!job) return res.status(404).json({ error: 'Import job not found' });
    await prisma.importJob.update({
      where: { id },
      data: { status: 'pending', error: null, result: null, startedAt: null, completedAt: null, savedRecipeId: null, aiImportJobId: null, updatedAt: new Date() },
    });
    startImportJobOnly(id).catch((err) => console.error(`[IMPORT] Admin retry job ${id}:`, err));
    res.json({ message: 'Job queued for retry', jobId: id });
  } catch (error) {
    console.error('Error retrying import job:', error);
    res.status(500).json({ error: 'Failed to retry job' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Serve uploads from backend/uploads (process.cwd() when run from backend/)
const uploadsPath = path.resolve(process.cwd(), 'uploads');
app.use('/uploads', express.static(uploadsPath));
app.use('/api/uploads', express.static(uploadsPath));

// Import job routes
import importJobRoutes from './routes/importJobs';

// Middleware: for /api/imports, resolve Bearer token so requiresEnabledUser accepts API-token auth
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

// Protect recipe creation and editing/
app.use('/api/recipes', recipeRoutes);
app.use('/api/tags', tagRoutes);
app.use('/api/imports', importJobRoutes);

// Serve static files from the React app (but exclude API routes)
app.use(express.static(path.join(__dirname, '../../web/dist'), {
  index: false, // Don't serve index.html for directory requests
}));

// 404 handler for API routes (must be after all other routes)
app.use('/api', (req, res) => {
  console.log(`[404] API route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ 
    error: 'Not Found', 
    path: req.originalUrl,
    message: 'API endpoint not found'
  });
});

// For any route not handled by your API, serve index.html (for React Router)
app.get(/^\/(?!api|uploads|auth|static).*/, (req, res) => {
  res.sendFile(path.join(__dirname, '../../web/dist', 'index.html'));
});

// Error handler (e.g. Bearer middleware calls next(err))
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Express error handler:', err?.message ?? err);
  if (res.headersSent) return;
  res.status(500).json({ error: err?.message ?? 'Internal server error' });
});

// Start background schedulers
import { startRecipeAnalysisScheduler } from './services/recipeAnalysisService';
import { startImportJobScheduler } from './services/importJobService';

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  startRecipeAnalysisScheduler();
  startImportJobScheduler();
});
