class EscalationPromptController {
  constructor({ onConfirm }) {
    this.onConfirm = onConfirm;
  }

  render({ container, promptState }) {
    if (!promptState?.shouldDisplay) {
      return;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'escalation-actions';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'escalation-button';
    button.textContent = this.buildLabel(promptState.buttonLabels);

    button.addEventListener('click', async () => {
      if (button.disabled) {
        return;
      }
      button.disabled = true;
      try {
        const confirmationMessage = this.buildConfirmationMessage(promptState.confirmationMessages);
        await this.onConfirm({ message: confirmationMessage });
        wrapper.remove();
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Errore durante la conferma di escalation', error);
        button.disabled = false;
      }
    });

    wrapper.appendChild(button);
    container.appendChild(wrapper);
  }

  buildLabel(labels = {}) {
    const preferred = this.pickPrimary(labels);
    if (preferred) {
      return preferred;
    }
    return 'Avvisa il gestore / Notify the manager';
  }

  buildConfirmationMessage(messages = {}) {
    const preferred = this.pickPrimary(messages);
    if (preferred) {
      return preferred;
    }
    return 'Sì, per favore avvisa il gestore per me. / Yes, please notify the manager for me.';
  }

  pickPrimary(values = {}) {
    if (typeof values !== 'object' || values === null) {
      return null;
    }
    const [language] = Object.keys(values);
    const value = values[language];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
    return null;
  }
}

const messagesContainer = document.getElementById('messages');
const form = document.getElementById('chat-form');
const input = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const loadingIndicator = document.getElementById('loading-indicator');

let currentSessionId = null;
let escalationPromptController;

const setLoading = (isLoading) => {
  if (isLoading) {
    loadingIndicator.removeAttribute('hidden');
  } else {
    loadingIndicator.setAttribute('hidden', '');
  }
  sendButton.disabled = Boolean(isLoading);
};

const buildSessionHeaders = (headers = {}) => {
  if (!currentSessionId) {
    return headers;
  }
  return {
    ...headers,
    'X-Session-Id': currentSessionId
  };
};

const ensureSession = async () => {
  try {
    const response = await fetch('/api/session', {
      credentials: 'same-origin'
    });
    if (!response.ok) {
      throw new Error('Session request failed');
    }
    const data = await response.json();
    currentSessionId = data.sessionId || null;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Impossibile inizializzare la sessione', error);
  }
};

const appendMessage = ({ role, content, escalated, reason, escalationPrompt }) => {
  const wrapper = document.createElement('div');
  wrapper.className = `message ${role}`;
  const text = document.createElement('p');
  text.textContent = content;
  wrapper.appendChild(text);
  if (role === 'assistant' && escalated) {
    const badge = document.createElement('span');
    badge.className = 'escalation';
    badge.textContent = reason === 'urgent' ? 'Escalation urgente' : 'Escalation gestore';
    wrapper.appendChild(badge);
  }
  if (role === 'assistant' && escalationPromptController) {
    escalationPromptController.render({ container: wrapper, promptState: escalationPrompt });
  }
  messagesContainer.appendChild(wrapper);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
};

const loadHistory = async () => {
  setLoading(true);
  await ensureSession();

  try {
    const response = await fetch('/api/messages', {
      credentials: 'same-origin',
      headers: buildSessionHeaders()
    });
    if (!response.ok) {
      throw new Error('History request failed');
    }
    const data = await response.json();
    if (!currentSessionId && data.sessionId) {
      currentSessionId = data.sessionId;
    }
    if (Array.isArray(data.messages)) {
      data.messages.forEach((message) => {
        appendMessage({
          role: message.role,
          content: message.content,
          escalated: Boolean(message.escalated),
          reason: message.reason
        });
      });
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Impossibile caricare la cronologia chat', error);
  } finally {
    setLoading(false);
    input.focus();
  }
};

async function submitMessage({ message, clearInput = true }) {
  const trimmedMessage = typeof message === 'string' ? message.trim() : '';
  if (!trimmedMessage) {
    return;
  }

  appendMessage({ role: 'user', content: trimmedMessage });
  if (clearInput) {
    input.value = '';
  }
  input.disabled = true;
  setLoading(true);

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: buildSessionHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ message: trimmedMessage }),
      credentials: 'same-origin'
    });
    if (!response.ok) {
      throw new Error('Errore nella richiesta');
    }
    const data = await response.json();
    if (data.sessionId && !currentSessionId) {
      currentSessionId = data.sessionId;
    }
    appendMessage({
      role: 'assistant',
      content: data.answer,
      escalated: data.escalated,
      reason: data.reason,
      escalationPrompt: data.escalationPrompt
    });
  } catch (error) {
    appendMessage({
      role: 'assistant',
      content: 'Si è verificato un errore. Riprovi tra qualche istante.'
    });
  } finally {
    input.disabled = false;
    setLoading(false);
    input.focus();
  }
}

escalationPromptController = new EscalationPromptController({
  onConfirm: async ({ message }) => submitMessage({ message, clearInput: false })
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  await submitMessage({ message: input.value, clearInput: true });
});

loadHistory();
