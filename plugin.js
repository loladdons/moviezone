/**
 * MovieZone – Plugin adaptado (FIX series/capitulos + meta)
 * Runtime: fetch global de JsAddonRuntime
 */

const BASE_API = "https://lamovie.org/wp-api/v1";
const UPLOADS_BASE = "https://lamovie.org/wp-content/uploads";
const BRAND_BANNER = "https://raw.githubusercontent.com/sebasmc214-ship-it/kino_plugin_moviezone/main/banner.jpg";

const FEATURED_GENRES = [
  { id: 32, name: "Acción", slug: "accion" },
  { id: 18, name: "Comedia", slug: "comedia" },
  { id: 17, name: "Drama", slug: "drama" },
  { id: 33, name: "Suspenso", slug: "suspense" },
  { id: 96, name: "Terror", slug: "terror" },
  { id: 520, name: "Animación", slug: "animacion" },
  { id: 131, name: "Ciencia ficción", slug: "ciencia-ficcion" },
  { id: 130, name: "Aventura", slug: "aventura" },
  { id: 115, name: "Romance", slug: "romance" },
  { id: 180, name: "Crimen", slug: "crimen" },
  { id: 398, name: "Familia", slug: "familia" },
  { id: 229, name: "Fantasía", slug: "fantasia" }
];

const GENRE_MAP = {
  17: "Drama", 18: "Comedia", 33: "Suspenso", 32: "Acción", 520: "Animación",
  96: "Terror", 180: "Crimen", 130: "Aventura", 115: "Romance", 398: "Familia",
  97: "Misterio", 131: "Ciencia ficción", 229: "Fantasía", 704: "Ciencia ficción",
  705: "Acción", 164: "Documentales", 165: "Historia", 8: "Música",
  3056: "Bélica", 674: "Western", 703: "Infantil"
};

