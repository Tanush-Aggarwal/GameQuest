export function createInsightsController({ insightsService }) {
  async function dashboard(req, res) {
    const data = await insightsService.getDashboard(req.auth.userId);
    res.json(data);
  }

  async function playNext(req, res) {
    const { limit } = req.query;
    const data = await insightsService.getPlayNext(req.auth.userId, { limit: limit ? Number(limit) : 5 });
    res.json(data);
  }

  async function backlogHealth(req, res) {
    const data = await insightsService.getBacklogHealth(req.auth.userId);
    res.json(data);
  }

  return { dashboard, playNext, backlogHealth };
}
