import OpenAI from 'openai';

import { LlmPromptComposer } from './llm/LlmPromptComposer.js';
import { LlmResponseParser } from './llm/LlmResponseParser.js';

const SYSTEM_PROMPT = `Sei un assistente **formale** per un affittacamere italiano.
Rispondi sempre nella **lingua dell'utente** (quella del suo messaggio).
Usa **solo** i FRAMMENTI_DI_DOCUMENTAZIONE forniti come contesto per dare informazioni su casa, soggiorno e città.
Se l'informazione non è presente nei frammenti, **non inventare**.
In caso di rischi per sicurezza/salute o imprevisti seri, proponi contatto umano.

Devi restituire **SOLO JSON** con questa forma:
{
  "answer": string,
  "confidence": number,
  "needs_escalation": boolean,
  "escalation_reason": "missing_info" | "urgent" | "none",
  "snippets_used": [string]
}

Linee guida:
- Se copertura bassa (<0.5) o nessun frammento rilevante: needs_escalation=true, motivo missing_info.
- Se temi di **sicurezza/urgenza** (gas, incendio/fumo, elettricità, allagamenti, chiavi bloccate, emergenze sanitarie): needs_escalation=true, motivo urgent.
- Quando proponi escalation, includi una frase tipo:
  "Se desidera, posso avvisare immediatamente il gestore: mi conferma?" (nella lingua dell’utente).
`;

export class LlmChatService {
  constructor({ environmentConfig, promptComposer, responseParser, openAiClient }) {
    this.environmentConfig = environmentConfig;
    this.promptComposer =
      promptComposer || new LlmPromptComposer({ systemPrompt: SYSTEM_PROMPT });
    this.responseParser = responseParser || new LlmResponseParser();
    this.client =
      openAiClient || new OpenAI({ apiKey: environmentConfig.llmApiKey });
  }

  async generateResponse({ userMessage, contextFragments = [] }) {
    const inputMessages = this.promptComposer.composeMessages({
      contextFragments,
      userMessage
    });

    const response = await this.client.responses.create({
      model: this.environmentConfig.llmModel,
      response_format: { type: 'json_object' },
      input: inputMessages
    });

    return this.responseParser.parse(response);
  }
}
