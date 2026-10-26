import { Bookmark, CheckCircle2, Gamepad2, Hourglass, XCircle } from 'lucide-react';

// Status is never colour alone: every status has an icon and a label.
export const STATUS_META = {
  wishlist: { label: 'Wishlist', icon: Bookmark, text: 'text-status-wishlist' },
  backlog: { label: 'Backlog', icon: Hourglass, text: 'text-status-backlog' },
  playing: { label: 'Playing', icon: Gamepad2, text: 'text-status-playing' },
  completed: { label: 'Completed', icon: CheckCircle2, text: 'text-status-completed' },
  dropped: { label: 'Dropped', icon: XCircle, text: 'text-status-dropped' },
};