function decodeHtml(s) {
  if (!s) return s;
  return String(s)
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;|&#8221;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

async function apiGet(url, headers) {
  const h = Object.assign({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/html, */*",
    "Referer": "https://lamovie.org/"
  }, headers || {});
  try {
    const res = await fetch(url, { method: "GET", headers: h });
    if (!res || !res.ok) return null;
    const ct = (res.headers && res.headers.get) ? (res.headers.get("content-type") || "") : "";
    if (ct.indexOf("json") >= 0 || url.indexOf("/wp-api/") >= 0) {
      try { return await res.json(); } catch (e) { return null; }
    }
    try { return await res.text(); } catch (e) { return null; }
  } catch (e) {
    return null;
  }
}

function absImg(path) {
  if (!path) return null;
  if (String(path).indexOf("http") === 0) return path;
  return UPLOADS_BASE + path;
}

function toItem(post) {
  if (!post || typeof post !== "object") return null;
  const postType = post.type || "movies";
  const isSeries = postType === "tvshows" || postType === "animes" || postType === "novels" || postType === "wwe" || postType === "collections";
  const type = isSeries ? "series" : "movie";
  const id = postType + "-" + post._id;

  let year = null;
  if (post.release_date) {
    const y = parseInt(String(post.release_date).slice(0, 4), 10);
    if (!isNaN(y) && y > 1900) year = String(y);
  }
  if (!year && post.title) {
    const m = String(post.title).match(/\((\d{4})\)/);
    if (m) year = m[1];
  }

  let poster = null, backdrop = null, logo = null;
  if (post.images && typeof post.images === "object") {
    if (post.images.poster) poster = absImg(post.images.poster);
    if (post.images.backdrop) backdrop = absImg(post.images.backdrop);
    if (post.images.logo) logo = absImg(post.images.logo);
  }

  let rating = null;
  if (post.rating != null) {
    const r = parseFloat(post.rating);
    if (!isNaN(r)) rating = r;
  } else if (post.community_rating != null) {
    const r = parseFloat(post.community_rating);
    if (!isNaN(r)) rating = r;
  }

  const genres = [];
  if (Array.isArray(post.genres)) {
    for (let i = 0; i < post.genres.length && genres.length < 6; i++) {
      const name = GENRE_MAP[post.genres[i]];
      if (name && genres.indexOf(name) < 0) genres.push(name);
    }
  }

  const title = decodeHtml(String(post.title || "Sin título").replace(/\s*\(\d{4}\)\s*$/, "").trim());

  return {
    id: id,
    title: title,
    poster: poster,
    backdrop: backdrop,
    logo: logo,
    overview: post.overview ? decodeHtml(post.overview) : null,
    type: type,
    rating: rating,
    year: year,
    genres: genres,
    tmdbId: post.tmdb_id ? String(post.tmdb_id) : null,
    imdbId: post.imdb_id || null,
    extra: {
      ref: postType + ":" + post._id,
      postType: postType,
      originalId: post._id,
      slug: post.slug || null
    }
  };
}

async function listing(path, page, orderBy, order, postType, perPage, filterObj) {
  let url = BASE_API + "/listing/" + path +
    "?page=" + (page || 1) +
    "&orderBy=" + (orderBy || "ID") +
    "&order=" + (order || "desc") +
    "&postType=" + postType +
    "&postsPerPage=" + (perPage || 24);
  if (filterObj) url += "&filter=" + encodeURIComponent(JSON.stringify(filterObj));

  const data = await apiGet(url);
  if (!data || !data.data) return { items: [], hasMore: false, page: page || 1 };

  const posts = Array.isArray(data.data.posts) ? data.data.posts : [];
  const items = [];
  for (let i = 0; i < posts.length; i++) {
    const it = toItem(posts[i]);
    if (it) items.push(it);
  }
  const pag = data.data.pagination || {};
  const hasMore = !!(pag.next_page_url) || (pag.current_page && pag.last_page && pag.current_page < pag.last_page);
  return { items: items, hasMore: !!hasMore, page: page || 1 };
}

async function getHome() {
  const genreJobs = FEATURED_GENRES.map(function (g) {
    return listing("movies", 1, "ID", "desc", "movies", 14, { genres: [g.id] });
  });

  const results = await Promise.all([
    listing("movies", 1, "ID", "desc", "movies", 24, { years: [74006, 4] }),
    listing("movies", 1, "views", "desc", "movies", 18),
    listing("movies", 1, "ID", "desc", "movies", 18),
    listing("tvshows", 1, "ID", "desc", "tvshows", 16),
    listing("novels", 1, "ID", "desc", "novels", 14),
    listing("animes", 1, "ID", "desc", "animes", 14),
    listing("collections", 1, "ID", "desc", "collections", 12)
  ].concat(genreJobs));

  const rows = [];
  const pushRow = function (id, title, type, style, items) {
    if (items && items.length) {
      rows.push({ id: id, title: title, type: type, imageStyle: style, items: items });
    }
  };

  if (results[0].items.length) {
    if (results[0].items[0]) results[0].items[0].backdrop = BRAND_BANNER;
    pushRow("estrenos", "Estrenos destacados", "hero", "backdrop", results[0].items.slice(0, 12));
  }
  pushRow("populares", "Películas populares", "row", "poster", results[1].items);
  pushRow("ultimas", "Últimas películas", "row", "poster", results[2].items);
  pushRow("series", "Series", "row", "poster", results[3].items);
  pushRow("novelas", "Novelas", "row", "poster", results[4].items);
  pushRow("animes", "Anime", "row", "poster", results[5].items);
  pushRow("colecciones", "Sagas y Colecciones", "row", "poster", results[6].items);

  for (let i = 0; i < FEATURED_GENRES.length; i++) {
    const g = FEATURED_GENRES[i];
    const res = results[7 + i];
    if (res && res.items && res.items.length) {
      pushRow("cat-" + g.slug, g.name, "row", "poster", res.items);
    }
  }
  return rows;
}

async function getNews() {
  const res = await listing("movies", 1, "ID", "desc", "movies", 12);
  return res.items;
}

async function getDiscoverFilters() {
  return [
    {
      id: "type",
      title: "Tipo",
      label: "Tipo",
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
      label: "Género",
      type: "select",
      options: [{ id: "all", label: "Todos" }].concat(
        FEATURED_GENRES.map(function (g) { return { id: String(g.id), label: g.name }; })
      )
    },
    {
      id: "order",
      title: "Orden",
      label: "Orden",
      type: "select",
      options: [
        { id: "latest", label: "Más recientes" },
        { id: "popular", label: "Más vistas" }
      ]
    }
  ];
}

async function getDiscover(opts) {
  opts = opts || {};
  const page = parseInt(opts.page, 10) || 1;

  // La UI envía { type, genre, order } desde _filterMap
  let type = opts.type || opts.filter || opts.filterId || "movies";
  let genreRaw = opts.genre;
  let orderRaw = opts.order;

  // Compat: a veces el valor viene en español
  const typeMap = {
    "peliculas": "movies", "películas": "movies", "movie": "movies", "movies": "movies",
    "series": "tvshows", "serie": "tvshows", "tv": "tvshows", "tvshows": "tvshows",
    "novelas": "novels", "novels": "novels",
    "anime": "animes", "animes": "animes",
    "colecciones": "collections", "collections": "collections", "sagas": "collections"
  };
  const tKey = String(type).toLowerCase().trim();
  type = typeMap[tKey] || tKey;

  let path = "movies";
  let postType = "movies";
  if (type === "tvshows") { path = "tvshows"; postType = "tvshows"; }
  else if (type === "novels") { path = "novels"; postType = "novels"; }
  else if (type === "animes") { path = "animes"; postType = "animes"; }
  else if (type === "collections") { path = "collections"; postType = "collections"; }
  else { path = "movies"; postType = "movies"; type = "movies"; }

  // Género SOLO aplica a películas (los term_id de LaMovie son de movies)
  let filterObj = null;
  if (postType === "movies" && genreRaw != null && genreRaw !== "" && genreRaw !== "all") {
    const genreId = parseInt(genreRaw, 10);
    if (!isNaN(genreId) && genreId > 0) {
      filterObj = { genres: [genreId] };
    }
  }

  const orderBy = (orderRaw === "popular" || orderRaw === "views") ? "views" : "ID";
  const result = await listing(path, page, orderBy, "desc", postType, 24, filterObj);
  return { items: result.items, hasMore: result.hasMore, page: page };
}

async function search(query) {
  if (!query || typeof query !== "string" || !query.trim()) return [];
  const q = encodeURIComponent(query.trim());
  const data = await apiGet(BASE_API + "/search?q=" + q + "&postType=any&postsPerPage=40");
  const items = [];
  if (data && data.data && Array.isArray(data.data.posts)) {
    for (let i = 0; i < data.data.posts.length; i++) {
      const it = toItem(data.data.posts[i]);
      if (it) items.push(it);
    }
  }
  return items;
}

function parseId(id) {
  const s = String(id || "");
  if (s.indexOf("kitsu_ep:") === 0) {
    const p = s.split(":");
    return { postType: "kitsu_ep", originalId: p[1], episode: parseInt(p[2], 10) || 1 };
  }
  if (s.indexOf("kitsu-") === 0) return { postType: "kitsu", originalId: s.slice(6) };
  if (s.indexOf("episode-") === 0) return { postType: "episodes", originalId: s.slice(8) };
  const idx = s.indexOf("-");
  if (idx > 0) return { postType: s.slice(0, idx), originalId: s.slice(idx + 1) };
  return { postType: "movies", originalId: s };
}

/** Busca un post por _id (search no acepta id numérico puro). */
async function fetchPostById(postType, originalId) {
  const target = String(originalId);
  const pathMap = {
    movies: "movies", tvshows: "tvshows", animes: "animes",
    novels: "novels", collections: "collections", wwe: "wwe"
  };
  const path = pathMap[postType] || "movies";
  const perPage = 50;

  // 1) Búsqueda textual por si el runtime ya tiene título en cache no aplica; intentar igual
  let data = await apiGet(
    BASE_API + "/search?q=" + encodeURIComponent(originalId) +
    "&postType=" + postType + "&postsPerPage=10"
  );
  if (data && data.data && Array.isArray(data.data.posts)) {
    for (let i = 0; i < data.data.posts.length; i++) {
      if (String(data.data.posts[i]._id) === target) return data.data.posts[i];
    }
  }

  // 2) Últimos publicados (desc) — cubre estrenos recientes
  for (let page = 1; page <= 3; page++) {
    const list = await apiGet(
      BASE_API + "/listing/" + path + "?page=" + page +
      "&orderBy=ID&order=desc&postType=" + postType + "&postsPerPage=" + perPage
    );
    if (!list || !list.data || !Array.isArray(list.data.posts)) break;
    for (let i = 0; i < list.data.posts.length; i++) {
      if (String(list.data.posts[i]._id) === target) return list.data.posts[i];
    }
  }

  // 3) Búsqueda binaria por páginas con orderBy=ID asc
  let first = await apiGet(
    BASE_API + "/listing/" + path + "?page=1&orderBy=ID&order=asc&postType=" +
    postType + "&postsPerPage=" + perPage
  );
  if (!first || !first.data || !Array.isArray(first.data.posts) || !first.data.posts.length) return null;

  const pag = first.data.pagination || {};
  let lo = 1;
  let hi = pag.last_page || 1;
  const want = parseInt(target, 10);

  // Si está en página 1 asc
  for (let i = 0; i < first.data.posts.length; i++) {
    if (String(first.data.posts[i]._id) === target) return first.data.posts[i];
  }

  let guard = 0;
  while (lo <= hi && guard < 18) {
    guard++;
    const mid = (lo + hi) >> 1;
    const list = mid === 1 ? first : await apiGet(
      BASE_API + "/listing/" + path + "?page=" + mid +
      "&orderBy=ID&order=asc&postType=" + postType + "&postsPerPage=" + perPage
    );
    if (!list || !list.data || !Array.isArray(list.data.posts) || !list.data.posts.length) {
      hi = mid - 1;
      continue;
    }
    const posts = list.data.posts;
    const firstId = parseInt(posts[0]._id, 10);
    const lastId = parseInt(posts[posts.length - 1]._id, 10);

    for (let i = 0; i < posts.length; i++) {
      if (String(posts[i]._id) === target) return posts[i];
    }

    if (!isNaN(want)) {
      if (want < firstId) hi = mid - 1;
      else if (want > lastId) lo = mid + 1;
      else {
        // id dentro del rango de la página pero no encontrado (huecos)
        // explorar vecinos
        if (mid > 1) {
          const left = await apiGet(
            BASE_API + "/listing/" + path + "?page=" + (mid - 1) +
            "&orderBy=ID&order=asc&postType=" + postType + "&postsPerPage=" + perPage
          );
          if (left && left.data && Array.isArray(left.data.posts)) {
            for (let i = 0; i < left.data.posts.length; i++) {
              if (String(left.data.posts[i]._id) === target) return left.data.posts[i];
            }
          }
        }
        if (mid < (pag.last_page || mid)) {
          const right = await apiGet(
            BASE_API + "/listing/" + path + "?page=" + (mid + 1) +
            "&orderBy=ID&order=asc&postType=" + postType + "&postsPerPage=" + perPage
          );
          if (right && right.data && Array.isArray(right.data.posts)) {
            for (let i = 0; i < right.data.posts.length; i++) {
              if (String(right.data.posts[i]._id) === target) return right.data.posts[i];
            }
          }
        }
        break;
      }
    } else {
      break;
    }
  }
  return null;
}

/**
 * Carga TODAS las temporadas y episodios.
 * Endpoint correcto (del plugin original Kino):
 *   /single/episodes/list?_id=SERIES_ID&season=N&page=1&postsPerPage=100
 */
async function loadSeasonsAndEpisodes(seriesId) {
  // Primera llamada para obtener lista de temporadas
  const first = await apiGet(
    BASE_API + "/single/episodes/list?_id=" + encodeURIComponent(seriesId) +
    "&season=1&page=1&postsPerPage=100"
  );
  if (!first || !first.data) return [];

  let seasonNums = [];
  if (Array.isArray(first.data.seasons) && first.data.seasons.length) {
    seasonNums = first.data.seasons.map(Number).filter(function (n) { return !isNaN(n) && n > 0; });
    seasonNums.sort(function (a, b) { return a - b; });
  }
  if (!seasonNums.length) seasonNums = [1];

  const seasons = [];

  for (let si = 0; si < seasonNums.length; si++) {
    const sn = seasonNums[si];
    let allEps = [];
    let page = 1;
    let lastPage = 1;

    do {
      const data = (sn === 1 && page === 1) ? first : await apiGet(
        BASE_API + "/single/episodes/list?_id=" + encodeURIComponent(seriesId) +
        "&season=" + sn + "&page=" + page + "&postsPerPage=100"
      );
      if (!data || !data.data || !Array.isArray(data.data.posts)) break;

      for (let i = 0; i < data.data.posts.length; i++) {
        const ep = data.data.posts[i];
        const num = ep.episode_number || (allEps.length + 1);
        let still = null;
        if (ep.still_path) {
          still = String(ep.still_path).indexOf("http") === 0
            ? ep.still_path
            : "https://image.tmdb.org/t/p/w500" + ep.still_path;
        }
        allEps.push({
          number: num,
          id: "episode-" + ep._id,
          title: decodeHtml(ep.title || ("Episodio " + num)),
          overview: ep.overview ? decodeHtml(ep.overview) : null,
          still: still
        });
      }

      const pag = data.data.pagination || {};
      lastPage = pag.last_page || 1;
      page++;
    } while (page <= lastPage && page <= 20);

    allEps.sort(function (a, b) { return a.number - b.number; });
    seasons.push({
      number: sn,
      name: "Temporada " + sn,
      episodes: allEps
    });
  }

  return seasons;
}

function titleFromEpisode(epTitle) {
  if (!epTitle) return null;
  // "Grey's Anatomy: Temporada 1 Episodio 1" -> "Grey's Anatomy"
  const t = decodeHtml(String(epTitle));
  const m = t.match(/^(.*?)\s*[:\-–]\s*Temporada\s*\d+/i);
  if (m) return m[1].trim();
  const m2 = t.match(/^(.*?)\s+Temporada\s*\d+/i);
  if (m2) return m2[1].trim();
  return null;
}

async function getMeta(id, opts) {
  opts = opts || {};
  if (!id) return null;

  const parsed = parseId(id);
  const seriesTypes = { tvshows: 1, animes: 1, novels: 1, wwe: 1, collections: 1 };

  // ── SERIES: prioridad cargar capítulos ──
  if (seriesTypes[parsed.postType]) {
    const seasons = await loadSeasonsAndEpisodes(parsed.originalId);
    const post = await fetchPostById(parsed.postType, parsed.originalId);

    if (post) {
      const item = toItem(post);
      if (item) {
        item.seasons = seasons;
        item.type = "series";
        return item;
      }
    }

    // Sin post completo: armar meta mínima CON capítulos (clave para la UI)
    let title = "Serie";
    let overview = null;
    let still = null;
    if (seasons.length && seasons[0].episodes && seasons[0].episodes.length) {
      const ep0 = seasons[0].episodes[0];
      title = titleFromEpisode(ep0.title) || title;
      overview = ep0.overview || null;
      still = ep0.still || null;
    }

    return {
      id: id,
      title: title,
      poster: still,
      backdrop: still,
      overview: overview,
      type: "series",
      seasons: seasons,
      extra: {
        ref: parsed.postType + ":" + parsed.originalId,
        postType: parsed.postType,
        originalId: parsed.originalId
      }
    };
  }

  // ── MOVIES ──
  if (parsed.postType === "movies" || parsed.postType === "movie") {
    const post = await fetchPostById("movies", parsed.originalId);
    if (post) return toItem(post);
    // Nunca devolver null: la UI muestra "No encontrado".
    // Streams siguen funcionando con el originalId vía /player?postId=
    return {
      id: id,
      title: "Película",
      type: "movie",
      overview: null,
      extra: {
        ref: "movies:" + parsed.originalId,
        postType: "movies",
        originalId: parsed.originalId
      }
    };
  }

  // ── EPISODIO suelto ──
  if (parsed.postType === "episodes") {
    return {
      id: id,
      title: "Episodio",
      type: "movie",
      extra: { ref: "episode:" + parsed.originalId, postType: "episodes", originalId: parsed.originalId }
    };
  }

  // ── Kitsu ──
  if (parsed.postType === "kitsu") {
    const animeRes = await apiGet("https://kitsu.io/api/edge/anime/" + encodeURIComponent(parsed.originalId));
    if (!animeRes || !animeRes.data) return null;
    const attr = animeRes.data.attributes || {};
    const titles = attr.titles || {};
    const title = titles.en || titles.en_jp || attr.canonicalTitle || "Anime";
    const totalEps = Math.min(attr.episodeCount || 24, 80);
    const offsets = [];
    for (let o = 0; o < totalEps; o += 20) offsets.push(o);
    const batches = await Promise.all(offsets.map(function (o) {
      return apiGet("https://kitsu.io/api/edge/anime/" + encodeURIComponent(parsed.originalId) +
        "/episodes?page[limit]=20&page[offset]=" + o);
    }));
    const eps = [];
    for (let b = 0; b < batches.length; b++) {
      const batch = batches[b];
      if (batch && Array.isArray(batch.data)) {
        for (let i = 0; i < batch.data.length; i++) {
          const e = batch.data[i];
          const num = (e.attributes && e.attributes.number) || (eps.length + 1);
          eps.push({
            number: num,
            id: "kitsu_ep:" + parsed.originalId + ":" + num,
            title: (e.attributes && e.attributes.canonicalTitle) || ("Episodio " + num),
            overview: (e.attributes && e.attributes.synopsis) || null,
            still: (e.attributes && e.attributes.thumbnail && e.attributes.thumbnail.original) || null
          });
        }
      }
    }
    eps.sort(function (a, b) { return a.number - b.number; });
    return {
      id: id,
      title: title,
      poster: (attr.posterImage && (attr.posterImage.small || attr.posterImage.original)) || null,
      backdrop: (attr.coverImage && (attr.coverImage.small || attr.coverImage.original)) || null,
      overview: attr.synopsis || null,
      type: "series",
      rating: attr.averageRating ? parseFloat((parseFloat(attr.averageRating) / 10).toFixed(1)) : null,
      year: attr.startDate ? String(attr.startDate).slice(0, 4) : null,
      genres: ["Anime"],
      seasons: [{ number: 1, name: "Temporada 1", episodes: eps }],
      extra: { ref: "kitsu:" + parsed.originalId, postType: "kitsu", originalId: parsed.originalId }
    };
  }

  // Fallback: objeto mínimo (evita "No encontrado" en la UI)
  return {
    id: id,
    title: parsed.postType === "movies" ? "Película" : "Contenido",
    type: seriesTypes[parsed.postType] ? "series" : "movie",
    extra: {
      ref: parsed.postType + ":" + parsed.originalId,
      postType: parsed.postType,
      originalId: parsed.originalId
    }
  };
}

// ─── Streams ─────────────────────────────────────────────────────────────

function unpackDeanEdwards(html) {
  const m = String(html).match(/eval\(function\(p,a,c,k,e,d\)[\s\S]+?\.split\('\|'\)\)\)/);
  if (!m) return null;
  try {
    return (new Function(m[0].replace(/^eval/, "return ")))();
  } catch (e) { return null; }
}

function extractSubtitles(code) {
  const subs = [];
  const regex = /file:\s*["'](https?:\/\/[^"']+\.vtt[^"']*)["'][^}]*label:\s*["']([^"']+)["']/g;
  let m;
  while ((m = regex.exec(code)) !== null) {
    const label = m[2] || "Español";
    const low = label.toLowerCase();
    const lang = (low.indexOf("span") >= 0 || low.indexOf("es") >= 0 || low.indexOf("lat") >= 0) ? "es" : "en";
    subs.push({ url: m[1], lang: lang, label: label, format: "vtt" });
  }
  return subs.slice(0, 20);
}

async function resolveEmbeds(embeds) {
  if (!Array.isArray(embeds) || !embeds.length) return [];
  const streams = [];
  const sorted = embeds.slice().sort(function (a, b) {
    return ((b.url || "").indexOf("vimeos") >= 0 ? 1 : 0) - ((a.url || "").indexOf("vimeos") >= 0 ? 1 : 0);
  });

  for (let i = 0; i < sorted.length; i++) {
    const embed = sorted[i];
    if (!embed || !embed.url) continue;
    if (String(embed.url).indexOf("embed.html?v=1") >= 0) continue;
    let target = embed.url;

    if (target.indexOf("videoapp.zip") >= 0) {
      try {
        const html = await apiGet(target, { "Referer": "https://lamovie.org/" });
        if (typeof html === "string") {
          const m = html.match(/<iframe[^>]+src=["'](https?:\/\/[^"']+)["']/i);
          if (m && m[1]) target = m[1];
        }
      } catch (e) {}
    }

    if (target.indexOf("vimeos.net") >= 0 || target.indexOf("vimeos.zip") >= 0) {
      try {
        const embedHtml = await apiGet(target, { "Referer": "https://lamovie.org/" });
        if (typeof embedHtml !== "string") continue;
        const unpacked = unpackDeanEdwards(embedHtml);
        if (!unpacked) continue;
        const m3u8 = unpacked.match(/file:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/);
        if (m3u8 && m3u8[1]) {
          const subs = extractSubtitles(unpacked);
          const name = embed.server
            ? (embed.server + (embed.quality ? " · " + embed.quality : ""))
            : (embed.quality || "HD");
          streams.push({
            url: m3u8[1],
            name: name,
            quality: embed.quality || "HD",
            language: embed.lang || embed.language || "Latino",
            type: "hls",
            isHls: true,
            headers: {
              "Referer": "https://vimeos.net/",
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
            },
            subtitles: subs.length ? subs : undefined
          });
        }
      } catch (e) {}
    } else if (target.indexOf(".m3u8") >= 0) {
      streams.push({
        url: target,
        name: embed.server || "Directo",
        quality: embed.quality || "HD",
        language: embed.lang || "es",
        type: "hls",
        isHls: true,
        headers: { "Referer": "https://lamovie.org/" }
      });
    }
  }
  return streams;
}

async function getPlayerEmbeds(postId) {
  const data = await apiGet(BASE_API + "/player?postId=" + encodeURIComponent(postId) + "&demo=0");
  if (data && data.data && Array.isArray(data.data.embeds)) {
    return data.data.embeds.filter(function (e) {
      return e && e.url && String(e.url).indexOf("embed.html?v=1") < 0;
    });
  }
  return [];
}

async function getStreams(id, type, season, episode) {
  if (!id) return [];
  const parsed = parseId(id);
  let postId = parsed.originalId;

  // Serie + season/episode → resolver id del episodio real
  const isSeries = parsed.postType === "tvshows" || parsed.postType === "animes" ||
    parsed.postType === "novels" || type === "series" || type === "tv";

  if (isSeries && (season != null || episode != null) && parsed.postType !== "episodes") {
    const s = season || 1;
    const e = episode || 1;
    const data = await apiGet(
      BASE_API + "/single/episodes/list?_id=" + encodeURIComponent(postId) +
      "&season=" + s + "&page=1&postsPerPage=100"
    );
    if (data && data.data && Array.isArray(data.data.posts)) {
      let found = null;
      for (let i = 0; i < data.data.posts.length; i++) {
        if (Number(data.data.posts[i].episode_number) === Number(e)) {
          found = data.data.posts[i];
          break;
        }
      }
      // paginar si no está en página 1
      if (!found && data.data.pagination && data.data.pagination.last_page > 1) {
        for (let p = 2; p <= Math.min(data.data.pagination.last_page, 10) && !found; p++) {
          const d2 = await apiGet(
            BASE_API + "/single/episodes/list?_id=" + encodeURIComponent(postId) +
            "&season=" + s + "&page=" + p + "&postsPerPage=100"
          );
          if (d2 && d2.data && Array.isArray(d2.data.posts)) {
            for (let i = 0; i < d2.data.posts.length; i++) {
              if (Number(d2.data.posts[i].episode_number) === Number(e)) {
                found = d2.data.posts[i];
                break;
              }
            }
          }
        }
      }
      if (found) postId = found._id;
    }
  }

  if (parsed.postType === "episodes") {
    postId = parsed.originalId;
  }

  const embeds = await getPlayerEmbeds(postId);
  if (!embeds.length) return [];
  return await resolveEmbeds(embeds);
}

async function getCatalogs() {
  return [
    { id: "movies-latest", title: "Últimas películas", type: "movies" },
    { id: "movies-popular", title: "Películas populares", type: "movies" },
    { id: "series-latest", title: "Series recientes", type: "series" },
    { id: "animes-latest", title: "Anime reciente", type: "anime" },
    { id: "novels-latest", title: "Novelas", type: "series" },
    { id: "collections", title: "Sagas y Colecciones", type: "series" }
  ].concat(FEATURED_GENRES.map(function (g) {
    return { id: "genre-" + g.id, title: g.name, type: "movies" };
  }));
}

async function getCatalog(catalogId, opts) {
  opts = opts || {};
  const page = parseInt(opts.page, 10) || 1;
  const id = String(catalogId || "");
  if (id === "movies-latest") return listing("movies", page, "ID", "desc", "movies", 24);
  if (id === "movies-popular") return listing("movies", page, "views", "desc", "movies", 24);
  if (id === "series-latest") return listing("tvshows", page, "ID", "desc", "tvshows", 24);
  if (id === "animes-latest") return listing("animes", page, "ID", "desc", "animes", 24);
  if (id === "novels-latest") return listing("novels", page, "ID", "desc", "novels", 24);
  if (id === "collections") return listing("collections", page, "ID", "desc", "collections", 24);
  if (id.indexOf("genre-") === 0) {
    const gId = parseInt(id.replace("genre-", ""), 10);
    return listing("movies", page, "ID", "desc", "movies", 24, { genres: [gId] });
  }
  return { items: [], hasMore: false, page: page };
}

async function getAds() { return []; }

module.exports = {
  getHome: getHome,
  getNews: getNews,
  getDiscoverFilters: getDiscoverFilters,
  getDiscover: getDiscover,
  search: search,
  getMeta: getMeta,
  getStreams: getStreams,
  getCatalogs: getCatalogs,
  getCatalog: getCatalog,
  getAds: getAds
};
