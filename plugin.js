/**
 * MovieZone - Plugin adaptado para tu app (Flutter / ContentService)
 * Fuente original: LaMovie (lamovie.org)
 *
 * Métodos implementados:
 *   - getHome()
 *   - getNews()
 *   - getDiscoverFilters()
 *   - getDiscover(opts)
 *   - search(query)
 *   - getMeta(id, opts?)
 *   - getStreams(id, type, season, episode)
 *   - getCatalogs()
 *   - getCatalog(catalogId, opts)
 *   - getAds()
 *
 * Formato de datos compatible con ContentItem, HomeRow, StreamServer, DiscoverPage.
 */

// ─────────────────────────────────────────────────────────────
// Configuración
// ─────────────────────────────────────────────────────────────

const BASE_API = "https://lamovie.org/wp-api/v1";
const UPLOADS_BASE = "https://lamovie.org/wp-content/uploads";
const BRAND_BANNER = "https://raw.githubusercontent.com/sebasmc214-ship-it/kino_plugin_moviezone/main/banner.jpg";

const FEATURED_GENRES = [
  { id: 32, name: "Acción", slug: "accion", genreTag: "accion" },
  { id: 18, name: "Comedia", slug: "comedia", genreTag: "comedia" },
  { id: 17, name: "Drama", slug: "drama", genreTag: "drama" },
  { id: 33, name: "Suspenso", slug: "suspense", genreTag: "suspenso" },
  { id: 96, name: "Terror", slug: "terror", genreTag: "terror" },
  { id: 520, name: "Animación", slug: "animacion", genreTag: "animacion" },
  { id: 131, name: "Ciencia ficción", slug: "ciencia-ficcion", genreTag: "ciencia-ficcion" },
  { id: 130, name: "Aventura", slug: "aventura", genreTag: "aventura" },
  { id: 115, name: "Romance", slug: "romance", genreTag: "romance" },
  { id: 180, name: "Crimen", slug: "crimen", genreTag: "crimen" },
  { id: 398, name: "Familia", slug: "familia", genreTag: "infantil" },
  { id: 229, name: "Fantasía", slug: "fantasia", genreTag: "fantasia" }
];

const GENRE_MAP = {
  17: "Drama", 18: "Comedia", 33: "Suspenso", 32: "Acción", 520: "Animación",
  96: "Terror", 180: "Crimen", 130: "Aventura", 115: "Romance", 398: "Familia",
  97: "Misterio", 131: "Ciencia ficción", 229: "Fantasía", 704: "Ciencia ficción",
  705: "Acción", 164: "Documentales", 165: "Historia", 8: "Música",
  3056: "Bélica", 674: "Western", 703: "Infantil"
};

// ─────────────────────────────────────────────────────────────
// HTTP helper (compatible con runtimes que inyectan kino o fetch)
// ─────────────────────────────────────────────────────────────

