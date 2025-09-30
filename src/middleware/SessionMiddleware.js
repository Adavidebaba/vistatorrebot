const SESSION_COOKIE = 'session_id';

export class SessionMiddleware {
  constructor({ sessionRepository }) {
    this.sessionRepository = sessionRepository;
    this.handle = this.handle.bind(this);
  }

  handle(req, res, next) {
    const existingId = req.cookies[SESSION_COOKIE];
    const session = this.sessionRepository.getOrCreateSession(existingId);
    if (!existingId) {
      res.cookie(SESSION_COOKIE, session.id, {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 365 * 24 * 60 * 60 * 1000
      });
    }
    req.sessionId = session.id;
    next();
  }
}
