"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sessionMiddleware = void 0;
exports.ensureAuthenticated = ensureAuthenticated;
exports.sessionMiddleware = require('express-session')({
    secret: process.env.SESSION_SECRET || 'dev-secret',
    resave: false,
    saveUninitialized: false,
});
function ensureAuthenticated(req, res, next) {
    const reqAny = req;
    if (reqAny.isAuthenticated && reqAny.isAuthenticated())
        return next();
    res.status(401).json({ error: 'Not authenticated' });
}