async function httpGet(url, opts = {}) {
  const headers = Object.assign({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://lamovie.org/"
  }, opts.headers || {});

  // Preferir kino.fetch si existe (runtime tipo Kino / tu JsAddonRuntime)
  if (typeof kino !== "undefined" && kino && typeof kino.fetch === "function") {
    const res = await kino.fetch(url, { headers: headers });
    if (!res || !res.ok) return null;
    const ct = (res.headers && res.headers.get) ? (res.headers.get("content-type") || "") : "";
    if (ct.includes("json") || url.includes("/wp-api/")) {
      try { return res.json(); } catch (_) { return null; }
    }
    try { return res.text(); } catch (_) { return null; }
  }

  // Fallback a fetch nativo
  if (typeof fetch === "function") {
    try {
      const res = await fetch(url, { headers: headers, method: "GET" });
      if (!res.ok) return null;
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("json") || url.includes("/wp-api/")) {
        return await res.json();
      }
      return await res.text();
    } catch (_) {
      return null;
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────
// Conversores de datos → formato de tu app
// ─────────────────────────────────────────────────────────────

function toContentItem(post) {
  if (!post || typeof post !== "object") return null;

  const postType = post.type || "";
  const isSeries = postType === "tvshows" || postType === "animes" || postType === "novels" || postType === "wwe";
  const isCollection = postType === "collections";
  const type = (isSeries || isCollection) ? "series" : "movie";

  // id estable para tu app
  const id = `${postType || type}-${post._id}`;

  let year;
  if (post.release_date && typeof post.release_date === "string") {
    const y = parseInt(post.release_date.slice(0, 4), 10);
    if (!isNaN(y) && y > 1900 && y < 2100) year = String(y);
  }
  if (!year && post.title) {
    const ym = String(post.title).match(/\((\d{4})\)/);
    if (ym) year = ym[1];
  }

  let poster, backdrop;
  if (Array.isArray(post.images) && post.images.length > 0) {
    const first = post.images[0];
    if (first && typeof first === "object") {
      if (first.poster) poster = first.poster.startsWith("http") ? first.poster : UPLOADS_BASE + first.poster;
      if (first.backdrop) backdrop = first.backdrop.startsWith("http") ? first.backdrop : UPLOADS_BASE + first.backdrop;
    }
  } else if (post.images && typeof post.images === "object") {
    if (post.images.poster) poster = post.images.poster.startsWith("http") ? post.images.poster : UPLOADS_BASE + post.images.poster;
    if (post.images.backdrop) backdrop = post.images.backdrop.startsWith("http") ? post.images.backdrop : UPLOADS_BASE + post.images.backdrop;
  }

  if (!poster && Array.isArray(post.galleries) && post.galleries.length > 0) {
    const g = post.galleries[0];
    if (typeof g === "string") {
      const path = g.trim().split("\n")[0];
      if (path) poster = path.startsWith("http") ? path : "https://image.tmdb.org/t/p/w500" + path.trim();
    }
  }

  let rating;
  if (post.rating) {
    const r = parseFloat(post.rating);
    if (!isNaN(r) && r >= 0 && r <= 10) rating = r;
  } else if (post.community_rating) {
    const cr = parseFloat(post.community_rating);
    if (!isNaN(cr) && cr > 0 && cr <= 10) rating = cr;
  }

  const genres = [];
  if (Array.isArray(post.genres)) {
    for (const gId of post.genres) {
      const name = GENRE_MAP[gId];
      if (name && !genres.includes(name)) genres.push(name);
      if (genres.length >= 6) break;
    }
  }

  const title = String(post.title || "Sin título").replace(/\s*\(\d{4}\)\s*$/, "").trim();

  return {
    id: id,
    title: title,
    poster: poster || null,
    backdrop: backdrop || null,
    overview: post.overview || null,
    type: type,
    rating: rating || null,
    year: year || null,
    genres: genres.length > 0 ? genres : null,
    // campos extra útiles
    tmdbId: post.tmdb_id ? String(post.tmdb_id) : null,
    imdbId: post.imdb_id || null,
    extra: {
      ref: isCollection ? `collection:${post._id}` : `${postType || (isSeries ? "tvshows" : "movies")}:${post._id}`,
      postType: postType,
      originalId: post._id,
      badges: isCollection ? ["Saga / Colección"] : (postType === "novels" ? ["Novela"] : (postType === "wwe" ? ["WWE"] : null))
    }
  };
}

function toActorItem(actor) {
  if (!actor || !actor.term_id) return null;
  let image = null;
  if (actor.meta && actor.meta.profile_path) {
    image = actor.meta.profile_path.startsWith("http")
      ? actor.meta.profile_path
      : "https://image.tmdb.org/t/p/w500" + actor.meta.profile_path;
  } else if (actor.meta && actor.meta.image) {
    image = actor.meta.image.startsWith("http")
      ? actor.meta.image
      : "https://image.tmdb.org/t/p/w500" + actor.meta.image;
  }
  return {
    id: `actor-${actor.term_id}`,
    title: actor.term_name || "Actor",
    poster: image,
    backdrop: image,
    overview: actor.term_description || null,
    type: "series",
    genres: ["Actor"],
    extra: {
      ref: `actor:${actor.term_id}`,
      postType: "actor",
      originalId: actor.term_id,
      badges: ["Actor"]
    }
  };
}

function toKitsuItem(kitsuAnime) {
  if (!kitsuAnime || !kitsuAnime.id) return null;
  const attr = kitsuAnime.attributes || {};
  const titles = attr.titles || {};
  const mainTitle = titles.en || titles.en_jp || attr.canonicalTitle || "Anime";
  let poster = (attr.posterImage && (attr.posterImage.small || attr.posterImage.original)) || null;
  let backdrop = (attr.coverImage && (attr.coverImage.small || attr.coverImage.original)) || null;
  let year = null;
  if (attr.startDate && typeof attr.startDate === "string") {
    const y = parseInt(attr.startDate.slice(0, 4), 10);
    if (!isNaN(y) && y > 1960) year = String(y);
  }
  let rating = null;
  if (attr.averageRating) {
    const r = parseFloat(attr.averageRating) / 10;
    if (!isNaN(r) && r > 0) rating = parseFloat(r.toFixed(1));
  }
  return {
    id: `kitsu-${kitsuAnime.id}`,
    title: mainTitle,
    poster: poster,
    backdrop: backdrop,
    overview: attr.synopsis || null,
    type: "series",
    rating: rating,
    year: year,
    genres: ["Anime"],
    extra: {
      ref: `kitsu:${kitsuAnime.id}`,
      postType: "kitsu",
      originalId: kitsuAnime.id,
      badges: ["Anime"]
    }
  };
}

// ─────────────────────────────────────────────────────────────
// Helpers de listado
// ─────────────────────────────────────────────────────────────

async function fetchListing(path, page, orderBy, order, postType, postsPerPage, filterObj) {
  let url = `${BASE_API}/listing/${path}?page=${page || 1}&orderBy=${orderBy || "ID"}&order=${order || "desc"}&postType=${postType}&postsPerPage=${postsPerPage || 20}`;
  if (filterObj) {
    url += `&filter=${encodeURIComponent(JSON.stringify(filterObj))}`;
  }
  const data = await httpGet(url);
  if (!data || !data.data) return { items: [], hasMore: false };
  const posts = Array.isArray(data.data.posts) ? data.data.posts : [];
  const items = posts.map(toContentItem).filter(Boolean);
  const pagination = data.data.pagination || {};
  const hasMore = !!(pagination.next_page_url);
  return { items: items, hasMore: hasMore };
}

// ─────────────────────────────────────────────────────────────
// getHome → filas para la pantalla Home de tu app
// ─────────────────────────────────────────────────────────────

async function getHome() {
  const genreFetches = FEATURED_GENRES.map(g =>
    fetchListing("movies", 1, "ID", "desc", "movies", 16, { genres: [g.id] })
  );

  const [
    upcoming,
    popularMovies,
    latestMovies,
    series,
    novels,
    animes,
    collections,
    actors,
    ...genreResults
  ] = await Promise.all([
    fetchListing("movies", 1, "ID", "desc", "movies", 30, { years: [74006, 4] }),
    fetchListing("movies", 1, "views", "desc", "movies", 18),
    fetchListing("movies", 1, "ID", "desc", "movies", 20),
    fetchListing("tvshows", 1, "ID", "desc", "tvshows", 16),
    fetchListing("novels", 1, "ID", "desc", "novels", 14),
    fetchListing("animes", 1, "ID", "desc", "animes", 14),
    fetchListing("collections", 1, "ID", "desc", "collections", 14),
    (async () => {
      const data = await httpGet(`${BASE_API}/listing/tax/cast?page=1&orderBy=latest&order=desc&postsPerPage=16`);
      if (!data || !data.data || !Array.isArray(data.data.items)) return { items: [] };
      return { items: data.data.items.map(toActorItem).filter(Boolean) };
    })(),
    ...genreFetches
  ]);

  const rows = [];

  // Hero / Estrenos
  if (upcoming.items.length > 0) {
    // Forzar banner oficial en el primer item para branding
    if (upcoming.items[0]) upcoming.items[0].backdrop = BRAND_BANNER;
    rows.push({
      id: "estrenos",
      title: "Estrenos destacados",
      type: "hero",
      imageStyle: "backdrop",
      items: upcoming.items.slice(0, 12)
    });
  }

  if (popularMovies.items.length > 0) {
    rows.push({
      id: "populares",
      title: "Películas populares",
      type: "row",
      imageStyle: "poster",
      items: popularMovies.items
    });
  }

  if (latestMovies.items.length > 0) {
    rows.push({
      id: "ultimas",
      title: "Últimas películas",
      type: "row",
      imageStyle: "poster",
      items: latestMovies.items
    });
  }

  if (series.items.length > 0) {
    rows.push({
      id: "series",
      title: "Series",
      type: "row",
      imageStyle: "poster",
      items: series.items
    });
  }

  if (novels.items.length > 0) {
    rows.push({
      id: "novelas",
      title: "Novelas",
      type: "row",
      imageStyle: "poster",
      items: novels.items
    });
  }

  if (animes.items.length > 0) {
    rows.push({
      id: "animes",
      title: "Anime",
      type: "row",
      imageStyle: "poster",
      items: animes.items
    });
  }

  if (collections.items.length > 0) {
    rows.push({
      id: "colecciones",
      title: "Sagas y Colecciones",
      type: "row",
      imageStyle: "poster",
      items: collections.items
    });
  }

  if (actors.items.length > 0) {
    rows.push({
      id: "actores",
      title: "Actores destacados",
      type: "row",
      imageStyle: "poster",
      items: actors.items
    });
  }

  // Categorías temáticas
  for (let i = 0; i < FEATURED_GENRES.length; i++) {
    const g = FEATURED_GENRES[i];
    const res = genreResults[i];
    if (res && res.items && res.items.length > 0) {
      rows.push({
        id: `categoria-${g.slug}`,
        title: g.name,
        type: "row",
        imageStyle: "poster",
        items: res.items
      });
    }
  }

  return rows;
}

// ─────────────────────────────────────────────────────────────
// getNews (novedades rápidas para launcher)
// ─────────────────────────────────────────────────────────────

async function getNews() {
  const res = await fetchListing("movies", 1, "ID", "desc", "movies", 12);
  return res.items.map(item => ({
    id: item.id,
    title: item.title,
    poster: item.poster,
    backdrop: item.backdrop,
    type: item.type,
    year: item.year,
    overview: item.overview
  }));
}

// ─────────────────────────────────────────────────────────────
// getDiscoverFilters
// ─────────────────────────────────────────────────────────────

async function getDiscoverFilters() {
  return [
    {
      id: "type",
      title: "Tipo",
      type: "select",
      options: [
        { id: "movies", label: "Películas" },
        { id: "tvshows", label: "Series" },
        { id: "novels", label: "Novelas" },
        { id: "animes", label: "Anime" },
        { id: "collections", label: "Colecciones" }
      ]
    },
    {
      id: "genre",
      title: "Género",
      type: "select",
      options: FEATURED_GENRES.map(g => ({ id: String(g.id), label: g.name }))
    },
    {
      id: "order",
      title: "Orden",
      type: "select",
      options: [
        { id: "latest", label: "Más recientes" },
        { id: "popular", label: "Más vistas" }
      ]
    }
  ];
}

// ─────────────────────────────────────────────────────────────
// getDiscover
// ─────────────────────────────────────────────────────────────

async function getDiscover(opts) {
  opts = opts || {};
  const page = parseInt(opts.page, 10) || 1;
  const type = opts.type || opts.filter || "movies";
  const genreId = opts.genre ? parseInt(opts.genre, 10) : null;
  const order = (opts.order === "popular") ? "views" : "ID";

  let path = "movies";
  let postType = "movies";

  if (type === "tvshows" || type === "series") {
    path = "tvshows"; postType = "tvshows";
  } else if (type === "novels") {
    path = "novels"; postType = "novels";
  } else if (type === "animes" || type === "anime") {
    path = "animes"; postType = "animes";
  } else if (type === "collections") {
    path = "collections"; postType = "collections";
  }

  const filterObj = genreId ? { genres: [genreId] } : null;
  const result = await fetchListing(path, page, order, "desc", postType, 24, filterObj);

  return {
    items: result.items,
    hasMore: result.hasMore,
    page: page
  };
}

// ─────────────────────────────────────────────────────────────
// search
// ─────────────────────────────────────────────────────────────

async function search(query) {
  if (!query || typeof query !== "string" || !query.trim()) return [];

  const q = encodeURIComponent(query.trim());
  const rawTerm = query.trim().toLowerCase();

  const [searchData, kitsuData, actorsData] = await Promise.all([
    httpGet(`${BASE_API}/search?q=${q}&postType=any&postsPerPage=40`),
    httpGet(`https://kitsu.io/api/edge/anime?filter[text]=${q}&page[limit]=12`),
    httpGet(`${BASE_API}/listing/tax/cast?page=1&orderBy=latest&order=desc&postsPerPage=20`)
  ]);

  const items = [];

  if (searchData && searchData.data && Array.isArray(searchData.data.posts)) {
    for (const post of searchData.data.posts) {
      const item = toContentItem(post);
      if (item) items.push(item);
    }
  }

  // Anime de Kitsu (evitar duplicados por título)
  if (kitsuData && Array.isArray(kitsuData.data)) {
    for (const ka of kitsuData.data) {
      const ki = toKitsuItem(ka);
      if (ki && !items.some(it => it.title && it.title.toLowerCase() === ki.title.toLowerCase())) {
        items.push(ki);
      }
    }
  }

  // Actores que coincidan
  if (actorsData && actorsData.data && Array.isArray(actorsData.data.items)) {
    const matched = actorsData.data.items.filter(a =>
      a.term_name && a.term_name.toLowerCase().includes(rawTerm)
    );
    for (const ma of matched) {
      const act = toActorItem(ma);
      if (act) items.unshift(act);
    }
  }

  return items;
}

// ─────────────────────────────────────────────────────────────
// getMeta (detalles + temporadas/episodios)
// ─────────────────────────────────────────────────────────────

async function getMeta(id, opts) {
  opts = opts || {};
  if (!id) return null;

  // Actor
  if (id.startsWith("actor-")) {
    const actorId = id.replace("actor-", "");
    const data = await httpGet(`${BASE_API}/listing/tax/cast?page=1&orderBy=latest&order=desc&postsPerPage=50`);
    if (data && data.data && Array.isArray(data.data.items)) {
      const actor = data.data.items.find(a => String(a.term_id) === String(actorId));
      if (actor) {
        const item = toActorItem(actor);
        // Filmografía como "temporadas" / lista
        const film = await fetchListing("movies", 1, "ID", "desc", "movies", 40, { cast: [parseInt(actorId, 10)] });
        if (item && film.items.length > 0) {
          item.seasons = [{
            number: 1,
            name: "Filmografía",
            episodes: film.items.map((m, idx) => ({
              number: idx + 1,
              id: m.id,
              title: m.title,
              overview: m.overview,
              still: m.poster
            }))
          }];
        }
        return item;
      }
    }
    return null;
  }

  // Kitsu anime
  if (id.startsWith("kitsu-")) {
    const kitsuId = id.replace("kitsu-", "");
    const animeRes = await httpGet(`https://kitsu.io/api/edge/anime/${encodeURIComponent(kitsuId)}`);
    if (!animeRes || !animeRes.data) return null;
    const item = toKitsuItem(animeRes.data);
    if (!item) return null;

    // Episodios
    const attr = animeRes.data.attributes || {};
    const totalEps = Math.min(attr.episodeCount || 24, 120);
    const offsets = [];
    for (let o = 0; o < totalEps; o += 20) offsets.push(o);

    const batches = await Promise.all(offsets.map(o =>
      httpGet(`https://kitsu.io/api/edge/anime/${encodeURIComponent(kitsuId)}/episodes?page[limit]=20&page[offset]=${o}`)
    ));

    const rawEps = [];
    for (const b of batches) {
      if (b && Array.isArray(b.data)) rawEps.push(...b.data);
    }

    const episodes = rawEps.map(e => {
      const num = (e.attributes && e.attributes.number) || 1;
      return {
        number: num,
        id: `kitsu_ep:${kitsuId}:${num}`,
        title: (e.attributes && e.attributes.canonicalTitle) || `Episodio ${num}`,
        overview: (e.attributes && e.attributes.synopsis) || null,
        still: (e.attributes && e.attributes.thumbnail && e.attributes.thumbnail.original) || null
      };
    }).sort((a, b) => a.number - b.number);

    item.seasons = [{
      number: 1,
      name: totalEps > 20 ? `Temporada 1 (${totalEps} eps)` : "Temporada 1",
      episodes: episodes
    }];

    return item;
  }

  // Contenido normal de LaMovie
  // id formato: postType-originalId  (ej: movies-12345, tvshows-6789)
  const parts = String(id).split("-");
  if (parts.length < 2) return null;
  const postType = parts[0];
  const originalId = parts.slice(1).join("-");

  // Intentar endpoint de detalle si existe, sino search por id
  let post = null;

  // Algunas APIs de LaMovie tienen /post/{id} o similar; usamos search como fallback robusto
  const searchRes = await httpGet(`${BASE_API}/search?q=${encodeURIComponent(originalId)}&postType=${postType}&postsPerPage=5`);
  if (searchRes && searchRes.data && Array.isArray(searchRes.data.posts)) {
    post = searchRes.data.posts.find(p => String(p._id) === String(originalId)) || searchRes.data.posts[0];
  }

  // Fallback: listado reciente y buscar
  if (!post) {
    const list = await fetchListing(postType === "movies" ? "movies" : postType, 1, "ID", "desc", postType, 30);
    post = null; // no tenemos el post original, devolvemos null
  }

  if (!post) {
    // Último recurso: construir item mínimo
    return {
      id: id,
      title: "Contenido",
      type: (postType === "tvshows" || postType === "animes" || postType === "novels") ? "series" : "movie",
      extra: { ref: `${postType}:${originalId}`, postType: postType, originalId: originalId }
    };
  }

  const item = toContentItem(post);
  if (!item) return null;

  // Si es serie, cargar temporadas/episodios
  if (item.type === "series" && postType !== "collections") {
    const season = opts.season || 1;
    const epsData = await httpGet(
      `${BASE_API}/listing/episodes?postId=${originalId}&season=${season}&postsPerPage=50`
    );

    // Alternativa común en LaMovie
    let seasonsList = [];
    let episodesList = [];

    if (epsData && epsData.data) {
      if (Array.isArray(epsData.data.posts)) {
        episodesList = epsData.data.posts.map(ep => {
          let still = null;
          if (ep.still_path) {
            still = ep.still_path.startsWith("http") ? ep.still_path : "https://image.tmdb.org/t/p/w500" + ep.still_path;
          }
          return {
            number: ep.episode_number || 1,
            id: `episode-${ep._id}`,
            title: ep.title || `Capítulo ${ep.episode_number || 1}`,
            overview: ep.overview || null,
            still: still
          };
        });
      }
      if (Array.isArray(epsData.data.seasons)) {
        seasonsList = epsData.data.seasons.map(Number).filter(n => !isNaN(n)).sort((a, b) => a - b);
      }
    }

    // Si no hay endpoint de episodios, intentar con ref de series
    if (episodesList.length === 0) {
      // Dejar seasons vacío; getStreams se encargará con el id
      item.seasons = [];
    } else {
      item.seasons = (seasonsList.length > 0 ? seasonsList : [season]).map(sn => ({
        number: sn,
        name: `Temporada ${sn}`,
        episodes: sn === season ? episodesList : []
      }));
    }
  }

  return item;
}

// ─────────────────────────────────────────────────────────────
// getStreams
// ─────────────────────────────────────────────────────────────

function unpackDeanEdwards(html) {
  const m = String(html).match(/eval\(function\(p,a,c,k,e,d\)[\s\S]+?\.split\('\|'\)\)\)/);
  if (!m) return null;
  try {
    const fnBody = m[0].replace(/^eval/, "return ");
    return new Function(fnBody)();
  } catch (_) {
    return null;
  }
}

function extractSubtitles(code) {
  const subs = [];
  const regex = /file:\s*["'](https?:\/\/[^"']+\.vtt[^"']*)["'][^}]*label:\s*["']([^"']+)["']/g;
  let m;
  while ((m = regex.exec(code)) !== null) {
    const label = m[2] || "Español";
    const lang = (label.toLowerCase().includes("span") || label.toLowerCase().includes("es")) ? "es" : "en";
    subs.push({ url: m[1], lang: lang, format: "vtt", label: label });
  }
  return subs.slice(0, 20);
}

