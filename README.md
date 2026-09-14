# StackVane Video Import for Divi

Bulk-add videos to Divi's Video Slider from your Media Library, a URL list, or a YouTube playlist, with no new module and no lock-in.

Divi 5 already ships a Video Slider. Building one is the slow part: add a slide, paste a URL, type a
title, repeat forty times. This plugin adds a single button to that module's Content tab. Paste your
URLs, or one YouTube playlist link, and every video becomes a slide.

**It registers no new module.** Divi's own Video Slider and Video Slider Item stay exactly what they
are, so your layouts remain native Divi and nothing breaks if you deactivate this plugin.

---

## Features

- **Three ways in**: pick from your Media Library, paste a list of URLs, or expand a whole YouTube
  playlist.
- **Upload as you go**: the Media Library window's own Upload Files tab works from inside the
  importer.
- **Mix sources freely**: YouTube, Vimeo and self-hosted MP4/WEBM in the same batch.
- **Fills in the details**: video URL, thumbnail, and the title as the Element Label, so the layers
  panel is readable instead of forty rows called "Video Slider Item".
- **Generates posters**: grabs a real frame from local video files and saves it as the overlay
  image, which Divi itself cannot do for self-hosted video. An existing poster is reused rather
  than duplicated.
- **Skips duplicates**: checks the batch and the videos already in that slider.
- **Reorder before you commit**: drag any row, or use the arrow keys.
- **Rename anything**: click a title and type your own.
- **Drop what you do not want**: remove a row before any slide is created.
- **Tidies titles**: optionally strip emojis, strip special characters, or force Title Case.
- **Append or replace**: add to the existing slides, or clear them first.
- **Preview first**: everything is listed with thumbnails, durations and skip reasons before a
  single slide is created.
- **Optional import history**: off by default; turn it on and a past import can be added to another
  slider later without fetching it again.

## Requirements

| Requirement | Version |
| --- | --- |
| WordPress | 6.0 or later |
| PHP | 7.4 or later |
| Divi | **Divi 5**, as the theme or the Divi Builder plugin |

## Installation

1. Install it from [WordPress.org](https://wordpress.org/plugins/stackvane-video-import-for-divi/),
   or clone this repository into `wp-content/plugins/`.
2. Activate **StackVane Video Import for Divi** from the Plugins screen.
3. Edit a page with the Divi Builder, add or open a **Video Slider** module, and open its **Content**
   tab. A **Bulk Import Videos** button appears there.

## Usage

Click **Bulk Import Videos** and pick a tab:

- **Media Library**: choose or upload videos already on your site.
- **External Videos**: paste a URL list, or one YouTube playlist link.
- **History**: reuse a past import.

Review the list, drag to reorder, rename anything you want, then **Import**.

Full walkthrough: [docs/USER-GUIDE.md](docs/USER-GUIDE.md)

## Free vs API mode

| Capability | Free | API |
| --- | --- | --- |
| API key needed | No | Yes |
| Title and thumbnail | Yes | Yes |
| Duration and views | Vimeo only | Yes |
| Playlist size | ~15 most recent | Full playlist, up to 400 |

API mode needs a free YouTube Data API key, saved once under
**Divi → Theme Options → StackVane Video Import for Divi**. See [docs/SETTINGS.md](docs/SETTINGS.md).

## Supported URLs

- **YouTube**: `watch?v=`, `youtu.be/`, `/shorts/`, `/embed/`
- **Vimeo**: `vimeo.com/123456789`
- **Direct files**: `.mp4`, `.webm`, `.ogv`, `.ogg`, `.mov`

Anything else is listed as unrecognised and skipped.

## Privacy

This plugin stores no personal data and creates no database tables. It talks to YouTube and Vimeo
only, and only to read the public data for the URLs you paste. Import history is **off by default**;
when enabled it records only the video URLs and titles you imported, in a single WordPress option.

## Documentation

- [User guide](docs/USER-GUIDE.md), every tab, option and workflow
- [Settings](docs/SETTINGS.md), the API key and history options
- [Troubleshooting](docs/TROUBLESHOOTING.md), what to do when an import misbehaves

## Building from source

This repository is the public source of the plugin published on WordPress.org. It holds the built
assets in `dist/`, so a clone is ready to activate, and everything they are built from:

| Built file | Source | Built by |
| --- | --- | --- |
| `dist/builder.min.js` | `client/builder/` | webpack, `webpack.config.js` |
| `dist/builder.min.css` | `client/builder/builder.css` | `toolchain/build-css.js` (clean-css, level 1) |
| `languages/*.pot` | `src/`, `client/builder/` | `toolchain/build-pot.js` |

To rebuild after changing anything under `client/`:

```bash
npm ci
npm run build
```

`npm run dev` watches `client/` and rebuilds on change.

## Contributing

Issues and pull requests are welcome.

## License

GPL-2.0-or-later. See [license.txt](license.txt).
