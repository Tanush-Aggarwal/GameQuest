import { lazy } from 'react';
import { AppLayout } from '@/components/layout/AppLayout.jsx';
import { ProtectedRoute, PublicOnlyRoute } from './routeGuards.jsx';

// Route-level code splitting: each page is its own chunk.
const Home = lazy(() => import('@/pages/Home.jsx'));
const Library = lazy(() => import('@/pages/Library.jsx'));
const Explore = lazy(() => import('@/pages/Explore.jsx'));
const Game = lazy(() => import('@/pages/Game.jsx'));
const Friends = lazy(() => import('@/pages/Friends.jsx'));
const Profile = lazy(() => import('@/pages/Profile.jsx'));
const Login = lazy(() => import('@/pages/Login.jsx'));
const Register = lazy(() => import('@/pages/Register.jsx'));
const LibraryEntry = lazy(() => import('@/pages/LibraryEntry.jsx'));
const Collections = lazy(() => import('@/pages/Collections.jsx'));
const Collection = lazy(() => import('@/pages/Collection.jsx'));
const UserProfile = lazy(() => import('@/pages/UserProfile.jsx'));
const Sessions = lazy(() => import('@/pages/Sessions.jsx'));
const SessionNew = lazy(() => import('@/pages/SessionNew.jsx'));
const Session = lazy(() => import('@/pages/Session.jsx'));
const Legal = lazy(() => import('@/pages/Legal.jsx'));
const NotFound = lazy(() => import('@/pages/NotFound.jsx'));

export const routes = [
  { path: '/terms', element: <Legal type="terms" /> },
  { path: '/privacy', element: <Legal type="privacy" /> },
  {
    element: <PublicOnlyRoute />,
    children: [
      { path: '/login', element: <Login /> },
      { path: '/register', element: <Register /> },
    ],
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/', element: <Home /> },
          { path: '/library', element: <Library /> },
          { path: '/library/:id', element: <LibraryEntry /> },
          { path: '/collections', element: <Collections /> },
          { path: '/collections/:id', element: <Collection /> },
          { path: '/explore', element: <Explore /> },
          { path: '/games/:slug', element: <Game /> },
          { path: '/friends', element: <Friends /> },
          { path: '/profile', element: <Profile /> },
          { path: '/u/:username', element: <UserProfile /> },
          { path: '/sessions', element: <Sessions /> },
          { path: '/sessions/new', element: <SessionNew /> },
          { path: '/sessions/:id', element: <Session /> },
        ],
      },
    ],
  },
  { path: '*', element: <NotFound /> },
];
