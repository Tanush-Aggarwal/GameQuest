import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import * as Tabs from '@radix-ui/react-tabs';
import { Plus, Trash2, BookOpen, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { useAsync } from '@/hooks/useAsync.js';
import { getErrorInfo } from '@/services/api.js';
import { setProgress, logSession, listLogs, deleteLog, addJournalEntry, listJournalEntries, deleteJournalEntry } from '@/services/progressApi.js';

// Full progress panel shown on the library-entry page: slider, play log, journal.
export function ProgressPanel({ entryId, status, initialProgress = 0, onProgressSaved }) {
  return (
    <Tabs.Root defaultValue="progress" className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)]">
      <Tabs.List aria-label="Progress, sessions and journal" className="flex border-b border-[var(--border)]">
        {[['progress', 'Progress'], ['sessions', 'Sessions'], ['journal', 'Journal']].map(([id, label]) => (
          <Tabs.Trigger
            key={id}
            value={id}
            className="min-h-11 flex-1 border-b-2 border-transparent py-2.5 text-sm font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text)] data-[state=active]:border-[var(--accent)] data-[state=active]:text-accent"
          >
            {label}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      <div className="p-4">
        <Tabs.Content value="progress" forceMount className="data-[state=inactive]:hidden focus-visible:outline-none">
          <ProgressTab entryId={entryId} status={status} initialProgress={initialProgress} onSaved={onProgressSaved} />
        </Tabs.Content>
        <Tabs.Content value="sessions" forceMount className="data-[state=inactive]:hidden focus-visible:outline-none">
          <SessionsTab entryId={entryId} status={status} />
        </Tabs.Content>
        <Tabs.Content value="journal" forceMount className="data-[state=inactive]:hidden focus-visible:outline-none">
          <JournalTab entryId={entryId} />
        </Tabs.Content>
      </div>
    </Tabs.Root>
  );
}
// ── Progress tab ─────────────────────────────────────────────────────────────

function ProgressTab({ entryId, status, initialProgress, onSaved }) {
  const [value, setValue] = useState(initialProgress);
  const [prevInitial, setPrevInitial] = useState(initialProgress);
  const [currentInitial, setCurrentInitial] = useState(initialProgress);
  const [saving, setSaving] = useState(false);

  // Adjust state during render if initialProgress changed from outside (e.g. status transition)
  if (initialProgress !== prevInitial) {
    setPrevInitial(initialProgress);
    setValue(initialProgress);
    setCurrentInitial(initialProgress);
  }

  const blocked = status === 'wishlist';
  const completedBlock = status === 'completed';

  async function save() {
    setSaving(true);
    try {
      await setProgress(entryId, value);
      setCurrentInitial(value);
      onSaved?.(value);
      toast.success(`Progress updated to ${value}%`);
    } catch (err) {
      toast.error(getErrorInfo(err).message);
      setValue(currentInitial); // rollback
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {blocked && <p className="text-sm text-[var(--text-muted)]">Move to Backlog or Playing to track progress.</p>}
      {!blocked && (
        <>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={100}
              value={value}
              onChange={(e) => setValue(Number(e.target.value))}
              disabled={completedBlock}
              className="flex-1 accent-[var(--accent)]"
              aria-label="Manual progress"
            />
            <span className="tabular-nums text-sm w-10 text-right font-bold">{value}%</span>
          </div>
          {completedBlock && (
            <p className="text-xs text-[var(--text-muted)]">Move back to Playing to change progress.</p>
          )}
          {!completedBlock && (
            <Button variant="primary" onClick={save} disabled={saving || value === currentInitial}>
              {saving ? 'Saving…' : 'Save progress'}
            </Button>
          )}
        </>
      )}
    </div>
  );
}

// ── Sessions tab ─────────────────────────────────────────────────────────────

function SessionsTab({ entryId, status }) {
  const [showForm, setShowForm] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const reload = useCallback((signal) => listLogs(entryId, {}, { signal }), [entryId, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const { status: ls, data: logsData, retry: logsRetry } = useAsync(reload);

  const blocked = status === 'wishlist';

  async function handleDelete(logId) {
    try {
      await deleteLog(entryId, logId);
      toast.success('Session deleted');
      setRefreshKey((k) => k + 1);
    } catch (err) {
      toast.error(getErrorInfo(err).message);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {blocked ? (
        <p className="text-sm text-[var(--text-muted)]">Move to Backlog or Playing to log sessions.</p>
      ) : (
        <Button variant="secondary" onClick={() => setShowForm((v) => !v)} className="self-start">
          <Plus size={14} /> {showForm ? 'Cancel' : 'Log session'}
        </Button>
      )}

      {showForm && (
        <LogSessionForm entryId={entryId} onDone={() => { setShowForm(false); setRefreshKey((k) => k + 1); }} />
      )}

      {ls === 'loading' && <div role="status" aria-label="Loading sessions" className="h-16 rounded-lg bg-[var(--surface-raised)] motion-safe:animate-pulse" />}
      {ls === 'error' && (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
          <span>Couldn’t load your sessions.</span>
          <Button variant="secondary" onClick={logsRetry}>
            Retry
          </Button>
        </div>
      )}
      {ls === 'success' && (logsData?.items ?? []).length === 0 && (
        <p className="text-sm text-[var(--text-muted)]">No sessions logged yet.</p>
      )}
      {ls === 'success' && (logsData?.items ?? []).map((log) => (
        <div key={log.id} className="flex items-start gap-3 text-sm border-t border-[var(--border)] pt-3">
          <Clock size={14} className="text-[var(--text-muted)] mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-medium tabular-nums">{log.date} · <span className="text-accent">{log.minutes} min</span></p>
            {log.note && <p className="text-[var(--text-muted)] text-xs mt-0.5 italic">&ldquo;{log.note}&rdquo;</p>}
          </div>
          <button onClick={() => handleDelete(log.id)} className="text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors p-1" aria-label="Delete session">
            <Trash2 size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

function LogSessionForm({ entryId, onDone }) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [minutes, setMinutes] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    const mins = Number(minutes);
    if (!mins || mins < 1) return toast.error('Enter at least 1 minute.');
    setSaving(true);
    try {
      await logSession(entryId, { date, minutes: mins, note: note.trim() });
      toast.success(`Logged ${mins} min`);
      onDone();
    } catch (err) {
      toast.error(getErrorInfo(err).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 p-3 rounded-lg bg-[var(--surface-raised)]">
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-xs text-[var(--text-muted)] block mb-1">Date</label>
          <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm focus:outline-none focus:border-[var(--accent)]" />
        </div>
        <div className="w-28">
          <label className="text-xs text-[var(--text-muted)] block mb-1">Minutes</label>
          <input type="number" min="1" max="1440" placeholder="60" value={minutes} onChange={(e) => setMinutes(e.target.value)}
            className="w-full rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm focus:outline-none focus:border-[var(--accent)]" />
        </div>
      </div>
      <input type="text" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500}
        className="rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm focus:outline-none focus:border-[var(--accent)]" />
      <Button type="submit" variant="primary" disabled={saving}>{saving ? 'Saving…' : 'Log session'}</Button>
    </form>
  );
}

// ── Journal tab ───────────────────────────────────────────────────────────────

function JournalTab({ entryId }) {
  const [showForm, setShowForm] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const loadNotes = useCallback((signal) => listJournalEntries(entryId, {}, { signal }), [entryId, refreshKey]); // eslint-disable-line
  const { status, data, retry } = useAsync(loadNotes);

  async function handleDelete(noteId) {
    try {
      await deleteJournalEntry(entryId, noteId);
      toast.success('Note deleted');
      setRefreshKey((k) => k + 1);
    } catch (err) {
      toast.error(getErrorInfo(err).message);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Button variant="secondary" onClick={() => setShowForm((v) => !v)} className="self-start">
        <Plus size={14} /> {showForm ? 'Cancel' : 'Add note'}
      </Button>
      {showForm && (
        <AddNoteForm entryId={entryId} onDone={() => { setShowForm(false); setRefreshKey((k) => k + 1); }} />
      )}
      {status === 'loading' && <div role="status" aria-label="Loading notes" className="h-16 rounded-lg bg-[var(--surface-raised)] motion-safe:animate-pulse" />}
      {status === 'error' && (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
          <span>Couldn’t load your notes.</span>
          <Button variant="secondary" onClick={retry}>
            Retry
          </Button>
        </div>
      )}
      {status === 'success' && !(data?.items?.length) && (
        <p className="text-sm text-[var(--text-muted)]">No notes yet. Jot down where you left off.</p>
      )}
      {status === 'success' && data?.items?.map((note) => (
        <div key={note.id} className="flex gap-3 border-t border-[var(--border)] pt-3">
          <BookOpen size={14} className="text-[var(--text-muted)] flex-shrink-0 mt-1" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-[var(--text-muted)] mb-1">{new Date(note.createdAt).toLocaleDateString()}</p>
            <p className="text-sm whitespace-pre-wrap">{note.body}</p>
          </div>
          <button onClick={() => handleDelete(note.id)} className="text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors p-1 flex-shrink-0" aria-label="Delete note">
            <Trash2 size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

function AddNoteForm({ entryId, onDone }) {
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!body.trim()) return;
    setSaving(true);
    try {
      await addJournalEntry(entryId, body.trim());
      toast.success('Note saved');
      onDone();
    } catch (err) {
      toast.error(getErrorInfo(err).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder="Where did you leave off? What's the story so far?"
        className="w-full rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm resize-y focus:outline-none focus:border-[var(--accent)]"
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-[var(--text-muted)]">{body.length}/2000</span>
        <Button type="submit" variant="primary" disabled={saving || !body.trim()}>{saving ? 'Saving…' : 'Save note'}</Button>
      </div>
    </form>
  );
}
