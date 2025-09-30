import express from 'express';

export class AdminRouter {
  constructor({
    sessionRepository,
    messageRepository,
    documentManager,
    adminAuthMiddleware
  }) {
    this.sessionRepository = sessionRepository;
    this.messageRepository = messageRepository;
    this.documentManager = documentManager;
    this.adminAuthMiddleware = adminAuthMiddleware;
    this.router = express.Router();
    this.registerRoutes();
  }

  registerRoutes() {
    this.router.get('/admin/login', (req, res) => {
      res.send(this.renderLoginPage());
    });

    this.router.post(
      '/admin/login',
      express.urlencoded({ extended: false }),
      (req, res) => {
        const { password } = req.body;
        if (this.adminAuthMiddleware.validatePassword(password)) {
          req.session.isAdmin = true;
          return res.redirect('/admin');
        }
        return res.send(this.renderLoginPage(true));
      }
    );

    this.router.post('/admin/logout', (req, res) => {
      req.session.destroy(() => {
        res.redirect('/admin/login');
      });
    });

    this.router.use(this.adminAuthMiddleware.ensureAuthenticated);

    this.router.get('/admin', (req, res) => {
      const days = Number(req.query.days || 7);
      const sessions = this.sessionRepository.listSessions({ days });
      res.send(this.renderAdminDashboard({ sessions, days }));
    });

    this.router.get('/admin/session/:id', (req, res) => {
      const detail = this.sessionRepository.getSessionWithMessages(req.params.id);
      if (!detail) {
        return res.status(404).send('Sessione non trovata');
      }
      res.send(this.renderSessionDetail(detail));
    });

    this.router.post('/admin/refresh-doc', async (req, res) => {
      try {
        await this.documentManager.refreshDocument();
        res.redirect('/admin?refreshed=1');
      } catch (error) {
        res.status(500).send('Impossibile aggiornare il documento');
      }
    });

    this.router.get('/admin/export.csv', (req, res) => {
      const messages = this.messageRepository.listAllMessages();
      const header = 'session_id,started_at,role,content,confidence,created_at';
      const rows = messages.map((message) => {
        const escapedContent = (message.content || '').replace(/"/g, '""');
        return `"${message.session_id}","${message.started_at}","${message.role}","${escapedContent}","${message.confidence ?? ''}","${message.created_at}"`;
      });
      const csv = [header, ...rows].join('\n');
      res.header('Content-Type', 'text/csv');
      res.attachment('conversations.csv');
      res.send(csv);
    });
  }

  renderLoginPage(error = false) {
    const message = error ? '<p style="color:red;">Password non valida</p>' : '';
    return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <title>Admin – Accesso</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 400px; margin: 80px auto; }
    form { display: flex; flex-direction: column; gap: 12px; }
    input { padding: 8px; font-size: 16px; }
    button { padding: 10px; font-size: 16px; cursor: pointer; }
  </style>
</head>
<body>
  <h1>Accesso amministratore</h1>
  ${message}
  <form method="post" action="/admin/login">
    <label for="password">Password</label>
    <input type="password" id="password" name="password" required />
    <button type="submit">Accedi</button>
  </form>
</body>
</html>`;
  }

  renderAdminDashboard({ sessions, days }) {
    const rows = sessions
      .map(
        (session) => `
        <tr>
          <td><a href="/admin/session/${session.id}">${session.id}</a></td>
          <td>${session.started_at}</td>
          <td>${session.last_seen_at}</td>
          <td>${session.language || '-'}</td>
          <td>${session.escalated ? 'Sì' : 'No'}</td>
        </tr>`
      )
      .join('');

    return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <title>Admin – Sessioni</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; }
    table { border-collapse: collapse; width: 100%; margin-top: 20px; }
    th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
    th { background: #f7f7f7; }
    header { display: flex; justify-content: space-between; align-items: center; }
    form.inline { display: inline-block; margin-right: 10px; }
    .filters { margin-top: 10px; }
    nav a { margin-right: 10px; }
  </style>
</head>
<body>
  <header>
    <h1>Sessioni ospiti</h1>
    <form method="post" action="/admin/logout">
      <button type="submit">Disconnetti</button>
    </form>
  </header>
  <section class="filters">
    <form class="inline" method="get" action="/admin">
      <label for="days">Intervallo giorni:</label>
      <select id="days" name="days">
        <option value="7" ${days === 7 ? 'selected' : ''}>Ultimi 7</option>
        <option value="30" ${days === 30 ? 'selected' : ''}>Ultimi 30</option>
      </select>
      <button type="submit">Filtra</button>
    </form>
    <form class="inline" method="post" action="/admin/refresh-doc">
      <button type="submit">Aggiorna documento</button>
    </form>
    <a href="/admin/export.csv">Esporta CSV</a>
  </section>
  <table>
    <thead>
      <tr>
        <th>ID sessione</th>
        <th>Inizio</th>
        <th>Ultimo accesso</th>
        <th>Lingua</th>
        <th>Escalation</th>
      </tr>
    </thead>
    <tbody>
      ${rows || '<tr><td colspan="5">Nessuna sessione</td></tr>'}
    </tbody>
  </table>
</body>
</html>`;
  }

  renderSessionDetail({ session, messages }) {
    const items = messages
      .map(
        (message) => `
        <div class="message ${message.role}">
          <div class="meta">${message.created_at} – ${message.role}</div>
          <div class="body">${this.escapeHtml(message.content)}</div>
        </div>`
      )
      .join('');

    return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <title>Sessione ${session.id}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; }
    .message { border: 1px solid #ddd; padding: 12px; margin-bottom: 12px; border-radius: 6px; }
    .message.user { background: #f0f8ff; }
    .message.assistant { background: #f9f9f9; }
    .meta { font-size: 12px; color: #555; margin-bottom: 6px; }
    a { display: inline-block; margin-bottom: 20px; }
  </style>
</head>
<body>
  <a href="/admin">← Torna alle sessioni</a>
  <h1>Sessione ${session.id}</h1>
  <p>Iniziata: ${session.started_at}</p>
  <p>Ultimo accesso: ${session.last_seen_at}</p>
  <p>Lingua: ${session.language || '-'}</p>
  <p>Escalation: ${session.escalated ? 'Sì' : 'No'}</p>
  ${items || '<p>Nessun messaggio</p>'}
</body>
</html>`;
  }

  escapeHtml(text) {
    if (!text) {
      return '';
    }
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
      .replace(/\n/g, '<br/>');
  }
}
