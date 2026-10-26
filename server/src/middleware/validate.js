import { ValidationError } from '../utils/errors.js';

// validate(schema, 'body' | 'query' | 'params') — replaces the input with the parsed value.
export function validate(schema, source = 'body') {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
      return next(new ValidationError('Invalid request', details));
    }
    if (source === 'query') {
      // Express 5 makes req.query a getter; shadow it with the parsed value.
      Object.defineProperty(req, 'query', { value: result.data, writable: true, configurable: true });
    } else {
      req[source] = result.data;
    }
    return next();
  };
}
