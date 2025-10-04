import { ChatCoordinator } from '../src/services/ChatCoordinator.js';
import { EscalationContactManager } from '../src/services/escalation/EscalationContactManager.js';

class InMemorySessionRepository {
  constructor() {
    this.sessions = new Map();
  }

  getOrCreateSession(sessionId) {
    if (!this.sessions.has(sessionId)) {
      const now = new Date().toISOString();
      this.sessions.set(sessionId, {
        id: sessionId,
        language: 'it',
        started_at: now,
        last_seen_at: now,
        escalated: 0
      });
    }
    return this.sessions.get(sessionId);
  }

  updateLastSeen(sessionId, language) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.last_seen_at = new Date().toISOString();
      session.language = language || session.language;
    }
  }

  markEscalated(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.escalated = 1;
    }
  }
}

class InMemoryMessageRepository {
  constructor() {
    this.messages = new Map();
  }

  addMessage({ sessionId, role, content, confidence = null }) {
    const record = {
      session_id: sessionId,
      role,
      content,
      confidence,
      created_at: new Date().toISOString()
    };
    if (!this.messages.has(sessionId)) {
      this.messages.set(sessionId, []);
    }
    this.messages.get(sessionId).push(record);
  }

  listMessagesForSession(sessionId) {
    return this.messages.get(sessionId) || [];
  }

  getRecentMessages(sessionId, limit) {
    const items = this.messages.get(sessionId) || [];
    return items.slice(-limit);
  }
}

class InMemoryEscalationRepo {
  constructor() {
    this.records = [];
  }

  recordEscalation(entry) {
    this.records.push(entry);
  }
}

class InMemoryEscalationContactRepository {
  constructor() {
    this.records = new Map();
  }

  getBySession(sessionId) {
    return this.records.get(sessionId) || null;
  }

  upsertStatus({ sessionId, reason, status, managerMessage = '', requiresContact = false }) {
    const now = new Date().toISOString();
    const existing = this.records.get(sessionId) || {
      session_id: sessionId,
      contact_info: '',
      manager_message: '',
      created_at: now
    };
    const updated = {
      ...existing,
      status,
      reason,
      manager_message: managerMessage || existing.manager_message,
      requires_contact: requiresContact,
      updated_at: now
    };
    this.records.set(sessionId, updated);
  }

  markAwaitingConfirmation({ sessionId, reason, managerMessage = '', requiresContact = false }) {
    this.upsertStatus({ sessionId, reason, status: 'awaiting_confirmation', managerMessage, requiresContact });
  }

  markPending({ sessionId, reason, managerMessage = '', requiresContact = false }) {
    this.upsertStatus({ sessionId, reason, status: 'pending', managerMessage, requiresContact });
  }

  storeContact({ sessionId, contactInfo }) {
    const record = this.records.get(sessionId);
    if (record) {
      this.records.set(sessionId, {
        ...record,
        status: 'ready',
        contact_info: contactInfo,
        requires_contact: false,
        updated_at: new Date().toISOString()
      });
    }
  }

  storeManagerMessage({ sessionId, managerMessage }) {
    const record = this.records.get(sessionId);
    if (record) {
      this.records.set(sessionId, {
        ...record,
        manager_message: managerMessage,
        updated_at: new Date().toISOString()
      });
    }
  }

  getManagerMessage(sessionId) {
    const record = this.records.get(sessionId);
    return record?.manager_message || '';
  }

  requiresContact(sessionId) {
    const record = this.records.get(sessionId);
    return Boolean(record?.requires_contact);
  }

  delete(sessionId) {
    this.records.delete(sessionId);
  }
}

class StubDocumentManager {
  async ensureDocumentLoaded() {}
  async getRelevantChunks() {
    return [];
  }
}

class StubLlmChatService {
  constructor(responses) {
    this.responses = [...responses];
  }

  async generateResponse() {
    if (this.responses.length === 0) {
      throw new Error('No more stubbed responses');
    }
    return this.responses.shift();
  }
}

class StubEmailNotificationService {
  constructor() {
    this.sent = [];
  }

  async sendEscalationEmail(payload) {
    this.sent.push(payload);
  }
}

class StubEscalationLocalizationService {
  async buildPromptFallback() {
    return {
      buttonLabels: { it: 'Avvisa il gestore' },
      confirmationMessages: { it: 'Sì, avvisa il gestore.' }
    };
  }

  async buildContactRequestMessage() {
    return 'Per favore forniscimi un contatto per il gestore.';
  }

  async buildContactConfirmationMessage() {
    return 'Grazie, il gestore verrà avvisato presto.';
  }

  async buildContactDeclinedMessage() {
    return 'Va bene, resto a disposizione.';
  }
}

class StubEscalationIntentDetector {
  async analyzeAssistantMessage() {
    return {
      promptConfirmation: true,
      escalateImmediately: false,
      reasonHint: 'non_urgent'
    };
  }

  async analyzeUserConfirmation({ message }) {
    const normalized = (message || '').toLowerCase();
    if (normalized.includes('sì') || normalized.includes('si')) {
      return 'affirmative';
    }
    if (normalized.includes('no')) {
      return 'negative';
    }
    return 'unknown';
  }
}

const sessionRepository = new InMemorySessionRepository();
const messageRepository = new InMemoryMessageRepository();
const escalationRepository = new InMemoryEscalationRepo();
const contactRepository = new InMemoryEscalationContactRepository();
const localizationService = new StubEscalationLocalizationService();
const escalationContactManager = new EscalationContactManager({
  contactRepository,
  localizationService
});
const chatCoordinator = new ChatCoordinator({
  sessionRepository,
  messageRepository,
  escalationRepository,
  documentManager: new StubDocumentManager(),
  llmChatService: new StubLlmChatService([
    {
      answer: 'Posso avvisare il gestore, vuoi che lo faccia?',
      confidence: 0.8,
      needs_escalation: false,
      escalation_reason: 'none',
      language_code: 'it',
      interaction_type: '',
      should_collect_contact: false,
      manager_message: ''
    }
  ]),
  emailNotificationService: new StubEmailNotificationService(),
  escalationLocalizationService: localizationService,
  escalationContactManager,
  escalationIntentDetector: new StubEscalationIntentDetector()
});

async function runTest() {
  const sessionId = 'test-session';
  console.log('--- Passo 1: Richiesta iniziale ---');
  const first = await chatCoordinator.handleMessage({ sessionId, userMessage: 'Ho un problema in camera' });
  console.log('Risposta 1:', first);
  console.log('Stato contatto dopo passo 1:', contactRepository.getBySession(sessionId));

  console.log('\n--- Passo 2: Conferma utente ---');
  const second = await chatCoordinator.handleMessage({ sessionId, userMessage: 'Sì, grazie' });
  console.log('Risposta 2:', second);
  console.log('Stato contatto dopo passo 2:', contactRepository.getBySession(sessionId));

  console.log('\n--- Passo 3: Fornitura contatto ---');
  const third = await chatCoordinator.handleMessage({ sessionId, userMessage: '3391234567' });
  console.log('Risposta 3:', third);
  console.log('Stato contatto dopo passo 3:', contactRepository.getBySession(sessionId));

  console.log('\nEmail inviate:', chatCoordinator.emailNotificationService.sent);
  console.log('Sessione marcata escalated:', sessionRepository.getOrCreateSession(sessionId));
}

runTest().catch((error) => {
  console.error('Errore durante il test', error);
  process.exit(1);
});
