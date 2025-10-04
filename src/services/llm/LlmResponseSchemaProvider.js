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
            enum: ['missing_info', 'non_urgent', 'urgent', 'none']
          },
          interaction_type: {
            type: 'string',
            enum: ['info_support', 'non_urgent_report', 'urgent_emergency']
          },
          should_collect_contact: { type: 'boolean' },
          manager_message: { type: 'string' },
          language_code: {
            type: 'string',
            pattern: '^[a-z]{2}(-[a-z]{2})?$'
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
          'interaction_type',
          'should_collect_contact',
          'manager_message',
          'language_code',
          'snippets_used'
        ],
        additionalProperties: false
      }
    };
  }
}
