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

// Load environment variables
dotenv.config();

const app = express();
app.set('trust proxy', 1);
const prisma = new PrismaClient();
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
        },
      });
    }
    // Attach user info to session for later use
    session.user = user;
    session.user.id = dbUser.id;
    return session;
  },
}));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

const uploadsPath = path.resolve(__dirname, '../uploads');
app.use('/uploads', express.static(uploadsPath));

// Endpoint to get current user info
app.get('/api/me', (req: any, res, next) => {
  console.log('Before requiresAuth - req.oidc:', JSON.stringify(req.oidc, null, 2));
  next();
}, requiresAuth(), async (req: any, res) => {
  // Debug: Log the entire OIDC object for comparison
  console.log('/api/me OIDC object after requiresAuth:', JSON.stringify(req.oidc, null, 2));
  
  const email = req.oidc.user?.email?.toLowerCase();
  if (!email) return res.status(401).json({ error: 'No email' });
  const dbUser = await userService.getUserByEmail(email);
  if (!dbUser) return res.status(404).json({ error: 'User not found' });
  res.json({
    ...dbUser,
    picture: req.oidc.user.picture,
    name: req.oidc.user.name,
  });
});

// Protect recipe creation and editing/
app.use('/api/recipes', recipeRoutes);
app.use('/api/tags', tagRoutes);

// Serve static files from the React app
app.use(express.static(path.join(__dirname, '../../web/dist')));

// For any route not handled by your API, serve index.html (for React Router)
app.get(/^\/(?!api|uploads|auth).*/, (req, res) => {
  res.sendFile(path.join(__dirname, '../../web/dist', 'index.html'));
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
