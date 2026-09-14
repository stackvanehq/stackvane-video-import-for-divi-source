# Troubleshooting

---

## The Bulk Import Videos button is missing

Check, in this order:

1. **Is Divi 5 active?** This needs Divi 5, as the theme or the Divi Builder plugin. Divi 4 will not
   work. If Divi is missing entirely, the plugin says so with a notice on your Plugins screen.
2. **Is it a Video Slider?** The button is only on Divi's **Video Slider**, not on the single Video
   module and not on a Slider.
3. **Are you on the Content tab?** Open the **Elements** group; the button is the last item in it, under Slider Controls.
4. **Hard refresh the builder.** After activating the plugin, reload the page with the builder open
   (Ctrl/Cmd + Shift + R). The builder caches its scripts.

---

## My playlist only imported about 15 videos

That is Free mode working as intended. YouTube's public feed returns only the most recent videos for
any playlist, whatever its real size.

Add a YouTube Data API key and switch to **API** mode. See [Settings](SETTINGS.md).

---

## "That Playlist Is Private Or Empty"

Free mode can only read **public** playlists. Unlisted and private playlists are not readable
without a key, and even with one, a private playlist needs the key's account to have access.

Open the playlist in a logged-out browser window. If you cannot see it there, the plugin cannot
either.

---

## "YouTube API Request Failed"

Usually one of:

- **The key is wrong.** Re-copy it; a trailing space is enough to break it.
- **The YouTube Data API v3 is not enabled** for that Google Cloud project. Enabling a project is
  not the same as enabling the API inside it.
- **The key is restricted by HTTP referrer.** Requests come from your server, so a referrer
  restriction blocks them. Use an API restriction instead.
- **The daily quota is spent.** It resets at midnight Pacific time.

---

## Some videos were skipped

Skipped rows always say why:

| Reason | What to do |
| --- | --- |
| Not A Recognised Video URL | Check the link. Only YouTube, Vimeo and direct video files are supported. |
| Duplicate In The Pasted List | Nothing. The same video was in your list twice, and one copy was kept. |
| Already In This Slider | Nothing. It is already a slide. Use **Replace All** if you want to rebuild the slider from scratch. |

---

## "Only 18 Of 24 Videos Could Be Added"

The import finished, but some slides did not land. This is reported rather than hidden so you know
the real count.

Fetch again and import the rest; anything that did land will be skipped as **Already In This
Slider**, so you cannot end up with duplicates.

If it happens on every import, the builder may be under memory pressure. Try a smaller batch.

---

## "Too Many Imports In A Row"

There is a limit of 20 imports per minute per user, so a stuck script cannot spend your API quota.
Wait a minute and continue.

---

## No poster was generated

The Posters switch only appears when the list holds local files that have none, and only if your
account can upload to the Media Library.

If a poster was made on an earlier import, it is reused rather than made again, so no duplicate
lands in your Media Library.

If it ran but some videos still have no overlay image:

- **The file is on another site.** Browsers refuse to read a frame from a cross-origin video, so
  those are skipped. Only files on this site can be used.
- **The file would not load or decode.** A codec the browser cannot play, or a very large file over
  a slow connection, is given up on after 15 seconds so it cannot stall the whole import.

YouTube and Vimeo videos never use this: their thumbnails already arrive with the import.

---

## Drag to reorder is not working

Drag rows by the handle on the left, not by the title, which is a text field.

If dragging is awkward, focus the handle with Tab and use the **Up** and **Down** arrow keys
instead.

---

## My custom title was replaced

Titles you type are used exactly as written and are never touched by the cleaning options. But note:

- Clearing the field on purpose restores the fetched title.
- Turning **Name Each Slide** off drops all titles, including yours.

---

## Titles look wrong

- **Titles are all "Video Slider Item"**: the **Add Video Title** switch was off during the import.
  Turn it on and reimport.
- **Emojis or odd characters in the labels**: tick **Remove Emojis** or **Remove Special
  Characters** before importing. Toggling them updates the preview immediately.
- **The label is right but the slide shows nothing**: the label is only a name. Check the video URL
  in the slide's Content tab.

---

## A video plays in the builder but not on the live page

The slide is a native Divi Video Slider Item, so this is a Divi or source question, not an import
one. Check that the video is public and, for a self-hosted file, that the URL opens directly in a
browser.

---

## Nothing here helped

Open an issue with:

- your WordPress, PHP and Divi versions,
- which tab and mode you used,
- one example URL that fails,
- what the preview list said, if anything.
