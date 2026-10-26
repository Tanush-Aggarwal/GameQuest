// Identity always comes from req.auth (the signed cookie); the host is never read from the body.
export function createSessionController({ sessionService }) {
  return {
    async list(req, res) {
      res.json(await sessionService.listUpcoming(req.auth.userId, req.query));
    },

    async create(req, res) {
      res.status(201).json({ session: await sessionService.create(req.auth.userId, req.body) });
    },

    async get(req, res) {
      res.json({ session: await sessionService.get(req.auth.userId, req.params.id) });
    },

    async update(req, res) {
      res.json({ session: await sessionService.update(req.auth.userId, req.params.id, req.body) });
    },

    async cancel(req, res) {
      res.json({ session: await sessionService.cancel(req.auth.userId, req.params.id) });
    },

    async rsvp(req, res) {
      res.json({ session: await sessionService.rsvp(req.auth.userId, req.params.id, req.body.response) });
    },

    async ics(req, res) {
      const { filename, body } = await sessionService.ics(req.auth.userId, req.params.id);
      res.set({
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      });
      res.send(body);
    },
  };
}
