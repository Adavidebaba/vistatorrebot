export class AdminPageRenderer {
  renderLoginPage({ hasError = false } = {}) {
    const errorMessage = hasError ? '<p style="color:red;">Password non valida</p>' : '';
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
  ${errorMessage}
  <form method="post" action="/admin/login">
    <label for="password">Password</label>
    <input type="password" id="password" name="password" required />
    <button type="submit">Accedi</button>
  </form>
</body>
</html>`;
  }

  renderDashboard(viewModel) {
    const rows = viewModel.hasSessions
      ? viewModel.tableRows
          .map(
            (row) => `
        <tr>
          <td><a href="/admin/session/${this.escapeHtml(row.id)}">${this.escapeHtml(row.id)}</a></td>
          <td>${this.escapeHtml(row.startedAt)}</td>
          <td>${this.escapeHtml(row.lastSeenAt)}</td>
          <td>${this.escapeHtml(row.language || '-')}</td>
          <td>${row.escalated ? 'Sì' : 'No'}</td>
          <td>
            <form method="post" action="/admin/session/${this.escapeHtml(row.id)}/delete" onsubmit="return confirm('Eliminare definitivamente la sessione?');">
              <button type="submit">Elimina</button>
            </form>
          </td>
        </tr>`
          )
          .join('')
      : '<tr><td colspan="6">Nessuna sessione</td></tr>';

    const options = viewModel.daysOptions
      .map((option) => `
        <option value="${option.value}" ${option.selected ? 'selected' : ''}>${option.label}</option>`)
      .join('');

    const modelSelect = viewModel.hasModelOptions
      ? `
    <form class="inline" method="post" action="/admin/model">
      <label for="model">Modello LLM:</label>
      <select id="model" name="model">
        ${viewModel.modelOptions
          .map(
            (option) => `
        <option value="${this.escapeHtml(option.value)}" ${option.selected ? 'selected' : ''}>
          ${this.escapeHtml(option.label)}
        </option>`
          )
          .join('')}
      </select>
      <button type="submit">Imposta</button>
    </form>`
      : '';

    const feedback = viewModel.hasFeedback
      ? `<div class="alert">${this.escapeHtml(viewModel.feedbackMessage)}</div>`
      : '';

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
    .alert { margin-top: 15px; padding: 10px; border-radius: 6px; background: #e8f5e9; color: #2e7d32; }
    td form { margin: 0; }
    td form button { background: #d9534f; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; }
    td form button:hover { opacity: 0.9; }
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
        ${options}
      </select>
      <button type="submit">Filtra</button>
    </form>
    <form class="inline" method="post" action="/admin/refresh-doc">
      <button type="submit">Aggiorna documento</button>
    </form>
    <a href="/admin/export.csv">Esporta CSV</a>
    ${modelSelect}
  </section>
  ${feedback}
  <table>
    <thead>
      <tr>
        <th>ID sessione</th>
        <th>Inizio</th>
        <th>Ultimo accesso</th>
        <th>Lingua</th>
        <th>Escalation</th>
        <th>Azioni</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
</body>
</html>`;
  }

  renderSessionDetail(viewModel) {
    const items = viewModel.messageItems
      .map(
        (message) => `
        <div class="message ${message.role}">
          <div class="meta">${this.escapeHtml(message.createdAt)} – ${this.escapeHtml(message.role)}</div>
          <div class="body">${this.formatMessageContent(message.content)}</div>
        </div>`
      )
      .join('');

    return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <title>Sessione ${this.escapeHtml(viewModel.sessionInfo.id)}</title>
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
  <h1>Sessione ${this.escapeHtml(viewModel.sessionInfo.id)}</h1>
  <p>Iniziata: ${this.escapeHtml(viewModel.sessionInfo.startedAt)}</p>
  <p>Ultimo accesso: ${this.escapeHtml(viewModel.sessionInfo.lastSeenAt)}</p>
  <p>Lingua: ${this.escapeHtml(viewModel.sessionInfo.language || '-')}</p>
  <p>Escalation: ${viewModel.sessionInfo.escalated ? 'Sì' : 'No'}</p>
  ${items || '<p>Nessun messaggio</p>'}
</body>
</html>`;
  }

  formatMessageContent(content) {
    if (!content) {
      return '';
    }
    return this.escapeHtml(content).replace(/\n/g, '<br/>');
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
      .replace(/'/g, '&#039;');
  }
}
