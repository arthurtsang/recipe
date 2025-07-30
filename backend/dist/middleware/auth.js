"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requiresAdmin = exports.requiresEnabledUser = void 0;
const index_1 = require("../index");
// Middleware to check if user is enabled
const requiresEnabledUser = () => {
    return (req, res, next) => {
        var _a, _b, _c;
        if (!((_b = (_a = req.oidc) === null || _a === void 0 ? void 0 : _a.user) === null || _b === void 0 ? void 0 : _b.email)) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        const isAdmin = req.oidc.user.email.toLowerCase() === ((_c = process.env.ADMIN_EMAIL) === null || _c === void 0 ? void 0 : _c.toLowerCase());
        if (isAdmin) {
            return next(); // Admin always has access
        }
        // Check if user is enabled in database
        index_1.prisma.user.findUnique({
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
exports.requiresEnabledUser = requiresEnabledUser;
// Middleware to check if user is admin
const requiresAdmin = () => {
    return (req, res, next) => {
        var _a, _b, _c;
        if (!((_b = (_a = req.oidc) === null || _a === void 0 ? void 0 : _a.user) === null || _b === void 0 ? void 0 : _b.email)) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        const isAdmin = req.oidc.user.email.toLowerCase() === ((_c = process.env.ADMIN_EMAIL) === null || _c === void 0 ? void 0 : _c.toLowerCase());
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        next();
    };
};
exports.requiresAdmin = requiresAdmin;
