# Settings

This plugin adds no admin menu of its own. Its two settings live on Divi's own Theme Options screen,
under a tab named **StackVane Video Import for Divi**.

**Divi → Theme Options → StackVane Video Import for Divi**

There is also a **Settings** link on the plugin's row on the Plugins screen, which goes to the same
place.

---

## YouTube Data API Key

Optional. Leave it empty and the plugin works in Free mode.

Add a key to unlock **API mode**, which returns:

- the **full** playlist instead of roughly the 15 most recent videos (up to 400),
- real **durations** and **view counts** for YouTube videos.

### Getting a key

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a project, or pick an existing one.
3. Open **APIs & Services → Library**, search for **YouTube Data API v3**, and enable it.
4. Open **APIs & Services → Credentials**, then **Create Credentials → API key**.
5. Copy the key and paste it into the field.

The key is free. Google gives each project a daily quota, which normal importing does not come
close to using.

### Restricting the key

Google lets you restrict a key so it cannot be misused if it leaks. Under the key's settings:

- **API restrictions**: restrict to **YouTube Data API v3**.
- **Application restrictions**: leave as **None**. The requests come from your server, not a
  browser, so an HTTP-referrer restriction would block them.

### How it is stored

The key is saved by Divi, in Divi's own Theme Options, as a password field. It is masked once
saved, is never sent to the browser, and never appears in your page source. All requests that use
it run on your server.

---

## Save Import History

**Off by default.**

Turn it on and every import is recorded, so you can add the same set of videos to a different slider
later without fetching them again. The History tab in the import window is where you use it.

Each entry stores the video URLs and titles from that import, nothing about who ran it beyond the
WordPress user ID.

Turning it back **off** stops new records. Entries already saved stay until you delete them from the
History tab, so nothing disappears behind your back.

Limits, so the record cannot grow without bound:

- the 30 most recent imports are kept,
- each entry keeps up to 200 videos.

---

## Generating posters

There is no setting for this. The option appears inside the import window itself, and only when the
videos you are importing are local files with no poster image.

It needs permission to upload to the Media Library, so an account without that capability does not
see it.

---

## Removing everything

Deleting the plugin from the Plugins screen removes:

- its API key from Divi's Theme Options (only that one key; the rest of your Divi settings are left
  alone),
- the import history,
- its cached video data.

Deactivating alone changes nothing.
