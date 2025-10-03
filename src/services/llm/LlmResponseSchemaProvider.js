export class LlmResponseSchemaProvider {
  constructor(schemaName = 'chatbot_response') {
    this.schemaName = schemaName;
  }

  buildJsonSchemaFormat() {
    return {
      type: 'json_schema',
      name: this.schemaName,
      strict: true,
      schema: {
        type: 'object',
        properties: {
          answer: { type: 'string' },
          confidence: { type: 'number' },
          needs_escalation: { type: 'boolean' },
          escalation_reason: {
            type: 'string',
            enum: ['missing_info', 'urgent', 'none']
          },
          snippets_used: {
            type: 'array',
            items: { type: 'string' }
          }
        },
        required: [
          'answer',
          'confidence',
          'needs_escalation',
          'escalation_reason',
          'snippets_used'
        ],
        additionalProperties: false
      }
    };
  }
}