async function resolveStreamFromEmbeds(embeds) {
  if (!Array.isArray(embeds) || embeds.length === 0) return [];

  // Priorizar embeds de vimeos
  const sorted = embeds.slice().sort((a, b) => {
    const aV = (a.url || "").includes("vimeos") ? 1 : 0;
    const bV = (b.url || "").includes("vimeos") ? 1 : 0;
    return bV - aV;
  });

  const streams = [];

  for (const embed of sorted) {
    if (!embed || !embed.url) continue;
    let targetUrl = embed.url;

    // Resolver videoapp.zip intermedio
    if (targetUrl.includes("videoapp.zip")) {
      try {
        const html = await httpGet(targetUrl, {
          headers: {
            "Referer": "https://lamovie.org/",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
          }
        });
        if (typeof html === "string") {
          const iframeMatch = html.match(/<iframe[^>]+src=["'](https?:\/\/[^"']+)["']/i);
          if (iframeMatch && iframeMatch[1]) targetUrl = iframeMatch[1];
        }
      } catch (_) {}
    }

    if (targetUrl.includes("vimeos.net") || targetUrl.includes("vimeos.zip")) {
      try {
        const embedHtml = await httpGet(targetUrl, {
          headers: {
            "Referer": "https://lamovie.org/",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
          }
        });
        if (typeof embedHtml !== "string") continue;

        const unpacked = unpackDeanEdwards(embedHtml);
        if (!unpacked) continue;

        const m3u8Match = unpacked.match(/file:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/);
        if (m3u8Match && m3u8Match[1]) {
          const subs = extractSubtitles(unpacked);
          const label = embed.server
            ? `${embed.server}${embed.quality ? " · " + embed.quality : ""}`
            : (embed.quality || "HD");

          streams.push({
            url: m3u8Match[1],
            name: label,
            quality: embed.quality || "HD",
            language: embed.lang || embed.language || "es",
            type: "hls",
            headers: {
              "Referer": "https://vimeos.net/",
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
            },
            subtitles: subs.length > 0 ? subs : undefined
          });
        }
      } catch (_) {
        // siguiente
      }
    }
  }

  return streams;
}

