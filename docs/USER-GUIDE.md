# User Guide

Everything the Bulk Import Videos window does, in the order you meet it.

---

## 1. Opening it

1. Edit a page with the Divi Builder.
2. Add a **Video Slider** module, or open one you already have.
3. Open the **Content** tab and expand the **Elements** group.
4. Click **Bulk Import Videos**, the last item in that group.

If the button is not there, see [Troubleshooting](TROUBLESHOOTING.md).

---

## 2. The three tabs

The tabs are grouped by where the videos come from.

### Media Library

For videos already on your site.

Click **Choose Videos** and WordPress opens its own media window, filtered to video, with
multi-select on. Pick as many as you like. To add new files, use that window's **Upload Files** tab;
they land in your Media Library and can be selected in the same step.

Nothing is fetched and no API key is needed. Titles come from the Media Library.

### External Videos

For videos hosted elsewhere. Choose one of two inputs:

**URL List**: one video URL per line. Commas work too, blank lines are ignored.

```text
https://www.youtube.com/watch?v=dQw4w9WgXcQ
https://vimeo.com/123456789
https://example.com/media/intro.mp4
```

**YouTube Playlist**: one playlist URL, or just its ID.

```text
https://www.youtube.com/playlist?list=PLxxxxxxxxxxxxxxxx
PLxxxxxxxxxxxxxxxx
```

The playlist must be public.

### History

Every import you have run, if you turned history on. Each row has two buttons:

- **Reimport**: loads that import's videos back into the list, ready to add to whichever slider you
  have open now. Nothing is refetched, so it costs no API quota.
- **Delete**: removes that entry.

History is **off by default**. See [Settings](SETTINGS.md).

---

## 3. Detail Level (External Videos only)

| | Free | API |
| --- | --- | --- |
| Needs an API key | No | Yes |
| Title and thumbnail | Yes | Yes |
| Duration and view count | Vimeo only | Yes, for YouTube |
| Videos returned from a playlist | About 15 most recent | The full playlist, up to 400 |

**Free** reads each video's public data and needs no setup.

**API** uses a YouTube Data API key you save once. Pick it when you need a whole playlist, or real
durations and view counts. Choosing API without a saved key does not fail: it falls back to the free
method and says so.

This section does not appear on the Media Library tab, because local files need neither.

---

## 4. Titles

Each video's title becomes that slide's **Element Label**, the name you see in the layers panel.
Without it, a slider of forty videos is forty rows all called "Video Slider Item".

**Name Each Slide** controls this:

- **On** (default): the title is used, and the cleaning options appear.
- **Off**: no label is set and Divi's own default is left alone.

| Option | What it does |
| --- | --- |
| **Remove Emojis** | Strips emoji and pictographic symbols. On by default, because emoji-heavy titles are unreadable in a narrow panel. |
| **Remove Special Characters** | Keeps letters, numbers, spaces and basic punctuation. |
| **Title Case** | Capitalises the first letter of each word. |

Toggling any of these re-labels the list instantly. Nothing is refetched, and unticking an option
restores the original title.

---

## 5. Posters

This section appears only when the list holds local files with no poster image, and only if you can
upload to the Media Library.

**Generate A Poster For N Videos** grabs a frame from each file, saves it to your Media Library, and
sets it as that slide's Overlay Image.

It is **off by default**, because every poster it makes is a new Media Library attachment.

Importing the same video again does not make a second one: an existing poster is found and reused.

Two things worth knowing:

- It only works for files **on this site**. Browsers do not allow reading a frame from a video
  hosted elsewhere, so an external MP4 is skipped and imports without a poster.
- YouTube and Vimeo never need this. Their thumbnails already arrive with the import.

---

## 6. Fetch, review, import

On **External Videos**, press **Fetch Videos**. A loader covers the window while it works. On
**Media Library**, the list appears as soon as you choose.

You then get a list showing each video's thumbnail, title, source and duration. Anything that cannot
be imported stays in the list with the reason, struck through:

| Reason | Meaning |
| --- | --- |
| Not A Recognised Video URL | Not YouTube, Vimeo or a supported file type |
| Duplicate In The Pasted List | The same video appears twice in what you pasted |
| Listed Twice In This Playlist | The same video appears twice in the playlist |
| Selected Twice | The same file was chosen twice |
| Already In This Slider | That video is already a slide in this module |

### Reordering

Drag any row by its handle to change the order. That order is the order the slides are created in.

You can also focus a handle and use the **Up** and **Down** arrow keys, so reordering does not need
a mouse.

### Removing

Hover any row and click the cross on the right to drop that video from the batch. Nothing has been
created yet, so nothing is undone: it simply will not be imported.

### Renaming

Click any title and type. Your title is used exactly as written: the cleaning options do not touch
it. Clear the field and the fetched title comes back, and the placeholder shows the file's own name
so you always know which video a row is.

Titles stay attached to their video, so reordering never moves a title onto the wrong one.

### Placement

- **Append**: added after the slides already there.
- **Replace All**: the existing slides are removed first.

Then press **Import N Videos**. Posters are generated first if you asked for them, then a progress
bar counts each slide as it is created. Do not close the window until it finishes.

When it is done you get a count. If fewer landed than were attempted, it says so plainly rather than
claiming success.

---

## 7. After importing

Each slide is an ordinary **Video Slider Item**. Open one and you will find:

- **Video**: the URL, in the module's own video field.
- **Overlay**: the thumbnail or generated poster.
- **Meta > Element Label**: the title.

Style them from the Design tab exactly as you would any Divi slide. Deactivating this plugin later
does not affect them.
