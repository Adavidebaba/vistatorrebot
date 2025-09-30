export class AdminAuthMiddleware {
  constructor({ environmentConfig }) {
    this.environmentConfig = environmentConfig;
    this.ensureAuthenticated = this.ensureAuthenticated.bind(this);
  }

  ensureAuthenticated(req, res, next) {
    if (req.session && req.session.isAdmin) {
      return next();
    }
    return res.redirect('/admin/login');
  }

  validatePassword(password) {
    return password === this.environmentConfig.adminPassword;
  }
}
