
/**
 * MovieZone – Plugin completo adaptado a tu ContentService / JsAddonRuntime
 * Fuente: LaMovie (lamovie.org)
 *
 * Métodos:
 *   getHome, getNews, getDiscoverFilters, getDiscover,
 *   search, getMeta, getStreams, getCatalogs, getCatalog, getAds
 *
 * Runtime: usa fetch global (puente Dart de tu js_runtime.dart)
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

// ─── HTTP (solo fetch global del runtime) ────────────────────────────────

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

// ─── Conversores ─────────────────────────────────────────────────────────

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
  if (!poster && Array.isArray(post.images) && post.images[0]) {
    const im = post.images[0];
    if (im.poster) poster = absImg(im.poster);
    if (im.backdrop) backdrop = absImg(im.backdrop);
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

  const title = String(post.title || "Sin título").replace(/\s*\(\d{4}\)\s*$/, "").trim();

  return {
    id: id,
    title: title,
    poster: poster,
    backdrop: backdrop,
    logo: logo,
    overview: post.overview || null,
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

// ─── Listing helper ──────────────────────────────────────────────────────

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

// ─── getHome ─────────────────────────────────────────────────────────────

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

  const upcoming = results[0];
  const popular = results[1];
  const latest = results[2];
  const series = results[3];
  const novels = results[4];
  const animes = results[5];
  const collections = results[6];
  const genreResults = results.slice(7);

  const rows = [];

  if (upcoming.items.length) {
    if (upcoming.items[0]) upcoming.items[0].backdrop = BRAND_BANNER;
    rows.push({
      id: "estrenos",
      title: "Estrenos destacados",
      type: "hero",
      imageStyle: "backdrop",
      items: upcoming.items.slice(0, 12)
    });
  }
  if (popular.items.length) {
    rows.push({ id: "populares", title: "Películas populares", type: "row", imageStyle: "poster", items: popular.items });
  }
  if (latest.items.length) {
    rows.push({ id: "ultimas", title: "Últimas películas", type: "row", imageStyle: "poster", items: latest.items });
  }
  if (series.items.length) {
    rows.push({ id: "series", title: "Series", type: "row", imageStyle: "poster", items: series.items });
  }
  if (novels.items.length) {
    rows.push({ id: "novelas", title: "Novelas", type: "row", imageStyle: "poster", items: novels.items });
  }
  if (animes.items.length) {
    rows.push({ id: "animes", title: "Anime", type: "row", imageStyle: "poster", items: animes.items });
  }
  if (collections.items.length) {
    rows.push({ id: "colecciones", title: "Sagas y Colecciones", type: "row", imageStyle: "poster", items: collections.items });
  }

  for (let i = 0; i < FEATURED_GENRES.length; i++) {
    const g = FEATURED_GENRES[i];
    const res = genreResults[i];
    if (res && res.items && res.items.length) {
      rows.push({
        id: "cat-" + g.slug,
        title: g.name,
        type: "row",
        imageStyle: "poster",
        items: res.items
      });
    }
  }

  return rows;
}

// ─── getNews ─────────────────────────────────────────────────────────────

async function getNews() {
  const res = await listing("movies", 1, "ID", "desc", "movies", 12);
  return res.items;
}

// ─── getDiscoverFilters ──────────────────────────────────────────────────

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
      options: FEATURED_GENRES.map(function (g) {
        return { id: String(g.id), label: g.name };
      })
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

// ─── getDiscover ─────────────────────────────────────────────────────────

async function getDiscover(opts) {
  opts = opts || {};
  const page = parseInt(opts.page, 10) || 1;

  let type = opts.type || opts.filter || opts.filterId || "movies";
  let genreId = null;

  if (opts.genre != null && opts.genre !== "") {
    genreId = parseInt(opts.genre, 10);
  } else if (opts.filterId != null && /^\d+$/.test(String(opts.filterId))) {
    genreId = parseInt(opts.filterId, 10);
    type = "movies";
  } else if (opts.filter != null && /^\d+$/.test(String(opts.filter))) {
    genreId = parseInt(opts.filter, 10);
    type = "movies";
  }

  const t = String(type).toLowerCase();
  let path = "movies";
  let postType = "movies";
  if (t === "tvshows" || t === "series" || t === "serie") {
    path = "tvshows"; postType = "tvshows";
  } else if (t === "novels" || t === "novelas") {
    path = "novels"; postType = "novels";
  } else if (t === "animes" || t === "anime") {
    path = "animes"; postType = "animes";
  } else if (t === "collections" || t === "colecciones") {
    path = "collections"; postType = "collections";
  } else if (t.indexOf("cat-") === 0 || t.indexOf("categoria-") === 0) {
    const slug = t.replace("cat-", "").replace("categoria-", "");
    const found = FEATURED_GENRES.filter(function (g) { return g.slug === slug; })[0];
    if (found) {
      genreId = found.id;
      path = "movies"; postType = "movies";
    }
  } else if (t.indexOf("genre:") === 0) {
    genreId = parseInt(t.split(":")[1], 10);
    path = "movies"; postType = "movies";
  }

  const orderBy = (opts.order === "popular" || opts.order === "views") ? "views" : "ID";
  const filterObj = (genreId && !isNaN(genreId)) ? { genres: [genreId] } : null;

  const result = await listing(path, page, orderBy, "desc", postType, 24, filterObj);
  return {
    items: result.items,
    hasMore: result.hasMore,
    page: page
  };
}

// ─── search ──────────────────────────────────────────────────────────────

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

  try {
    const kitsu = await apiGet("https://kitsu.io/api/edge/anime?filter[text]=" + q + "&page[limit]=10");
    if (kitsu && Array.isArray(kitsu.data)) {
      for (let i = 0; i < kitsu.data.length; i++) {
        const ka = kitsu.data[i];
        const attr = ka.attributes || {};
        const titles = attr.titles || {};
        const title = titles.en || titles.en_jp || attr.canonicalTitle || "Anime";
        if (items.some(function (x) { return x.title && x.title.toLowerCase() === title.toLowerCase(); })) continue;
        let year = null;
        if (attr.startDate) {
          const y = parseInt(String(attr.startDate).slice(0, 4), 10);
          if (!isNaN(y)) year = String(y);
        }
        let rating = null;
        if (attr.averageRating) {
          const r = parseFloat(attr.averageRating) / 10;
          if (!isNaN(r)) rating = parseFloat(r.toFixed(1));
        }
        items.push({
          id: "kitsu-" + ka.id,
          title: title,
          poster: (attr.posterImage && (attr.posterImage.small || attr.posterImage.original)) || null,
          backdrop: (attr.coverImage && (attr.coverImage.small || attr.coverImage.original)) || null,
          overview: attr.synopsis || null,
          type: "series",
          rating: rating,
          year: year,
          genres: ["Anime"],
          extra: { ref: "kitsu:" + ka.id, postType: "kitsu", originalId: ka.id }
        });
      }
    }
  } catch (e) {}

  return items;
}

// ─── getMeta ─────────────────────────────────────────────────────────────

function parseId(id) {
  const s = String(id || "");
  if (s.indexOf("kitsu-") === 0) return { postType: "kitsu", originalId: s.slice(6) };
  if (s.indexOf("episode-") === 0) return { postType: "episodes", originalId: s.slice(8) };
  if (s.indexOf("actor-") === 0) return { postType: "actor", originalId: s.slice(6) };
  const idx = s.indexOf("-");
  if (idx > 0) return { postType: s.slice(0, idx), originalId: s.slice(idx + 1) };
  return { postType: "movies", originalId: s };
}

async function fetchPostById(postType, originalId) {
  const data = await apiGet(
    BASE_API + "/search?q=" + encodeURIComponent(originalId) +
    "&postType=" + (postType === "episodes" ? "any" : postType) +
    "&postsPerPage=8"
  );
  if (data && data.data && Array.isArray(data.data.posts)) {
    for (let i = 0; i < data.data.posts.length; i++) {
      if (String(data.data.posts[i]._id) === String(originalId)) return data.data.posts[i];
    }
    if (data.data.posts.length) return data.data.posts[0];
  }
  return null;
}

async function loadSeasonsAndEpisodes(showId) {
  const seasons = [];
  const maxSeasonsToTry = 15;
  let foundAny = false;

  for (let sn = 1; sn <= maxSeasonsToTry; sn++) {
    const data = await apiGet(
      BASE_API + "/listing/episodes?postId=" + encodeURIComponent(showId) +
      "&season=" + sn + "&postsPerPage=100&orderBy=episode_number&order=asc"
    );
    if (!data || !data.data || !Array.isArray(data.data.posts) || data.data.posts.length === 0) {
      if (foundAny) break;
      if (sn >= 3 && !foundAny) break;
      continue;
    }
    foundAny = true;
    const eps = [];
    for (let i = 0; i < data.data.posts.length; i++) {
      const ep = data.data.posts[i];
      const num = ep.episode_number || (i + 1);
      let still = null;
      if (ep.still_path) {
        still = String(ep.still_path).indexOf("http") === 0
          ? ep.still_path
          : "https://image.tmdb.org/t/p/w500" + ep.still_path;
      }
      eps.push({
        number: num,
        id: "episode-" + ep._id,
        title: ep.title || ("Episodio " + num),
        overview: ep.overview || null,
        still: still
      });
    }
    seasons.push({
      number: sn,
      name: "Temporada " + sn,
      episodes: eps
    });

    if (data.data.seasons && Array.isArray(data.data.seasons) && data.data.seasons.length) {
      const nums = data.data.seasons.map(Number).filter(function (n) { return !isNaN(n); });
      if (nums.length) {
        const maxS = Math.max.apply(null, nums);
        if (sn >= maxS) break;
      }
    }
  }

  return seasons;
}

async function getMeta(id, opts) {
  opts = opts || {};
  if (!id) return null;

  const parsed = parseId(id);

  if (parsed.postType === "kitsu") {
    const animeRes = await apiGet("https://kitsu.io/api/edge/anime/" + encodeURIComponent(parsed.originalId));
    if (!animeRes || !animeRes.data) return null;
    const attr = animeRes.data.attributes || {};
    const titles = attr.titles || {};
    const title = titles.en || titles.en_jp || attr.canonicalTitle || "Anime";
    const totalEps = Math.min(attr.episodeCount || 24, 100);
    const offsets = [];
    for (let o = 0; o < totalEps; o += 20) offsets.push(o);
    const batches = await Promise.all(offsets.map(function (o) {
      return apiGet(
        "https://kitsu.io/api/edge/anime/" + encodeURIComponent(parsed.originalId) +
        "/episodes?page[limit]=20&page[offset]=" + o
      );
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

  const post = await fetchPostById(parsed.postType, parsed.originalId);
  if (!post) {
    return {
      id: id,
      title: "Contenido",
      type: (parsed.postType === "tvshows" || parsed.postType === "animes" || parsed.postType === "novels") ? "series" : "movie",
      extra: { ref: parsed.postType + ":" + parsed.originalId, postType: parsed.postType, originalId: parsed.originalId }
    };
  }

  const item = toItem(post);
  if (!item) return null;

  if (item.type === "series" && parsed.postType !== "collections") {
    item.seasons = await loadSeasonsAndEpisodes(parsed.originalId);
  }

  return item;
}

// ─── getStreams ──────────────────────────────────────────────────────────

function unpackDeanEdwards(html) {
  const m = String(html).match(/eval\(function\(p,a,c,k,e,d\)[\s\S]+?\.split\('\|'\)\)\)/);
  if (!m) return null;
  try {
    const fnBody = m[0].replace(/^eval/, "return ");
    return (new Function(fnBody))();
  } catch (e) {
    return null;
  }
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
    const av = (a.url || "").indexOf("vimeos") >= 0 ? 1 : 0;
    const bv = (b.url || "").indexOf("vimeos") >= 0 ? 1 : 0;
    return bv - av;
  });

  for (let i = 0; i < sorted.length; i++) {
    const embed = sorted[i];
    if (!embed || !embed.url) continue;
    if (String(embed.url).indexOf("embed.html?v=1") >= 0) continue;

    let target = embed.url;

    if (target.indexOf("videoapp.zip") >= 0) {
      try {
        const html = await apiGet(target, {
          "Referer": "https://lamovie.org/",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
        });
        if (typeof html === "string") {
          const m = html.match(/<iframe[^>]+src=["'](https?:\/\/[^"']+)["']/i);
          if (m && m[1]) target = m[1];
        }
      } catch (e) {}
    }

    if (target.indexOf("vimeos.net") >= 0 || target.indexOf("vimeos.zip") >= 0) {
      try {
        const embedHtml = await apiGet(target, {
          "Referer": "https://lamovie.org/",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
        });
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

  if (String(id).indexOf("kitsu_ep:") === 0) {
    const parts = String(id).split(":");
    const kitsuId = parts[1];
    const epNum = parseInt(parts[2], 10) || 1;
    const animeRes = await apiGet("https://kitsu.io/api/edge/anime/" + encodeURIComponent(kitsuId));
    if (!animeRes || !animeRes.data) return [];
    const attr = animeRes.data.attributes || {};
    const titles = attr.titles || {};
    const candidates = [attr.canonicalTitle, titles.en, titles.en_jp].filter(Boolean);
    for (let c = 0; c < candidates.length; c++) {
      const sRes = await apiGet(BASE_API + "/search?q=" + encodeURIComponent(candidates[c]) + "&postType=animes&postsPerPage=5");
      if (sRes && sRes.data && Array.isArray(sRes.data.posts) && sRes.data.posts.length) {
        const post = sRes.data.posts[0];
        const epData = await apiGet(
          BASE_API + "/listing/episodes?postId=" + post._id + "&season=1&episode=" + epNum + "&postsPerPage=3"
        );
        if (epData && epData.data && Array.isArray(epData.data.posts) && epData.data.posts[0]) {
          const embeds = await getPlayerEmbeds(epData.data.posts[0]._id);
          const streams = await resolveEmbeds(embeds);
          if (streams.length) return streams;
        }
        const embeds = await getPlayerEmbeds(post._id);
        const streams = await resolveEmbeds(embeds);
        if (streams.length) return streams;
      }
    }
    return [];
  }

  const parsed = parseId(id);
  let postId = parsed.originalId;

  const isSeriesType = parsed.postType === "tvshows" || parsed.postType === "animes" ||
    parsed.postType === "novels" || type === "series" || type === "tv";

  if (isSeriesType && (season != null || episode != null) && parsed.postType !== "episodes") {
    const s = season || 1;
    const e = episode || 1;
    const epData = await apiGet(
      BASE_API + "/listing/episodes?postId=" + encodeURIComponent(postId) +
      "&season=" + s + "&episode=" + e + "&postsPerPage=8"
    );
    if (epData && epData.data && Array.isArray(epData.data.posts) && epData.data.posts.length) {
      let epPost = null;
      for (let i = 0; i < epData.data.posts.length; i++) {
        const p = epData.data.posts[i];
        if (Number(p.episode_number) === Number(e)) {
          epPost = p;
          break;
        }
      }
      if (!epPost) epPost = epData.data.posts[0];
      postId = epPost._id;
    }
  }

  if (parsed.postType === "episodes") {
    postId = parsed.originalId;
  }

  const embeds = await getPlayerEmbeds(postId);
  if (!embeds.length) return [];
  return await resolveEmbeds(embeds);
}

// ─── Catálogos ───────────────────────────────────────────────────────────

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

async function getAds() {
  return [];
}

// ─── Export CommonJS (JsAddonRuntime) ─────────────────────────────────────

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
