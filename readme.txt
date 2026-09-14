=== StackVane Video Import for Divi ===
Contributors: stackvanehq
Tags: divi, video slider, youtube, vimeo, bulk import
Requires at least: 6.0
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Bulk-add videos to Divi's Video Slider from your Media Library, a URL list, or a YouTube playlist, with no new module and no lock-in.

== Description ==

Divi 5 already ships a Video Slider. Building one is the slow part: add a slide, paste a URL, type a
title, repeat forty times.

This plugin adds a single button to that module's Content tab. Click **Bulk Import Videos**, choose
where your videos are coming from, and every one of them becomes a slide.

It registers no new module. Divi's own Video Slider and Video Slider Item stay exactly what they
are, so your layouts remain 100% native Divi and nothing breaks if you ever deactivate this plugin.

**Three ways to add videos**

* **Media Library**: pick as many existing videos as you like, or upload new ones without leaving
  the window.
* **External Videos**: paste a list of URLs, one per line, mixing YouTube, Vimeo and direct
  MP4/WEBM freely.
* **YouTube Playlist**: paste one playlist link and import the whole thing.

**Review before anything is created**

Everything is listed first, with thumbnails, durations and the reason for anything that will be
skipped. From that list you can:

* **Drag rows to reorder them**, or move them with the arrow keys.
* **Click any title and write your own.**
* **Drop anything you changed your mind about**, before a single slide exists.
* Choose **Append** to add to the existing slides, or **Replace All** to start clean.

**It fills in the details**

Each slide gets its video URL, its thumbnail, and its title as the Element Label, so your layers
panel is readable instead of forty rows called "Video Slider Item". Titles can be tidied on the way
in: strip emojis, strip special characters, or force Title Case.

**It can generate posters for self-hosted video**

Divi cannot make a thumbnail from an MP4; its Generate From Video button only resolves YouTube and
Vimeo. This plugin can grab a real frame from a video file on your site, save it to your Media
Library, and use it as the slide's overlay image. Import the same video again and the poster it
already made is reused, so your Media Library does not fill up with copies.

**Duplicates are caught**

Every import is checked against both the batch itself and the videos already in that slider, so
importing twice never doubles anything.

**Free and API modes**

Free mode needs no key. It reads each video's public oEmbed data for a title and thumbnail, and for
playlists it reads the public feed, which returns roughly the 15 most recent videos.

API mode uses a YouTube Data API key you save once. It returns the full playlist, up to 400 videos,
plus real durations and view counts.

**Optional import history**

Off by default. Turn it on and any past import can be added to a different slider later without
fetching it again.

**Requirements**

Divi 5, as either the theme or the Divi Builder plugin. Without it the plugin stays inert and tells
you so.

== External Services ==

This plugin contacts third-party services to look up the details of the videos you ask it to
import. Nothing is sent anywhere until you paste a URL and press Fetch Videos, nothing about you or
your site is transmitted, and no data is sent at all when you import from your own Media Library.

**YouTube (Google)**

* What it is used for: reading a YouTube video's title and thumbnail, and reading the contents of a
  public playlist.
* When it is called: only when you fetch YouTube URLs or a YouTube playlist.
* What is sent: the video or playlist ID taken from the URL you pasted. In API mode, the YouTube
  Data API key you saved is sent with the request.
* Endpoints: `https://www.youtube.com/oembed`, `https://www.youtube.com/feeds/videos.xml`, and in
  API mode `https://www.googleapis.com/youtube/v3/`.
* Terms of Service: https://www.youtube.com/t/terms and https://policies.google.com/terms
* Privacy Policy: https://policies.google.com/privacy

**Vimeo**

* What it is used for: reading a Vimeo video's title, thumbnail and duration.
* When it is called: only when you fetch Vimeo URLs.
* What is sent: the Vimeo URL you pasted.
* Endpoint: `https://vimeo.com/api/oembed.json`
* Terms of Service: https://vimeo.com/terms
* Privacy Policy: https://vimeo.com/privacy

