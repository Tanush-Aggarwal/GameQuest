export function createProgressController({ progressService }) {
  // PATCH /library/:id/progress
  async function setProgress(req, res) {
    const entry = await progressService.setProgress(req.auth.userId, req.params.id, req.body.manualProgress);
    res.json({ manualProgress: entry.manualProgress });
  }

  // POST /library/:id/playlogs
  async function logSession(req, res) {
    const log = await progressService.logSession(req.auth.userId, req.params.id, req.body);
    res.status(201).json({ log });
  }

  // GET /library/:id/playlogs
  async function listLogs(req, res) {
    const { limit, cursor } = req.query;
    const result = await progressService.listLogs(req.auth.userId, req.params.id, {
      limit: limit ? Number(limit) : 20,
      cursor,
    });
    res.json(result);
  }

  // DELETE /library/:id/playlogs/:logId
  async function deleteLog(req, res) {
    await progressService.deleteLog(req.auth.userId, req.params.id, req.params.logId);
    res.status(204).end();
  }

  // POST /library/:id/journal
  async function addJournal(req, res) {
    const note = await progressService.addJournalEntry(req.auth.userId, req.params.id, req.body);
    res.status(201).json({ note });
  }

  // GET /library/:id/journal
  async function listJournal(req, res) {
    const { limit, cursor } = req.query;
    const result = await progressService.listJournalEntries(req.auth.userId, req.params.id, {
      limit: limit ? Number(limit) : 20,
      cursor,
    });
    res.json(result);
  }

  // DELETE /library/:id/journal/:noteId
  async function deleteJournal(req, res) {
    await progressService.deleteJournalEntry(req.auth.userId, req.params.id, req.params.noteId);
    res.status(204).end();
  }

  return { setProgress, logSession, listLogs, deleteLog, addJournal, listJournal, deleteJournal };
}
