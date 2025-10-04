import { logNotifier } from './LogNotifier.js';

const LEVELS = ['debug', 'info', 'warn', 'error'];

const resolveLevel = () => {
  const envLevel = (process.env.LOG_LEVEL || 'info').toLowerCase().trim();
  return LEVELS.includes(envLevel) ? envLevel : 'info';
};

const activeLevel = resolveLevel();

const shouldLog = (level) => LEVELS.indexOf(level) >= LEVELS.indexOf(activeLevel);

const formatArgs = (scope, args) => [
  `[${levelToTag(scope.level)}] [${scope.module}]`,
  ...args
];

const notifyListeners = ({ module, level, args }) => {
  if (!['warn', 'error'].includes(level)) {
    return;
  }
  const timestamp = new Date().toISOString();
  logNotifier.notify({
    module,
    level,
    timestamp,
    messages: args.map(stringifyArg)
  });
};

const stringifyArg = (value) => {
  if (value instanceof Error) {
    return value.stack || value.message || 'Error senza dettagli';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch (error) {
    return '[object]';
  }
};

const levelToTag = (level) => {
  switch (level) {
    case 'debug':
      return 'DBG';
    case 'info':
      return 'INF';
    case 'warn':
      return 'WRN';
    case 'error':
      return 'ERR';
    default:
      return level.toUpperCase();
  }
};

const buildLogger = (module) => ({
  debug: (...args) => {
    if (shouldLog('debug')) {
      console.debug(...formatArgs({ module, level: 'debug' }, args));
    }
  },
  info: (...args) => {
    if (shouldLog('info')) {
      console.info(...formatArgs({ module, level: 'info' }, args));
    }
  },
  warn: (...args) => {
    notifyListeners({ module, level: 'warn', args });
    if (shouldLog('warn')) {
      console.warn(...formatArgs({ module, level: 'warn' }, args));
    }
  },
  error: (...args) => {
    notifyListeners({ module, level: 'error', args });
    if (shouldLog('error')) {
      console.error(...formatArgs({ module, level: 'error' }, args));
    }
  }
});

export const Logger = {
  for(moduleName) {
    return buildLogger(moduleName || 'app');
  }
};