Direct video files (MP4, WEBM and the rest) are never sent anywhere. Their title is read from the
filename, and a poster image, if you ask for one, is generated inside your own browser and saved to
your own Media Library.

== Source Code ==

The PHP in this plugin is shipped as written. The two files in `dist/` are minified builds, and
their readable source, together with the build tools that produce them, is public at:

https://github.com/stackvanehq/stackvane-video-import-for-divi-source

* `dist/builder.min.js` is webpack's production bundle of `client/builder/index.js` and the modules
  it imports, using the repository's `webpack.config.js`.
* `dist/builder.min.css` is `client/builder/builder.css` with whitespace removed by clean-css at
  level 1. Nothing is reordered or restructured, so the two read the same.

To rebuild both, clone the repository, then run `npm ci` and `npm run build`.

Every third-party library the bundle uses at run time is a webpack external, listed in
`webpack.config.js`, so it is supplied by WordPress or Divi rather than compiled in. `license.txt`
names them.

No minifier, obfuscator or build step hides anything: the compiled files are the same code with
whitespace and local names removed.

== Installation ==

1. Make sure Divi 5 is active (the theme or the Divi Builder plugin).
2. Upload the `stackvane-video-import-for-divi` folder to `/wp-content/plugins/`, or install the zip from Plugins > Add New.
3. Activate the plugin.
4. Edit a page with the Divi Builder, add or open a **Video Slider** module, open its **Content** tab, and expand **Elements**. A **Bulk Import Videos** button is the last item in that group.
5. Optional: for full playlists and real durations, add a YouTube Data API key under **Divi > Theme Options > StackVane Video Import for Divi**.

== Frequently Asked Questions ==

= Does this add a new module? =

No. It extends the Video Slider that Divi 5 already ships. Every slide it creates is an ordinary Video Slider Item, indistinguishable from one you added by hand.

= What happens if I deactivate the plugin? =

Nothing to your layouts. The slides are native Divi modules and keep working. You only lose the import button.

= Why does my playlist only import about 15 videos? =

That is Free mode. YouTube's public feed returns only the most recent videos for any playlist. Add a YouTube Data API key and the same playlist imports in full.

= Where do I get a YouTube Data API key? =

From the Google Cloud Console: create a project, enable the **YouTube Data API v3**, and create an API key. Paste it under Divi > Theme Options > StackVane Video Import for Divi.

= Is my API key safe? =

It is stored by Divi itself, in Divi's own Theme Options, masked once saved. It is never sent to the browser and never appears in the page source. The import runs server side.

= What URLs are supported? =

YouTube (`watch?v=`, `youtu.be`, `/shorts/`, `/embed/`), Vimeo, and direct video files (`.mp4`, `.webm`, `.ogv`, `.ogg`, `.mov`). Anything else is listed as unrecognised and skipped.

= Can I reorder or rename the videos before importing? =

Yes. Drag any row in the list to reorder it, or focus its handle and use the arrow keys. Click any
title to write your own; your text is used exactly as typed.

= Can it make thumbnails for my own MP4 files? =

Yes. Turn on Generate Posters and it grabs a frame from each file, saves it to your Media Library,
and sets it as the slide's overlay image. This only works for files hosted on your own site, because
browsers do not allow reading a frame from a video on another domain.

= Will it fill my Media Library with duplicate posters? =

No. A generated poster is looked up before anything is made, so importing the same video a second
time reuses the poster from the first.

= Does it work with Divi 4? =

No. This uses Divi 5's builder APIs and requires Divi 5.

= Does it slow down my site? =

No. The plugin loads nothing on the front end and nothing in wp-admin. Its code runs only inside the Divi Visual Builder.

== Screenshots ==

1. The Bulk Import Videos button on the Video Slider's Content tab.
2. Pasting a list of URLs, with the preview list and skip reasons.
3. Importing a whole YouTube playlist.
4. The settings under Divi > Theme Options.

== Changelog ==

= 1.0.0 =
* Initial release.
