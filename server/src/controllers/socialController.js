// Identity always comes from req.auth (the signed cookie). Other people are addressed by
// username or id in the URL, never by anything in the body that could stand in for the caller.
export function createSocialController({ friendService, profileService, activityService }) {
  return {
    // friends
    async listFriends(req, res) {
      res.json({ items: await friendService.listFriends(req.auth.userId) });
    },
    async listRequests(req, res) {
      res.json(await friendService.listRequests(req.auth.userId));
    },
    async sendRequest(req, res) {
      res.status(201).json(await friendService.sendRequest(req.auth.userId, req.body));
    },
    async acceptRequest(req, res) {
      await friendService.accept(req.auth.userId, req.params.id);
      res.status(204).end();
    },
    async declineRequest(req, res) {
      await friendService.decline(req.auth.userId, req.params.id);
      res.status(204).end();
    },
    async cancelRequest(req, res) {
      await friendService.cancel(req.auth.userId, req.params.id);
      res.status(204).end();
    },
    async unfriend(req, res) {
      await friendService.unfriend(req.auth.userId, req.params.userId);
      res.status(204).end();
    },

    // blocks
    async listBlocked(req, res) {
      res.json({ items: await friendService.listBlocked(req.auth.userId) });
    },
    async block(req, res) {
      await friendService.block(req.auth.userId, req.params.userId);
      res.status(204).end();
    },
    async unblock(req, res) {
      await friendService.unblock(req.auth.userId, req.params.userId);
      res.status(204).end();
    },

    // users and profiles
    async discoverUsers(req, res) {
      res.json({ items: await friendService.discoverUsers(req.auth.userId) });
    },

    async searchUsers(req, res) {
      res.json({ items: await friendService.searchUsers(req.auth.userId, req.query) });
    },
    async getProfile(req, res) {
      res.json(await profileService.getProfile(req.auth.userId, req.params.username));
    },
    async getProfileActivity(req, res) {
      res.json(await profileService.getActivity(req.auth.userId, req.params.username, req.query));
    },
    async getProfileCollections(req, res) {
      res.json(await profileService.getCollections(req.auth.userId, req.params.username));
    },
    async updateProfile(req, res) {
      res.json(await profileService.updateProfile(req.auth.userId, req.body));
    },
    async setPrivacy(req, res) {
      res.json(await profileService.setPrivacy(req.auth.userId, req.body.privacy));
    },

    // feed
    async feed(req, res) {
      res.json(await activityService.feed(req.auth.userId, req.query));
    },
  };
}
