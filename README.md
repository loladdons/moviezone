# MovieZone – Plugin adaptado para tu app

Plugin completo portado desde el plugin original de Kino (LaMovie) a la interfaz de tu `ContentService`.

## Métodos implementados

| Método de tu app          | Descripción                                      |
|---------------------------|--------------------------------------------------|
| `getHome()`               | Filas de inicio (hero, populares, géneros…)      |
| `getNews()`               | Novedades rápidas                                |
| `getDiscoverFilters()`    | Filtros (tipo, género, orden)                    |
| `getDiscover(opts)`       | Listado paginado con filtros                     |
| `search(query)`           | Búsqueda global + Kitsu + actores                |
| `getMeta(id, opts?)`      | Detalles + temporadas/episodios                  |
| `getStreams(id, type, season, episode)` | Servidores HLS (m3u8) + subtítulos     |
| `getCatalogs()`           | Lista de catálogos                               |
| `getCatalog(id, opts)`    | Items de un catálogo                             |
| `getAds()`                | (vacío por ahora)                                |

## Cómo instalarlo en tu app

1. Copia `plugin.js` como el `jsCode` del repositorio.
2. Usa el `manifest.json` como base del `RepoManifest`.
3. Icono y banner incluidos (`icon.png`, `banner.jpg`).

### Ejemplo de instalación (conceptual)

```dart
final repo = InstalledRepo(
  manifest: RepoManifest.fromJson({
    "id": "moviezone",
    "name": "MovieZone",
    "version": "1.0.0",
    // ...
  }),
  jsCode: await rootBundle.loadString('assets/plugins/moviezone/plugin.js'),
  userConfig: {}, // este plugin no requiere config
);
```

## Formato de datos devuelto

Compatible con tus parsers actuales:

- **HomeRow**: `{ id, title, type: "hero"|"row", imageStyle, items: ContentItem[] }`
- **ContentItem**: `{ id, title, poster, backdrop, overview, type, rating, year, genres, seasons?, extra? }`
- **StreamServer**: `{ url, name, quality, language, type: "hls", headers, subtitles? }`
- **DiscoverPage**: `{ items, hasMore, page }`

## Notas importantes

- El runtime debe proporcionar `kino.fetch` **o** `fetch` global.
- Los streams se resuelven desde embeds de `vimeos.net` (Dean Edwards unpacker + extracción de `.m3u8`).
- IDs estables: `movies-12345`, `tvshows-6789`, `kitsu-xxx`, `actor-yyy`, `episode-zzz`.
- No requiere configuración de usuario (`configSchema` vacío).

## Origen

Adaptación del plugin oficial de Kino:
https://github.com/sebasmc214-ship-it/kino_plugin_moviezone
