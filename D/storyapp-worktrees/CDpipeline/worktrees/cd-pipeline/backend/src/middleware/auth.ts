import { Request, Response, NextFunction } from 'express';

declare global {
  namespace Express {
    interface User { id: string; roles?: string[]; permissions?: string[]; }
    interface Request { user: User; }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  req.user = { id: 'dev-user', roles: ['author'], permissions: ['project:read','project:write','project:delete'] };
  next();
}

export function authorize(required: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const perms = req.user?.permissions || [];
    if (!perms.includes(required)) return res.status(403).json({ success:false, message:'Forbidden' });
    next();
  };
}