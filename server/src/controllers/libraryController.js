// Identity always comes from req.auth (the signed cookie), never from the body.
export function createLibraryController({ libraryService }) {
  return {
    async list(req, res) {
      res.json(await libraryService.list(req.auth.userId, req.query));
    },

    async add(req, res) {
      res.status(201).json({ entry: await libraryService.add(req.auth.userId, req.body) });
    },

    async changeStatus(req, res) {
      res.json({ entry: await libraryService.changeStatus(req.auth.userId, req.params.id, req.body.status) });
    },

    async setVisibility(req, res) {
      res.json({ entry: await libraryService.setHiddenFromFriends(req.auth.userId, req.params.id, req.body.hiddenFromFriends) });
    },

    async remove(req, res) {
      await libraryService.remove(req.auth.userId, req.params.id);
      res.status(204).end();
    },

    async history(req, res) {
      res.json({ history: await libraryService.history(req.auth.userId, req.params.id) });
    },
  };
}
