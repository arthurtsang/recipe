"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const client_1 = require("@prisma/client");
const dotenv_1 = __importDefault(require("dotenv"));
const recipes_1 = __importDefault(require("./routes/recipes"));
const path_1 = __importDefault(require("path"));
const express_openid_connect_1 = require("express-openid-connect");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const cors_1 = __importDefault(require("cors"));
const userService = __importStar(require("./services/userService"));
const tags_1 = __importDefault(require("./routes/tags"));
// Load environment variables
dotenv_1.default.config();
const app = (0, express_1.default)();
app.set('trust proxy', 1);
const prisma = new client_1.PrismaClient();
const allowedEmails = (process.env.ALLOWED_EMAILS || '').split(',').map(e => e.trim().toLowerCase());
app.use((req, res, next) => {
    console.log(`[${req.method}] ${req.originalUrl}`);
    next();
});
app.use((0, cors_1.default)({
    origin: ['https://recipe.youramaryllis.com', 'http://localhost:4000'],
    credentials: true,
}));
app.use(express_1.default.json());
// OIDC config for Google
app.use((0, express_openid_connect_1.auth)({
    issuerBaseURL: 'https://accounts.google.com',
    baseURL: process.env.NODE_ENV === 'production' ? 'https://recipe.youramaryllis.com' : (process.env.BASE_URL || 'http://localhost:4000'),
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
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
    afterCallback: (req, res, session) => __awaiter(void 0, void 0, void 0, function* () {
        let user = session.user;
        if (!user && session.id_token) {
            user = jsonwebtoken_1.default.decode(session.id_token);
        }
        if (!user || !user.email) {
            throw new Error(`No user email returned from Google ${JSON.stringify(user)}`);
        }
        const email = user.email.toLowerCase();
        // Find or create user in DB
        let dbUser = yield prisma.user.findUnique({ where: { email } });
        if (!dbUser) {
            dbUser = yield prisma.user.create({
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
    }),
}));
// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});
const uploadsPath = path_1.default.resolve(__dirname, '../uploads');
app.use('/uploads', express_1.default.static(uploadsPath));
// Endpoint to get current user info
app.get('/api/me', (req, res, next) => {
    console.log('Before requiresAuth - req.oidc:', JSON.stringify(req.oidc, null, 2));
    next();
}, (0, express_openid_connect_1.requiresAuth)(), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    // Debug: Log the entire OIDC object for comparison
    console.log('/api/me OIDC object after requiresAuth:', JSON.stringify(req.oidc, null, 2));
    const email = (_b = (_a = req.oidc.user) === null || _a === void 0 ? void 0 : _a.email) === null || _b === void 0 ? void 0 : _b.toLowerCase();
    if (!email)
        return res.status(401).json({ error: 'No email' });
    const dbUser = yield userService.getUserByEmail(email);
    if (!dbUser)
        return res.status(404).json({ error: 'User not found' });
    res.json(Object.assign(Object.assign({}, dbUser), { picture: req.oidc.user.picture, name: req.oidc.user.name }));
}));
// Protect recipe creation and editing/
app.use('/api/recipes', recipes_1.default);
app.use('/api/tags', tags_1.default);
// Serve static files from the React app
app.use(express_1.default.static(path_1.default.join(__dirname, '../../web/dist')));
// For any route not handled by your API, serve index.html (for React Router)
app.get(/^\/(?!api|uploads|auth).*/, (req, res) => {
    res.sendFile(path_1.default.join(__dirname, '../../web/dist', 'index.html'));
});
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
