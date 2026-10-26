import { Compass, Home, Library, User, Users } from 'lucide-react';

export const NAV_ITEMS = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/library', label: 'Library', icon: Library },
  { to: '/explore', label: 'Explore', icon: Compass },
  { to: '/friends', label: 'Friends', icon: Users },
  { to: '/profile', label: 'Profile', icon: User },
];
