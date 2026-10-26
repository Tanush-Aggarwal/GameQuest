import { Calendar, Compass, FolderKanban, Home, Library, User, Users } from 'lucide-react';

export const MOBILE_NAV_ITEMS = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/library', label: 'Library', icon: Library },
  { to: '/explore', label: 'Explore', icon: Compass },
  { to: '/friends', label: 'Friends', icon: Users },
  { to: '/profile', label: 'Profile', icon: User },
];

export const DESKTOP_NAV_ITEMS = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/library', label: 'Library', icon: Library },
  { to: '/collections', label: 'Collections', icon: FolderKanban },
  { to: '/explore', label: 'Explore', icon: Compass },
  { to: '/sessions', label: 'Sessions', icon: Calendar },
  { to: '/friends', label: 'Friends', icon: Users },
  { to: '/profile', label: 'Profile', icon: User },
];

export const NAV_ITEMS = MOBILE_NAV_ITEMS;
