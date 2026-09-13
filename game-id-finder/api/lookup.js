// Extracts a place ID from a pasted Roblox game URL, e.g.
// https://www.roblox.com/games/920587237/Adopt-Me  -> 920587237
function extractPlaceId(input) {
  const trimmed = input.trim();

  // Plain number typed in directly
  if (/^\d+$/.test(trimmed)) return trimmed;

  const match = trimmed.match(/roblox\.com\/games\/(\d+)/i);
  if (match) return match[1];

  return null;
}

export default async function handler(req, res) {
  const { name } = req.query;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Paste a Roblox game link or ID.' });
  }

  const placeIdInput = extractPlaceId(name);

  if (!placeIdInput) {
    return res.status(400).json({
      error: "That doesn't look like a Roblox game link. Paste the full URL from the game's page (e.g. roblox.com/games/920587237/Adopt-Me), or just its numeric place ID."
    });
  }

  try {
    // Step 1: place ID -> universe ID (confirmed-stable, no-auth Roblox endpoint)
    const universeRes = await fetch(`https://apis.roblox.com/universes/v1/places/${placeIdInput}/universe`);
    if (!universeRes.ok) {
      return res.status(404).json({ error: 'No game found for that link or ID.' });
    }
    const universeData = await universeRes.json();
    const universeId = universeData.universeId;

    if (!universeId) {
      return res.status(404).json({ error: 'No game found for that link or ID.' });
    }

    // Step 2: universe ID -> full game details (name, playing count, root place id)
    let gameName, playing, rootPlaceId;
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

    // Step 3: icon thumbnail
    let icon = '';
    const thumbRes = await fetch(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${universeId}&size=150x150&format=Png`);
    if (thumbRes.ok) {
      const thumbData = await thumbRes.json();
      icon = thumbData?.data?.[0]?.imageUrl || '';
    }

    return res.status(200).json({
      name: gameName || 'Unknown game',
      universeId,
      placeId: rootPlaceId || placeIdInput,
      playing: playing || 0,
      icon
    });

  } catch (err) {
    return res.status(500).json({ error: 'Lookup failed. Try again in a moment.' });
  }
}
