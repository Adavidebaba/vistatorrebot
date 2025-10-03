import OpenAI from 'openai';

import { LlmPromptComposer } from './llm/LlmPromptComposer.js';
import { LlmResponseParser } from './llm/LlmResponseParser.js';
import { LlmResponseSchemaProvider } from './llm/LlmResponseSchemaProvider.js';
import { LlmSystemPromptProvider } from './llm/LlmSystemPromptProvider.js';

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
    this.systemPromptProvider =
      systemPromptProvider ||
      new LlmSystemPromptProvider({ environmentConfig: this.environmentConfig });
    const systemPrompt = this.systemPromptProvider.getPrompt();
    this.promptComposer =
      promptComposer || new LlmPromptComposer({ systemPrompt });
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

  async generateResponse({ userMessage, contextFragments = [] }) {
    const inputMessages = this.promptComposer.composeMessages({
      contextFragments,
      userMessage
    });

    const reasoningOptions = this.buildReasoningOptions();
    const maxOutputTokens = this.environmentConfig.llmMaxOutputTokens;

    const candidates = this.modelProvider.getModelCandidates();
    if (!candidates || candidates.length === 0) {
      throw new Error('Nessun modello LLM disponibile.');
    }

    let lastError = null;

    for (const candidate of candidates) {
      try {
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
        // eslint-disable-next-line no-console
        console.warn(
          `Model ${candidate.provider}:${candidate.model} failed: ${error?.message || 'unknown error'}`
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

    const response = await this.openAiClient.responses.create(payload);
    this.logUsage(response.usage);
    return this.responseParser.parse(response);
  }

  async generateWithXai({ model, messages, maxOutputTokens }) {
    if (!this.environmentConfig.xaiApiKey) {
      throw new Error('XAI_API_KEY is not configured');
    }

    const body = {
      model,
      messages,
      temperature: 0.2
    };
    if (typeof maxOutputTokens === 'number') {
      body.max_tokens = maxOutputTokens;
    }

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
      throw new Error(`xAI request failed: ${response.status} ${errorText}`);
    }

    const payload = await response.json();
    this.logUsage(payload.usage);

    const rawContent = payload?.choices?.[0]?.message?.content;
    if (!rawContent) {
      throw new Error('xAI response missing content');
    }

    try {
      const parsed = JSON.parse(rawContent);
      return this.responseParser.withDefaultFields(parsed);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('xAI returned non-JSON payload, using raw text as answer');
      return this.responseParser.withDefaultFields({
        answer: rawContent,
        confidence: 0.5,
        needs_escalation: false,
        escalation_reason: 'none',
        snippets_used: []
      });
    }
  }

  logUsage(usage = {}) {
    const promptTokens = usage.input_tokens ?? usage.prompt_tokens ?? 0;
    const completionTokens = usage.output_tokens ?? usage.completion_tokens ?? 0;
    const totalTokens = usage.total_tokens ?? promptTokens + completionTokens;
    // eslint-disable-next-line no-console
    console.log(
      `LLM usage → prompt: ${promptTokens} tokens, completion: ${completionTokens} tokens, total: ${totalTokens} tokens`
    );
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
}
