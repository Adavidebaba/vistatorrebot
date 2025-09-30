const messagesContainer = document.getElementById('messages');
const form = document.getElementById('chat-form');
const input = document.getElementById('message-input');

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

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = input.value.trim();
  if (!message) {
    return;
  }
  appendMessage({ role: 'user', content: message });
  input.value = '';
  input.disabled = true;

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });
    if (!response.ok) {
      throw new Error('Errore nella richiesta');
    }
    const data = await response.json();
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
    input.focus();
  }
});
