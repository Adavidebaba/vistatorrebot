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
    this.client =
      openAiClient || new OpenAI({ apiKey: environmentConfig.llmApiKey });
    this.modelProvider = modelProvider || {
      getModelCandidates: () => [this.environmentConfig.llmModel]
    };
  }

  async generateResponse({ userMessage, contextFragments = [] }) {
    const inputMessages = this.promptComposer.composeMessages({
      contextFragments,
      userMessage
    });

    const reasoningOptions = this.buildReasoningOptions();
    const maxOutputTokens = this.environmentConfig.llmMaxOutputTokens;

    const models = this.modelProvider.getModelCandidates();
    if (!models || models.length === 0) {
      throw new Error('Nessun modello LLM disponibile.');
    }

    let lastError = null;
    for (const model of models) {
      try {
        const payload = {
          model,
          input: inputMessages
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

        const response = await this.client.responses.create(payload);
        this.logUsage(response);
        return this.responseParser.parse(response);
      } catch (error) {
        lastError = error;
        // eslint-disable-next-line no-console
        console.warn(`Model ${model} failed: ${error?.message || 'unknown error'}`);
      }
    }

    if (lastError) {
      throw lastError;
    }

    throw new Error('Nessun modello ha prodotto una risposta valida.');
  }

  logUsage(response) {
    const usage = response.usage || {};
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