async function getStreams(id, type, season, episode) {
  if (!id) return [];

  // Episodio Kitsu
  if (String(id).startsWith("kitsu_ep:")) {
    const parts = String(id).split(":");
    const kitsuId = parts[1];
    const epNum = parseInt(parts[2], 10) || 1;

    // Buscar el anime en LaMovie por título y luego el episodio
    const kitsuRes = await httpGet(`https://kitsu.io/api/edge/anime/${encodeURIComponent(kitsuId)}`);
    if (!kitsuRes || !kitsuRes.data) return [];

    const attr = kitsuRes.data.attributes || {};
    const titles = attr.titles || {};
    const candidates = [attr.canonicalTitle, titles.en, titles.en_jp, titles.ja_jp].filter(Boolean);

    for (const title of candidates) {
      const sRes = await httpGet(`${BASE_API}/search?q=${encodeURIComponent(title)}&postType=animes&postsPerPage=5`);
      if (sRes && sRes.data && Array.isArray(sRes.data.posts) && sRes.data.posts.length > 0) {
        const post = sRes.data.posts[0];
        // Intentar obtener embeds del episodio
        const epRes = await httpGet(`${BASE_API}/listing/episodes?postId=${post._id}&season=1&episode=${epNum}&postsPerPage=5`);
        if (epRes && epRes.data && Array.isArray(epRes.data.posts) && epRes.data.posts[0]) {
          const embeds = epRes.data.posts[0].embeds || epRes.data.posts[0].servers || [];
          const streams = await resolveStreamFromEmbeds(embeds);
          if (streams.length > 0) return streams;
        }
        // Fallback: embeds del post principal
        if (post.embeds || post.servers) {
          const streams = await resolveStreamFromEmbeds(post.embeds || post.servers);
          if (streams.length > 0) return streams;
        }
      }
    }
    return [];
  }

  // Episodio normal
  if (String(id).startsWith("episode-")) {
    const epId = String(id).replace("episode-", "");
    // Intentar endpoint de detalle de episodio
    const data = await httpGet(`${BASE_API}/search?q=${encodeURIComponent(epId)}&postType=any&postsPerPage=3`);
    // Como fallback usamos el id original
  }

  // Extraer postType y originalId
  let postType = type || "movies";
  let originalId = id;

  if (String(id).includes("-")) {
    const parts = String(id).split("-");
    const possibleType = parts[0];
    if (["movies", "tvshows", "animes", "novels", "collections", "wwe", "episode"].includes(possibleType)) {
      postType = possibleType === "episode" ? "episodes" : possibleType;
      originalId = parts.slice(1).join("-");
    }
  }

  // Buscar el post
  let post = null;
  const searchRes = await httpGet(`${BASE_API}/search?q=${encodeURIComponent(originalId)}&postType=${postType === "episodes" ? "any" : postType}&postsPerPage=5`);
  if (searchRes && searchRes.data && Array.isArray(searchRes.data.posts)) {
    post = searchRes.data.posts.find(p => String(p._id) === String(originalId)) || searchRes.data.posts[0];
  }

  if (!post) return [];

  // Si es serie y se pidió season/episode, intentar cargar el episodio concreto
  if ((postType === "tvshows" || postType === "animes" || postType === "novels") && (season || episode)) {
    const s = season || 1;
    const e = episode || 1;
    const epData = await httpGet(`${BASE_API}/listing/episodes?postId=${post._id}&season=${s}&episode=${e}&postsPerPage=5`);
    if (epData && epData.data && Array.isArray(epData.data.posts) && epData.data.posts[0]) {
      const embeds = epData.data.posts[0].embeds || epData.data.posts[0].servers || [];
      const streams = await resolveStreamFromEmbeds(embeds);
      if (streams.length > 0) return streams;
    }
  }

  // Embeds del post principal
  const embeds = post.embeds || post.servers || post.player || [];
  const streams = await resolveStreamFromEmbeds(Array.isArray(embeds) ? embeds : []);
  return streams;
}

