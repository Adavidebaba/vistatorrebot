import express from 'express';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import path from 'path';

import { SessionRepository } from '../repositories/SessionRepository.js';
import { MessageRepository } from '../repositories/MessageRepository.js';
import { EscalationRepository } from '../repositories/EscalationRepository.js';
import { EscalationContactRepository } from '../repositories/EscalationContactRepository.js';
import { DocsCacheRepository } from '../repositories/DocsCacheRepository.js';
import { SettingsRepository } from '../repositories/SettingsRepository.js';
import { DocumentManager } from '../services/DocumentManager.js';
import { LlmChatService } from '../services/LlmChatService.js';
import { EmailNotificationService } from '../services/EmailNotificationService.js';
import { ChatCoordinator } from '../services/ChatCoordinator.js';
import { ChatHistoryService } from '../services/ChatHistoryService.js';
import { ConversationDeletionService } from '../services/ConversationDeletionService.js';
import { LlmModelProvider } from '../services/llm/LlmModelProvider.js';
import { LanguageDetectionService } from '../services/language/LanguageDetectionService.js';
import { AdminDashboardPreferences } from '../services/admin/AdminDashboardPreferences.js';
import { LlmSystemPromptProvider } from '../services/llm/LlmSystemPromptProvider.js';
import { LlmPromptSettingsResolver } from '../services/llm/LlmPromptSettingsResolver.js';
import { LlmTranslationService } from '../services/llm/LlmTranslationService.js';
import { EscalationLocalizationService } from '../services/escalation/EscalationLocalizationService.js';
import { EscalationContactManager } from '../services/escalation/EscalationContactManager.js';
import { SessionMiddleware } from '../middleware/SessionMiddleware.js';
import { AdminAuthMiddleware } from '../middleware/AdminAuthMiddleware.js';
import { PublicRouter } from '../routes/PublicRouter.js';
import { AdminRouter } from '../routes/admin/AdminRouter.js';

export class AppServer {
  constructor({ environmentConfig, databaseManager }) {
    this.environmentConfig = environmentConfig;
    this.databaseManager = databaseManager;

    this.sessionRepository = new SessionRepository(databaseManager);
    this.messageRepository = new MessageRepository(databaseManager);
    this.escalationRepository = new EscalationRepository(databaseManager);
    this.escalationContactRepository = new EscalationContactRepository(databaseManager);
    this.docsCacheRepository = new DocsCacheRepository(databaseManager);
    this.settingsRepository = new SettingsRepository(databaseManager);
    this.promptSettingsResolver = new LlmPromptSettingsResolver({
      settingsRepository: this.settingsRepository
    });
    this.llmModelProvider = new LlmModelProvider({
      environmentConfig: this.environmentConfig,
      settingsRepository: this.settingsRepository
    });
    this.documentManager = new DocumentManager({
      docsCacheRepository: this.docsCacheRepository,
      environmentConfig: this.environmentConfig
    });
    this.llmSystemPromptProvider = new LlmSystemPromptProvider({
      environmentConfig,
      promptSettingsResolver: this.promptSettingsResolver
    });
    this.llmChatService = new LlmChatService({
      environmentConfig,
      modelProvider: this.llmModelProvider,
      systemPromptProvider: this.llmSystemPromptProvider
    });
    this.emailNotificationService = new EmailNotificationService({ environmentConfig });
    this.chatHistoryService = new ChatHistoryService({
      messageRepository: this.messageRepository
    });
    this.conversationDeletionService = new ConversationDeletionService({
      sessionRepository: this.sessionRepository,
      messageRepository: this.messageRepository,
      escalationRepository: this.escalationRepository,
      escalationContactRepository: this.escalationContactRepository
    });
    this.languageDetectionService = new LanguageDetectionService();
    this.llmTranslationService = new LlmTranslationService({ environmentConfig });
    this.escalationLocalizationService = new EscalationLocalizationService({
      translationService: this.llmTranslationService
    });
    this.escalationContactManager = new EscalationContactManager({
      contactRepository: this.escalationContactRepository,
      localizationService: this.escalationLocalizationService
    });
    this.adminDashboardPreferences = new AdminDashboardPreferences({
      settingsRepository: this.settingsRepository,
      environmentConfig: this.environmentConfig,
      systemPromptProvider: this.llmSystemPromptProvider,
      promptSettingsResolver: this.promptSettingsResolver
    });
    this.chatCoordinator = new ChatCoordinator({
      sessionRepository: this.sessionRepository,
      messageRepository: this.messageRepository,
      escalationRepository: this.escalationRepository,
      documentManager: this.documentManager,
      llmChatService: this.llmChatService,
      emailNotificationService: this.emailNotificationService,
      escalationLocalizationService: this.escalationLocalizationService,
      escalationContactManager: this.escalationContactManager,
      languageDetectionService: this.languageDetectionService
    });

    this.sessionMiddleware = new SessionMiddleware({ sessionRepository: this.sessionRepository });
    this.adminAuthMiddleware = new AdminAuthMiddleware({ environmentConfig });

    this.publicRouter = new PublicRouter({
      chatCoordinator: this.chatCoordinator,
      chatHistoryService: this.chatHistoryService
    });
    this.adminRouter = new AdminRouter({
      sessionRepository: this.sessionRepository,
      messageRepository: this.messageRepository,
      documentManager: this.documentManager,
      adminAuthMiddleware: this.adminAuthMiddleware,
      conversationDeletionService: this.conversationDeletionService,
      modelProvider: this.llmModelProvider,
      dashboardPreferences: this.adminDashboardPreferences
    });

    this.app = express();
    this.configureApp();
  }

  configureApp() {
    this.app.use(cookieParser());
    this.app.use(
      session({
        secret: this.environmentConfig.adminPassword || 'vistatorre-secret',
        resave: false,
        saveUninitialized: false
      })
    );

    this.app.use('/static', express.static(path.join(process.cwd(), 'public')));
    this.app.use(this.adminRouter.router);

    const publicApp = express.Router();
    publicApp.use(this.sessionMiddleware.handle);
    publicApp.use(this.publicRouter.router);
    this.app.use(publicApp);
  }

  start() {
    return this.app.listen(this.environmentConfig.port, () => {
      // eslint-disable-next-line no-console
      console.log(`Server avviato sulla porta ${this.environmentConfig.port}`);
    });
  }
}
