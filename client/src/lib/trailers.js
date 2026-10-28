// Trailer entries come from IGDB/YouTube ({ videoId: 11-char YouTube id }) or Steam
// ({ source: 'steam', videoId: 'steam-<id>', poster, mp4 | webm | hls }).
const YOUTUBE_ID = /^[\w-]{11}$/;

export const isSteamTrailer = (t) => t?.source === 'steam' && Boolean(t.mp4 || t.webm || t.hls);
export const isPlayableTrailer = (t) => isSteamTrailer(t) || YOUTUBE_ID.test(t?.videoId ?? '');

export function trailerThumb(t, size = 'hq') {
  if (isSteamTrailer(t)) return t.poster ?? null;
  return `https://i.ytimg.com/vi/${t.videoId}/${size}default.jpg`;
}
