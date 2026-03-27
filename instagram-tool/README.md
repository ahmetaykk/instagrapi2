# Instagram Tool

A FastAPI backend + Web Dashboard + Chrome Extension built on top of the `instagrapi` library.

---

## Project Structure

```
instagrapi/
├── .venv/                         ← shared virtual environment
└── instagram-tool/
    ├── run.py                     ← one-command launcher
    ├── backend/
    │   ├── main.py                # FastAPI server
    │   ├── requirements.txt       # Python dependencies
    │   ├── session.json           # Session info (auto-generated)
    │   ├── publish_queue.json     # Scheduled posts queue
    │   └── uploads/               # Temporary upload folder
    ├── web/
    │   ├── index.html
    │   ├── app.js
    │   └── style.css
    └── extension/
        ├── manifest.json
        ├── background.js
        ├── popup.html
        ├── popup.js
        ├── content.js
        └── insta.png
```

---

## Getting Started

```bash
python3 instagrapi/instagram-tool/run.py
```

`run.py` automatically:
1. Checks for `instagrapi/.venv` virtual environment, creates if missing
2. Installs required packages
3. Finds an available port (8000–9000 range)
4. Starts the FastAPI server
5. Opens the web interface in your browser

---

## Chrome Extension Setup

1. Go to `chrome://extensions` in Chrome
2. Enable **Developer mode** in the top right
3. Click **Load unpacked**
4. Select the `instagrapi/instagram-tool/extension` folder

The extension automatically finds the correct backend port (scans 8000–8010 range) even if it changes.

---

## Web Dashboard Pages

### Dashboard
- Follower, following, and post statistics cards
- Smart search: URL / `@username` / `#hashtag` / location

### Search Profile
- Search profiles by username
- Follow / Unfollow / View Followers / View Following

### Download
- Download posts / reels / videos / albums / stories
- Automatic preview card when URL is entered
- Hashtag and location-based media search
- Recently downloaded section

### Downloads
- List all downloaded files with thumbnails, size, and date
- Photo / Video filters
- Show in folder (Finder) and delete file

### Saved
- Saved posts and collections tabs
- Fetch dropdown: 20 / 50 / 100 / 200 / All
- Bulk download and remove from saved

### Followers
- Followers / Following / Not Following Back / Mutual tabs
- Bulk unfollow from CSV
- Filtering, sorting, CSV export

### Explore
- Search by `#hashtag`, `@username`, location name and view media grid

### Messages
- Send DMs, view inbox

### Scheduler
- Auto-download stories for specific users
- Minute-based interval settings

### Publish
- **Media types:** Photo, Video, Reel, Album (max 10), Story Photo, Story Video
- Drag & drop or click to upload files with instant preview
- Caption editor (2200 character limit)
- Location search and tagging
- User mentions (@mention)
- **Scheduled posts:** select date/time, auto-posts in background
- Post queue: status tracking (Scheduled / Posted / Error)

---

## Chrome Extension Features

- Smart search: URL / `@username` / `#hashtag` / location
- Automatic preview card when URL is entered
- View and download saved posts
- List of downloaded files
- Download buttons on Instagram pages:
  - Feed: ⬇ button on each post's action bar
  - Post/Reel modal: ⬇ button next to bookmark
  - Reels page: ⬇ overlay at bottom right of videos

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/login` | Login |
| POST | `/logout` | Logout |
| GET | `/me` | Session info |
| POST | `/challenge/submit` | Verify 2FA/challenge code |
| GET | `/profile/{username}` | Profile info |
| GET | `/friendship/{username}` | Follow status |
| POST | `/follow` | Follow user |
| POST | `/unfollow` | Unfollow user |
| POST | `/remove-follower` | Remove follower |
| GET | `/followers/{username}` | Followers list |
| GET | `/following/{username}` | Following list |
| POST | `/followers/page` | Paginated followers fetch |
| POST | `/following/page` | Paginated following fetch |
| POST | `/download/post` | Download post / reel / album |
| GET | `/download/stories/{username}` | Download stories |
| POST | `/media/info` | Media preview info |
| GET | `/saved` | List saved posts |
| GET | `/saved/collections` | List collections |
| GET | `/saved/collection/{pk}` | Collection media |
| POST | `/download/saved` | Download saved post |
| POST | `/unsave` | Remove from saved |
| GET | `/search/users/{query}` | Search users |
| POST | `/search/hashtag` | Search hashtags |
| GET | `/search/location/{query}` | Search locations |
| GET | `/location/medias/{pk}` | Location media |
| GET | `/downloads/list` | List downloaded files |
| DELETE | `/downloads/file/{path}` | Delete downloaded file |
| GET | `/downloads/open-folder` | Open folder in Finder |
| GET | `/inbox` | Inbox |
| POST | `/dm/send` | Send DM |
| POST | `/schedulers` | Add scheduler |
| GET | `/schedulers` | List schedulers |
| DELETE | `/schedulers/{username}` | Remove scheduler |
| POST | `/publish/upload` | Upload single file |
| POST | `/publish/upload-album` | Upload album files |
| POST | `/publish/now` | Publish now |
| POST | `/publish/schedule` | Add scheduled post |
| GET | `/publish/queue` | List publish queue |
| DELETE | `/publish/queue/{id}` | Remove from queue |
| GET | `/proxy/image` | Instagram CDN image proxy |

---

## Download Folders

```
~/Downloads/instagram/
├── (posts and reels)
├── stories/
├── saved/
└── scheduled/{username}/
```

---

## Notes

- `run.py` searches for an available port on each run — no fixed port needed
- Instagram challenge / 2FA will show an automatic verification dialog on the login screen
- Too many requests may temporarily restrict your account by Instagram
- Scheduled post worker checks the queue every 30 seconds
