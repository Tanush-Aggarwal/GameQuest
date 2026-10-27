import { z } from 'zod';

// GET /games/featured?limit=5
export const featuredQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(12).default(5) });

// DELETE /account: the user types their username to confirm.
export const deleteAccountSchema = z.object({ confirmUsername: z.string().trim().min(1).max(24) });

// Plain-language Terms and Privacy Policy, rendered by the client's /terms and /privacy pages. Kept here so the
// text describes exactly what the server stores and calls (update it when that changes).
export const LEGAL_UPDATED = '2026-10-27';

export const TERMS = [
  {
    heading: 'What GameQuest is',
    body: [
      'GameQuest is a student project that lets you track the games you own and play, write reviews, organise collections and plan game sessions with friends.',
      'It is provided as is, without any guarantee that it will always be available or free of mistakes.',
    ],
  },
  {
    heading: 'Your account',
    body: [
      'You need an account to use GameQuest. Keep your password to yourself; you are responsible for what happens under your account.',
      'You can delete your account at any time from your profile settings. Deleting it removes your data as described in the Privacy Policy.',
    ],
  },
  {
    heading: 'What you post',
    body: [
      'Reviews, collection names, session titles and your bio are yours. By posting them you let GameQuest show them to the people your privacy settings allow.',
      'Do not post anything illegal, hateful, or that harasses other people, and do not try to break or overload the service. Accounts that do may be removed.',
    ],
  },
  {
    heading: 'Game data and trademarks',
    body: [
      'Game names, artwork, trailers and descriptions come from IGDB, Steam and YouTube and belong to their owners. GameQuest is not affiliated with them.',
      'Playtime and achievements imported from Steam are shown as Steam reports them.',
    ],
  },
  {
    heading: 'Changes',
    body: ['If these terms change, the date at the top of this page changes too. Continuing to use GameQuest after that means you accept the new version.'],
  },
];

export const PRIVACY = [
  {
    heading: 'What we store',
    body: [
      'Your username, email address and a bcrypt hash of your password. Your password itself is never stored.',
      'Everything you add: your library (status, progress, play sessions, journal notes), reviews, collections, friends and blocks, game sessions and RSVPs, recommendations, and your profile (avatar link, bio, favourite games, privacy setting).',
      'If you link Steam: your SteamID64, Steam display name and avatar, and the owned games, playtime and achievements Steam makes public for your profile.',
    ],
  },
  {
    heading: 'Cookies',
    body: [
      'GameQuest uses two cookies, only to keep you signed in: a short-lived access cookie and a refresh cookie. Both are HTTP-only, so page scripts cannot read them.',
      'There are no advertising or tracking cookies.',
    ],
  },
  {
    heading: 'Who can see your data',
    body: [
      'Your profile, library and activity are visible according to your privacy setting (public, friends only, or private) and the "hide from friends" option on each game. Blocked users never see your profile.',
      'Reviews are public so other players can read them.',
      'Your email address is never shown to other users.',
    ],
  },
  {
    heading: 'Services we call',
    body: [
      'IGDB (through Twitch) for game details and artwork, the Steam Web API and Steam store for your Steam library and system requirements, and YouTube for trailers, embedded through youtube-nocookie.com and only loaded when you press play.',
      'These services receive game ids or your SteamID64, never your password or email. Our API keys stay on the server.',
    ],
  },
  {
    heading: 'Deleting your data',
    body: [
      'Delete your account from your profile settings by typing your username to confirm. This removes your account, library, play logs, journal, reviews (game ratings are recalculated), collections, friendships, blocks, activity, the sessions you host, your RSVPs, recommendations and sign-in sessions.',
      'Unlinking Steam removes your Steam details from your account; games already imported stay in your library until you remove them.',
    ],
  },
];
