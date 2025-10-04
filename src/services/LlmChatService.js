import OpenAI from 'openai';

import { LlmPromptComposer } from './llm/LlmPromptComposer.js';
import { LlmResponseParser } from './llm/LlmResponseParser.js';
import { LlmResponseSchemaProvider } from './llm/LlmResponseSchemaProvider.js';
import { LlmSystemPromptProvider } from './llm/LlmSystemPromptProvider.js';
import { Logger } from '../utils/Logger.js';

export class LlmChatService {
  constructor({
    environmentConfig,
    promptComposer,
    responseParser,
    systemPromptProvider,
    responseSchemaProvider,
    openAiClient,
    modelProvider
  }) {
    this.environmentConfig = environmentConfig;
    this.logger = Logger.for('LlmChatService');
    this.debugLoggingEnabled = this.isDebugLogLevel();
    this.systemPromptProvider =
      systemPromptProvider ||
      new LlmSystemPromptProvider({ environmentConfig: this.environmentConfig });
    const systemPrompt = this.systemPromptProvider.getPrompt();
    this.promptComposer =
      promptComposer ||
      new LlmPromptComposer({
        systemPrompt,
        systemPromptProvider: this.systemPromptProvider
      });
    this.responseParser = responseParser || new LlmResponseParser();
    this.responseSchemaProvider =
      responseSchemaProvider || new LlmResponseSchemaProvider();
    this.openAiClient = openAiClient || new OpenAI({ apiKey: environmentConfig.llmApiKey });
    this.modelProvider = modelProvider || {
      getModelCandidates: () => [
        { provider: 'openai', model: this.environmentConfig.llmModel }
      ],
      buildSelectionValue: ({ provider, model }) => `${provider}:${model}`
    };
  }

  async generateResponse({ conversationMessages = [], contextFragments = [] }) {
    this.logger.debug('Preparing LLM request', {
      contextFragments: contextFragments.length,
      conversationMessages: conversationMessages.length
    });
    const inputMessages = this.promptComposer.composeMessages({
      contextFragments,
      conversationMessages
    });
    this.logDebugPayload('llm:composed_messages', inputMessages);

    const reasoningOptions = this.buildReasoningOptions();
    const maxOutputTokens = this.environmentConfig.llmMaxOutputTokens;

    const candidates = this.modelProvider.getModelCandidates();
    if (!candidates || candidates.length === 0) {
      throw new Error('Nessun modello LLM disponibile.');
    }

    let lastError = null;

    for (const candidate of candidates) {
      try {
        this.logger.debug('Attempting model candidate', candidate);
        if (candidate.provider === 'xai') {
          return await this.generateWithXai({
            model: candidate.model,
            messages: inputMessages,
            maxOutputTokens
          });
        }

        return await this.generateWithOpenAi({
          model: candidate.model,
          messages: inputMessages,
          reasoningOptions,
          maxOutputTokens
        });
      } catch (error) {
        lastError = error;
        this.logger.warn(
          'Model candidate failed',
          candidate,
          error?.message || 'unknown error'
        );
      }
    }

    if (lastError) {
      throw lastError;
    }

    throw new Error('Nessun modello ha prodotto una risposta valida.');
  }

  async generateWithOpenAi({ model, messages, reasoningOptions, maxOutputTokens }) {
    const payload = {
      model,
      input: messages
    };

    if (this.modelSupportsJsonSchema(model)) {
      payload.text = {
        format: this.responseSchemaProvider.buildJsonSchemaFormat()
      };
    }

    if (reasoningOptions && this.modelSupportsReasoning(model)) {
      payload.reasoning = reasoningOptions;
    }
    if (typeof maxOutputTokens === 'number') {
      payload.max_output_tokens = maxOutputTokens;
    }

    this.logDebugPayload('openai:request_payload', payload);
    const response = await this.openAiClient.responses.create(payload);
    const serializedResponse =
      typeof response?.toJSON === 'function' ? response.toJSON() : response;
    this.logDebugPayload('openai:response_payload', serializedResponse);
    this.logUsage(response.usage);
    this.logger.debug('OpenAI response received');
    return this.responseParser.parse(response);
  }

