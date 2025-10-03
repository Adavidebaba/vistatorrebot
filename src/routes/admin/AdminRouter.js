import express from 'express';
import { AdminPageRenderer } from './AdminPageRenderer.js';
import { AdminDashboardViewModel } from './AdminDashboardViewModel.js';
import { AdminSessionDetailViewModel } from './AdminSessionDetailViewModel.js';
import { AdminConversationExporter } from './AdminConversationExporter.js';

export class AdminRouter {
  constructor({
    sessionRepository,
    messageRepository,
    documentManager,
    adminAuthMiddleware,
    conversationDeletionService,
    modelProvider,
    pageRenderer = new AdminPageRenderer(),
    conversationExporter = new AdminConversationExporter()
  }) {
    this.sessionRepository = sessionRepository;
    this.messageRepository = messageRepository;
    this.documentManager = documentManager;
    this.adminAuthMiddleware = adminAuthMiddleware;
    this.pageRenderer = pageRenderer;
    this.conversationExporter = conversationExporter;
    this.conversationDeletionService = conversationDeletionService;
    this.modelProvider = modelProvider;

    this.router = express.Router();
    this.registerPublicRoutes();
    this.registerProtectedRoutes();
  }

  registerPublicRoutes() {
    this.router.get('/admin/login', (req, res) => {
      res.send(this.pageRenderer.renderLoginPage({ hasError: false }));
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
        return res.send(this.pageRenderer.renderLoginPage({ hasError: true }));
      }
    );

    this.router.post('/admin/logout', (req, res) => {
      req.session.destroy(() => {
        res.redirect('/admin/login');
      });
    });
  }

  registerProtectedRoutes() {
    this.router.use(this.adminAuthMiddleware.ensureAuthenticated);

    this.router.get('/admin', (req, res) => {
      const selectedDays = this.resolveDaysFilter(req.query.days);
      const sessions = this.sessionRepository.listSessions({ days: selectedDays });
      const feedbackMessage = this.resolveFeedbackMessage(req.query);
      const modelOptions = this.buildModelOptions();
      const viewModel = new AdminDashboardViewModel({
        sessions,
        selectedDays,
        feedbackMessage,
        modelOptions
      });
      res.send(this.pageRenderer.renderDashboard(viewModel));
    });

    this.router.get('/admin/session/:id', (req, res) => {
      const detail = this.sessionRepository.getSessionWithMessages(req.params.id);
      if (!detail) {
        return res.status(404).send('Sessione non trovata');
      }
      const viewModel = new AdminSessionDetailViewModel(detail);
      return res.send(this.pageRenderer.renderSessionDetail(viewModel));
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
      const csv = this.conversationExporter.buildCsv(messages);
      res.header('Content-Type', 'text/csv');
      res.attachment('conversations.csv');
      res.send(csv);
    });

    this.router.post('/admin/session/:id/delete', (req, res) => {
      const sessionId = req.params.id;
      const success = this.conversationDeletionService.deleteSession(sessionId);
      res.redirect(`/admin?deleted=${success ? 1 : 0}`);
    });

    this.router.post(
      '/admin/model',
      express.urlencoded({ extended: false }),
      (req, res) => {
        if (!this.modelProvider) {
          return res.redirect('/admin?model=error');
        }
        const { model } = req.body;
        try {
          this.modelProvider.setActiveModel(model);
          res.redirect('/admin?model=updated');
        } catch (error) {
          res.redirect('/admin?model=error');
        }
      }
    );
  }

  resolveDaysFilter(daysQuery) {
    const parsed = Number(daysQuery);
    const allowed = [7, 30];
    if (allowed.includes(parsed)) {
      return parsed;
    }
    return 7;
  }

  resolveFeedbackMessage(query) {
    if (query?.deleted === '1') {
      return 'Sessione eliminata con successo';
    }
    if (query?.deleted === '0') {
      return 'Impossibile eliminare la sessione';
    }
    if (query?.model === 'updated') {
      return 'Modello LLM aggiornato';
    }
    if (query?.model === 'error') {
      return 'Impossibile aggiornare il modello LLM';
    }
    return null;
  }

  buildModelOptions() {
    if (!this.modelProvider) {
      return [];
    }
    const available = this.modelProvider.getAvailableModels();
    const active = this.modelProvider.getActiveModel();
    const activeValue = this.modelProvider.buildSelectionValue(active);
    return available.map((model) => ({
      value: this.modelProvider.buildSelectionValue(model),
      label: model.label || this.modelProvider.buildSelectionValue(model),
      selected:
        this.modelProvider.buildSelectionValue({ provider: model.provider, model: model.model }) ===
        activeValue
    }));
  }
}
