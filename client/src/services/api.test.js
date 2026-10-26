import { getErrorInfo } from './api.js';

describe('getErrorInfo', () => {
  it('passes through the API error shape', () => {
    const err = { response: { status: 409, data: { error: { code: 'CONFLICT', message: 'dup' } } } };
    expect(getErrorInfo(err)).toEqual({ code: 'CONFLICT', message: 'dup' });
  });

  it('describes network failures', () => {
    expect(getErrorInfo({ code: 'ERR_NETWORK' }).code).toBe('NETWORK_ERROR');
  });

  it('falls back to a generic message for unexpected responses', () => {
    expect(getErrorInfo({ response: { status: 502, data: '<html>' } }).code).toBe('UNKNOWN');
  });
});
