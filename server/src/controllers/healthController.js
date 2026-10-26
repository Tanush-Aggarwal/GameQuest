import { getHealth } from '../services/healthService.js';

export function health(_req, res) {
  const result = getHealth();
  res.status(result.status === 'ok' ? 200 : 503).json(result);
}
