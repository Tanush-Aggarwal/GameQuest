import { getHealth } from '../services/healthService.js';

export function health(req, res) {
  // Says whether email sending is set up (never the URL or secret), so a deploy can be checked from a browser.
  const result = getHealth({ emailConfigured: req.app?.locals?.emailConfigured });
  res.status(result.status === 'ok' ? 200 : 503).json(result);
}
