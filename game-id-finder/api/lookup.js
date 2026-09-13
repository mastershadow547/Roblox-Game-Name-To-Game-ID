export default async function handler(req, res) {
  const { name } = req.query;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Enter a game name.' });
  }

  try {
    let universeId, placeId, gameName, playing;

    // Primary: Roblox's own site-search endpoint (what roblox.com/search uses internally).
    // Note: this is not an officially documented/supported API and could change without notice.
    const searchUrl = `https://apis.roblox.com/search-api/omni-search?searchQuery=${encodeURIComponent(name)}&pageType=games`;
    const searchRes = await fetch(searchUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    if (searchRes.ok) {
      const searchData = await searchRes.json();
      const groups = searchData?.searchResults || [];
      const allContents = groups.flatMap(g => g.contents || []);
      const match = allContents.find(g => g.universeId || g.contentType === 'Game');

      if (match) {
        universeId = match.universeId;
        placeId = match.rootPlaceId || match.placeId;
        gameName = match.name;
        playing = match.playerCount;
      }
    }

    if (!universeId) {
      return res.status(404).json({
        error: 'No game found with that name. Try the exact title as shown on Roblox.'
      });
    }

    // Fill in / confirm details from the stable v1/games endpoint (still live).
    const detailsRes = await fetch(`https://games.roblox.com/v1/games?universeIds=${universeId}`);
    if (detailsRes.ok) {
      const detailsData = await detailsRes.json();
      const d = detailsData?.data?.[0];
      if (d) {
        gameName = d.name || gameName;
        playing = d.playing ?? playing;
        placeId = d.rootPlaceId || placeId;
      }
    }

    // Icon thumbnail (still live).
    let icon = '';
    const thumbRes = await fetch(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${universeId}&size=150x150&format=Png`);
    if (thumbRes.ok) {
      const thumbData = await thumbRes.json();
      icon = thumbData?.data?.[0]?.imageUrl || '';
    }

    return res.status(200).json({
      name: gameName || name,
      universeId,
      placeId: placeId || 'unavailable',
      playing: playing || 0,
      icon
    });

  } catch (err) {
    return res.status(500).json({ error: 'Lookup failed. Roblox may be rate-limiting — try again shortly.' });
  }
}
