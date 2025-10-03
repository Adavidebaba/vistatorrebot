export class EscalationPhraseCatalog {
  static managerKeywords() {
    return ['gestore', 'manager', 'proprietario', 'host'];
  }

  static contactKeywords() {
    return ['contatt', 'chiama', 'chiamare', 'telefon', 'avvis', 'avvisa', 'notify'];
  }

  static criticalAccessPhrases() {
    return [
      'non riesco ad entrare',
      "non riesco a entrare",
      'non posso entrare',
      'impossibile entrare',
      'bloccato fuori',
      'cannot enter',
      'locked out',
      'cannot get in'
    ];
  }

  static escalationPrompts() {
    return [
      'posso avvisare il gestore',
      'vuoi che avvisi il gestore',
      'posso contattare il gestore',
      'vuoi che contatti il gestore',
      'posso avvisare qualcuno del personale',
      'posso avvisare il responsabile',
      'should i notify the manager',
      'should i contact the manager',
      'do you want me to notify the manager',
      'can i alert the manager'
    ];
  }

  static affirmativeWords() {
    return ['si', 'ok', 'va bene', 'perfetto', 'confermo', 'yes', 'sure', 'please'];
  }

  static escalationButtonLabels() {
    return {
      it: 'Avvisa il gestore',
      en: 'Notify the manager',
      es: 'Notificar al encargado',
      fr: 'Prévenir le responsable',
      de: 'Den Manager benachrichtigen',
      pt: 'Avisar o responsável'
    };
  }

  static confirmationMessages() {
    return {
      it: 'Sì, per favore avvisa il gestore per me.',
      en: 'Yes, please notify the manager for me.',
      es: 'Sí, por favor notifica al encargado por mí.',
      fr: 'Oui, merci de prévenir le responsable pour moi.',
      de: 'Ja, bitte benachrichtige den Manager für mich.',
      pt: 'Sim, por favor avise o responsável por mim.'
    };
  }
}