// ─────────────────────────────────────────────────────────────
// Catálogos
// ─────────────────────────────────────────────────────────────

async function getCatalogs() {
  return [
    { id: "movies-latest", title: "Últimas películas", type: "movies" },
    { id: "movies-popular", title: "Películas populares", type: "movies" },
    { id: "series-latest", title: "Series recientes", type: "series" },
    { id: "animes-latest", title: "Anime reciente", type: "anime" },
    { id: "novels-latest", title: "Novelas", type: "series" },
    { id: "collections", title: "Sagas y Colecciones", type: "series" },
    ...FEATURED_GENRES.map(g => ({
      id: `genre-${g.id}`,
      title: g.name,
      type: "movies"
    }))
  ];
}

async function getCatalog(catalogId, opts) {
  opts = opts || {};
  const page = parseInt(opts.page, 10) || 1;

  if (catalogId === "movies-latest") {
    return fetchListing("movies", page, "ID", "desc", "movies", 24);
  }
  if (catalogId === "movies-popular") {
    return fetchListing("movies", page, "views", "desc", "movies", 24);
  }
  if (catalogId === "series-latest") {
    return fetchListing("tvshows", page, "ID", "desc", "tvshows", 24);
  }
  if (catalogId === "animes-latest") {
    return fetchListing("animes", page, "ID", "desc", "animes", 24);
  }
  if (catalogId === "novels-latest") {
    return fetchListing("novels", page, "ID", "desc", "novels", 24);
  }
  if (catalogId === "collections") {
    return fetchListing("collections", page, "ID", "desc", "collections", 24);
  }
  if (String(catalogId).startsWith("genre-")) {
    const gId = parseInt(String(catalogId).replace("genre-", ""), 10);
    return fetchListing("movies", page, "ID", "desc", "movies", 24, { genres: [gId] });
  }

  return { items: [], hasMore: false };
}

// ─────────────────────────────────────────────────────────────
// Anuncios (opcional)
// ─────────────────────────────────────────────────────────────

async function getAds() {
  return [];
}

// ─────────────────────────────────────────────────────────────
// Exportación de métodos (compatible con JsAddonRuntime)
// ─────────────────────────────────────────────────────────────

// Si el runtime espera exports estilo CommonJS / module
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    getHome,
    getNews,
    getDiscoverFilters,
    getDiscover,
    search,
    getMeta,
    getStreams,
    getCatalogs,
    getCatalog,
    getAds
  };
}

// También exponer en globalThis para runtimes que llaman por nombre
const __moviezone = {
  getHome,
  getNews,
  getDiscoverFilters,
  getDiscover,
  search,
  getMeta,
  getStreams,
  getCatalogs,
  getCatalog,
  getAds
};

if (typeof globalThis !== "undefined") {
  Object.assign(globalThis, __moviezone);
}
if (typeof global !== "undefined") {
  Object.assign(global, __moviezone);
}
