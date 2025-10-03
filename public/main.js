const messagesContainer = document.getElementById('messages');
const form = document.getElementById('chat-form');
const input = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const loadingIndicator = document.getElementById('loading-indicator');

let currentSessionId = null;

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

const appendMessage = ({ role, content, escalated, reason }) => {
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

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = input.value.trim();
  if (!message) {
    return;
  }
  appendMessage({ role: 'user', content: message });
  input.value = '';
  input.disabled = true;
  setLoading(true);

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: buildSessionHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ message }),
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
      reason: data.reason
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
});

loadHistory();
