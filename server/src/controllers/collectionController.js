// Identity always comes from req.auth (the signed cookie), never from the body or params.
export function createCollectionController({ collectionService }) {
  return {
    async list(req, res) {
      res.json(await collectionService.listMine(req.auth.userId, req.query));
    },

    async create(req, res) {
      res.status(201).json({ collection: await collectionService.create(req.auth.userId, req.body) });
    },

    async get(req, res) {
      res.json(await collectionService.get(req.auth.userId, req.params.id, req.query));
    },

    async update(req, res) {
      res.json({ collection: await collectionService.update(req.auth.userId, req.params.id, req.body) });
    },

    async remove(req, res) {
      await collectionService.remove(req.auth.userId, req.params.id);
      res.status(204).end();
    },

    async addItem(req, res) {
      res.status(201).json({ item: await collectionService.addItem(req.auth.userId, req.params.id, req.body) });
    },

    async removeItem(req, res) {
      await collectionService.removeItem(req.auth.userId, req.params.id, req.params.itemId);
      res.status(204).end();
    },

    async moveItem(req, res) {
      res.json({ item: await collectionService.moveItem(req.auth.userId, req.params.id, req.params.itemId, req.body.afterItemId) });
    },

    async preview(req, res) {
      res.json(await collectionService.preview(req.auth.userId, req.body));
    },
  };
}
