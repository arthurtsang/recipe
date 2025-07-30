import { prisma } from '../index';

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
export const requiresAdmin = () => {
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