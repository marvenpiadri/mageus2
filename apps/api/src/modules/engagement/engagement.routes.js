import { Router } from 'express';

export const engagementRoutes = Router();

// Fail closed until the new identity/session issuer is wired in.
// This deliberately does not trust the legacy token format or any user ID supplied by a client.
function requireVerifiedIdentity(_req, res) {
  return res.status(401).json({
    error: {
      code: 'AUTHENTICATION_REQUIRED',
      message: 'Sign in to interact with articles.'
    }
  });
}

engagementRoutes.post('/articles/:articleId/likes', requireVerifiedIdentity);
engagementRoutes.delete('/articles/:articleId/likes', requireVerifiedIdentity);
engagementRoutes.get('/articles/:articleId/comments', (req, res) => {
  // Reading public comments can remain public; writing/moderating comments requires identity.
  res.status(501).json({ error: { code: 'COMMENTS_NOT_IMPLEMENTED', message: 'Comment reading is not connected yet.' } });
});
engagementRoutes.post('/articles/:articleId/comments', requireVerifiedIdentity);