  async generateWithXai({ model, messages, maxOutputTokens }) {
    if (!this.environmentConfig.xaiApiKey) {
      throw new Error('XAI_API_KEY is not configured');
    }

    const body = {
      model,
      messages,
      temperature: 0
    };
    if (typeof maxOutputTokens === 'number') {
      body.max_tokens = maxOutputTokens;
    }

    const schemaFormat = this.responseSchemaProvider.buildJsonSchemaFormat();
    if (schemaFormat && schemaFormat.type === 'json_schema') {
      body.response_format = {
        type: 'json_schema',
        json_schema: {
          name: schemaFormat.name,
          schema: schemaFormat.schema,
          strict: schemaFormat.strict !== false
        }
      };
    }

    this.logDebugPayload('xai:request_payload', body);
    const response = await fetch(`${this.environmentConfig.xaiBaseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.environmentConfig.xaiApiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.warn('xAI request failed', {
        status: response.status,
        errorText
      });
      throw new Error(`xAI request failed: ${response.status} ${errorText}`);
    }

    const rawResponse = await response.clone().text();
    this.logDebugPayload('xai:raw_response', rawResponse);
    const payload = await response.json();
    this.logDebugPayload('xai:response_payload', payload);
    this.logUsage(payload.usage);
    this.logger.debug('xAI response received');

    const rawContent = payload?.choices?.[0]?.message?.content;
    if (!rawContent) {
      throw new Error('xAI response missing content');
    }

    this.logDebugPayload('xai:raw_content', rawContent);

    try {
      const parsed = JSON.parse(rawContent);
      this.logDebugPayload('xai:parsed_payload', parsed);
      this.logger.debug('xAI JSON parsed successfully');
      return this.responseParser.withDefaultFields(parsed);
    } catch (error) 
    {
      // this.logger.warn('xAI returned non-JSON payload, attempting fallback interpretation', {
      //   messageLength: typeof rawContent === 'string' ? rawContent.length : null
      // });
      const fallbackPayload = {
        answer: rawContent,
        confidence: 0.5,
        needs_escalation: false,
        escalation_reason: 'none',
        snippets_used: []
      };  
      this.logDebugPayload('xai:fallback_payload', fallbackPayload);
      return this.responseParser.withDefaultFields(fallbackPayload);
    }
    return this.responseParser.withDefaultFields(rawContent);
  }

  logUsage(usage = {}) {
    const promptTokens = usage.input_tokens ?? usage.prompt_tokens ?? 0;
    const completionTokens = usage.output_tokens ?? usage.completion_tokens ?? 0;
    const totalTokens = usage.total_tokens ?? promptTokens + completionTokens;
    this.logger.info('Usage', { promptTokens, completionTokens, totalTokens });
  }

  buildReasoningOptions() {
    const effort = this.environmentConfig.llmReasoningEffort;
    const summary = this.environmentConfig.llmReasoningSummary;

    const hasEffort = effort !== undefined;
    const hasSummary = summary !== undefined;

    if (!hasEffort && !hasSummary) {
      return null;
    }

    const options = {};
    if (hasEffort) {
      options.effort = effort;
    }
    if (hasSummary) {
      options.summary = summary;
    }
    return options;
  }

  modelSupportsReasoning(modelName) {
    if (!modelName) {
      return false;
    }
    const normalized = modelName.toLowerCase();
    return normalized.startsWith('o') || normalized.includes('reasoning');
  }

  modelSupportsJsonSchema(modelName) {
    if (!modelName) {
      return false;
    }
    const normalized = modelName.toLowerCase();
    if (normalized.includes('grok')) {
      return false;
    }
    return true;
  }

  isDebugLogLevel() {
    const level = (process.env.LOG_LEVEL || '').trim().toLowerCase();
    return level === 'debug';
  }

  logDebugPayload(label, payload) {
    if (!this.debugLoggingEnabled) {
      return;
    }
    this.logger.debug(label, this.prepareDebugPayload(payload));
  }

  prepareDebugPayload(payload) {
    if (payload === undefined) {
      return undefined;
    }
    if (payload === null) {
      return null;
    }
    if (typeof payload === 'string') {
      return payload;
    }
    if (typeof payload === 'number' || typeof payload === 'boolean') {
      return payload;
    }
    try {
      return JSON.parse(JSON.stringify(payload));
    } catch (error) {
      return payload;
    }
  }
}
