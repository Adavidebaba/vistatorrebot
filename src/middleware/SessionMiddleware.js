const SESSION_COOKIE = 'session_id';

export class SessionMiddleware {
  constructor({ sessionRepository }) {
    this.sessionRepository = sessionRepository;
    this.handle = this.handle.bind(this);
  }

  handle(req, res, next) {
    const headerId = req.get('x-session-id');
    const existingId = req.cookies[SESSION_COOKIE] || headerId;
    const session = this.sessionRepository.getOrCreateSession(existingId);

    const cookieMissing = !req.cookies[SESSION_COOKIE];
    const cookieMismatch = req.cookies[SESSION_COOKIE] && req.cookies[SESSION_COOKIE] !== session.id;

    if (cookieMissing || cookieMismatch) {
      res.cookie(SESSION_COOKIE, session.id, {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 365 * 24 * 60 * 60 * 1000,
        path: '/'
      });
    }

    req.sessionId = session.id;
    next();
  }
}
