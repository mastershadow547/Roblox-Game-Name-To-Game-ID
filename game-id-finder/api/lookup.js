// Very small in-memory cache so we don't refetch Rolimons' full game list
// (a few thousand entries) on every request within the same warm serverless
// instance. Cold starts will refetch, which is fine — the file is small.
let cachedGameList = null;
let cachedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function normalize(str) {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function getRolimonsGameList() {
  const now = Date.now();
  if (cachedGameList && now - cachedAt < CACHE_TTL_MS) {
    return cachedGameList;
  }

  const res = await fetch('https://api.rolimons.com/games/v1/gamelist', {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Referer': 'https://www.rolimons.com/'
    }
  });

  if (!res.ok) return null;

  const data = await res.json();
  if (!data.games) return null;

  cachedGameList = data.games; // { placeId: [name, playerCount, iconUrl] }
  cachedAt = now;
  return cachedGameList;
}

function findBestRolimonsMatch(games, query) {
  const target = normalize(query);
  let exact = null;
  let partial = null;

  for (const [placeId, [name, playerCount, iconUrl]] of Object.entries(games)) {
    const normName = normalize(name);
    if (normName === target) {
      exact = { placeId, name, playerCount, iconUrl };
      break;
    }
    if (!partial && normName.includes(target)) {
      partial = { placeId, name, playerCount, iconUrl };
    }
  }

  return exact || partial;
}

async function searchRobloxOmniSearch(query) {
  const sessionId = 'gid-' + Math.random().toString(36).slice(2);
  const url = `https://apis.roblox.com/search-api/omni-search?searchQuery=${encodeURIComponent(query)}&sessionId=${sessionId}&pageType=all`;

  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) return null;

  const data = await res.json();
  const results = data?.searchResults || [];

  // Results can be a flat list of games, or (depending on pageType) grouped
  // objects with a nested "contents" array. Handle both shapes.
  const flat = results.flatMap(r => r.contents ? r.contents : [r]);
  const match = flat.find(r => r.universeId || r.contentType === 'Game');

  if (!match) return null;

  return {
    universeId: match.universeId,
    placeId: match.rootPlaceId || match.placeId,
    name: match.name,
    playerCount: match.playerCount
  };
}

function extractPlaceIdFromLink(input) {
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/roblox\.com\/games\/(\d+)/i);
  return match ? match[1] : null;
}

async function getFullDetails(placeId) {
  let universeId, gameName, playing, rootPlaceId, icon = '';

  const universeRes = await fetch(`https://apis.roblox.com/universes/v1/places/${placeId}/universe`);
  if (universeRes.ok) {
    const universeData = await universeRes.json();
    universeId = universeData.universeId;
  }

  if (!universeId) return null;

  const detailsRes = await fetch(`https://games.roblox.com/v1/games?universeIds=${universeId}`);
  if (detailsRes.ok) {
    const detailsData = await detailsRes.json();
    const d = detailsData?.data?.[0];
    if (d) {
      gameName = d.name;
      playing = d.playing;
      rootPlaceId = d.rootPlaceId;
    }
  }

  const thumbRes = await fetch(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${universeId}&size=150x150&format=Png`);
  if (thumbRes.ok) {
    const thumbData = await thumbRes.json();
    icon = thumbData?.data?.[0]?.imageUrl || '';
  }

  return {
    name: gameName,
    universeId,
    placeId: rootPlaceId || placeId,
    playing: playing || 0,
    icon
  };
}

export default async function handler(req, res) {
  const { name } = req.query;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Enter a game name, or paste a Roblox game link.' });
  }

  const query = name.trim();

  try {
    // If they pasted a link or raw ID, skip straight to the reliable path.
    const directPlaceId = extractPlaceIdFromLink(query);
    if (directPlaceId) {
      const details = await getFullDetails(directPlaceId);
      if (details) return res.status(200).json(details);
      return res.status(404).json({ error: 'No game found for that link or ID.' });
    }

    // 1) Try Rolimons' game list first — fast, reliable, no name-matching guesswork needed.
    const games = await getRolimonsGameList();
    if (games) {
      const match = findBestRolimonsMatch(games, query);
      if (match) {
        const details = await getFullDetails(match.placeId);
        if (details) {
          return res.status(200).json({
            ...details,
            name: details.name || match.name,
            playing: details.playing || match.playerCount,
            icon: details.icon || match.iconUrl
          });
        }
        // Fall back to Rolimons' own data if the Roblox detail calls hiccup.
        return res.status(200).json({
          name: match.name,
          universeId: null,
          placeId: match.placeId,
          playing: match.playerCount,
          icon: match.iconUrl
        });
      }
    }

    // 2) Fall back to Roblox's own search (covers newer/smaller games Rolimons hasn't indexed).
    const omniMatch = await searchRobloxOmniSearch(query);
    if (omniMatch && omniMatch.placeId) {
      const details = await getFullDetails(omniMatch.placeId);
      if (details) return res.status(200).json(details);
    }

    // 3) Nothing found by name — ask for a link instead of guessing wrong.
    return res.status(404).json({
      error: `Couldn't find "${query}" by name. Try pasting the game's Roblox link instead (e.g. roblox.com/games/920587237/Adopt-Me) for an exact match.`
    });

  } catch (err) {
    return res.status(500).json({ error: 'Lookup failed. Try again in a moment.' });
  }
}
