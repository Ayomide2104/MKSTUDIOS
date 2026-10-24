const URI_PATTERN = /mongodb(?:\+srv)?:\/\/[^\s"'<>]+/gi;
const CREDENTIAL_PARAMETER_PATTERN = /((?:username|user|password|passwd|pwd|token|secret)=)[^&\s,;]+/gi;

function safeMessage(error) {
  const message = typeof error?.message === 'string' ? error.message : String(error || 'Unknown MongoDB error');
  return message
    .replace(URI_PATTERN, 'mongodb://[redacted]')
    .replace(CREDENTIAL_PARAMETER_PATTERN, '$1[redacted]')
    .slice(0, 2000);
}

function collectErrors(root) {
  const queue = [root];
  const visited = new Set();
  const errors = [];

  while (queue.length && errors.length < 8) {
    const error = queue.shift();
    if (!error || typeof error !== 'object' || visited.has(error)) continue;
    visited.add(error);

    const hasErrorDetails = typeof error.message === 'string' || typeof error.name === 'string' ||
      typeof error.code === 'string' || typeof error.code === 'number';
    if (hasErrorDetails) {
      const details = {
        name: typeof error.name === 'string' ? error.name : 'Error',
        message: safeMessage(error)
      };
      if (typeof error.code === 'string' || typeof error.code === 'number') details.code = error.code;
      if (typeof error.codeName === 'string') details.codeName = error.codeName;
      errors.push(details);
    }

    for (const key of ['cause', 'originalError', 'error', 'reason']) {
      if (error[key] && typeof error[key] === 'object') queue.push(error[key]);
    }

    const serverCollections = [error.servers, error.reason?.servers];
    for (const servers of serverCollections) {
      if (servers instanceof Map) {
        for (const server of servers.values()) {
          if (server?.error && typeof server.error === 'object') queue.push(server.error);
        }
      }
    }
    if (error.reason?.cause && typeof error.reason.cause === 'object') queue.push(error.reason.cause);
  }

  if (!errors.length) errors.push({ name: 'Error', message: safeMessage(root) });
  return errors;
}

function classifyMongoError(errors) {
  const detail = errors.map((error) => `${error.name} ${error.code || ''} ${error.codeName || ''} ${error.message}`).join(' ');
  if (/MONGODB_URI|connection string|URI.*(invalid|required)|invalid.*URI/i.test(detail)) return 'configuration-or-URI';
  if (/authentication|auth failed|bad auth|codeName.*(Authentication|Unauthorized)|\b(18|8000)\b/i.test(detail)) return 'authentication-or-database-user';
  if (/querySrv|ENOTFOUND|ESERVFAIL|ENODATA|DNS|SRV/i.test(detail)) return 'DNS-or-SRV-resolution';
  if (/TLS|SSL|certificate|handshake/i.test(detail)) return 'TLS-or-certificate';
  if (/ECONNREFUSED|ECONNRESET|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|network|server selection/i.test(detail)) return 'network-or-server-selection';
  return 'mongodb-connection';
}

function describeMongoError(error) {
  const errors = collectErrors(error);
  return { category: classifyMongoError(errors), errors };
}

module.exports = { describeMongoError, safeMessage };
