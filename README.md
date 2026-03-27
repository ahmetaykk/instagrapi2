[![Package](https://github.com/subzeroid/instagrapi/actions/workflows/python-package.yml/badge.svg?branch=master&1)](https://github.com/subzeroid/instagrapi/actions/workflows/python-package.yml)
[![PyPI](https://img.shields.io/pypi/v/instagrapi)](https://pypi.org/project/instagrapi/)
![PyPI - Python Version](https://img.shields.io/pypi/pyversions/instagrapi)
![Checked with mypy](https://img.shields.io/badge/mypy-checked-blue)

Features:

* Getting public data of user, posts, stories, highlights, followers and following users
* Getting public email and phone number, if the user specified them in his business profile
* Getting public data of post, story, album, Reels, IGTV data and the ability to download content
* Getting public data of hashtag and location data, as well as a list of posts for them
* Getting public data of all comments on a post and a list of users who liked it
* Management of proxy, mobile devices and challenge resolver
* Login by username and password, sessionid and support 2FA
* Managing messages and threads for Direct and attach files
* Download and upload a Photo, Video, IGTV, Reels, Albums and Stories
* Work with Users, Posts, Comments, Insights, Collections, Location and Hashtag
* Insights by account, posts and stories
* Like, following, commenting, editing account (Bio) and much more else

# instagrapi - Unofficial Instagram API for Python

Fast and effective Instagram Private API wrapper (public+private requests and challenge resolver) without selenium. Use the most recent version of the API from Instagram, which was obtained using reverse-engineering with Charles Proxy and Proxyman.

*Instagram API valid for 25 May 2025 (last reverse-engineering check)*

Support Python >= 3.9

[Support Chat in Telegram](https://t.me/instagrapi) and [GitHub Discussions](https://github.com/subzeroid/instagrapi/discussions)


## Features

1. Performs Web API or Mobile API requests depending on the situation (to avoid Instagram limits)
2. Login by username and password, including 2FA and by sessionid (and uses Authorization header instead Cookies)
3. Challenge Resolver have Email and SMS handlers
4. Support upload a Photo, Video, IGTV, Reels, Albums and Stories
5. Support work with User, Media, Comment, Insights, Collections, Location (Place), Hashtag and Direct Message objects
6. Like, Follow, Edit account (Bio) and much more else
7. Insights by account, posts and stories
8. Build stories with custom background, font animation, link sticker and mention users
9. In the next release, account registration and captcha passing will appear

### Installation

```
pip install instagrapi
```

### Basic Usage

``` python
from instagrapi import Client

cl = Client()
cl.login(ACCOUNT_USERNAME, ACCOUNT_PASSWORD)

user_id = cl.user_id_from_username(ACCOUNT_USERNAME)
medias = cl.user_medias(user_id, 20)
```

### Session with persistence

``` python
from instagrapi import Client

cl = Client()
cl.login(USERNAME, PASSWORD)
cl.dump_settings("session.json")

# reload later without entering credentials again
cl = Client()
cl.load_settings("session.json")
cl.login(USERNAME, PASSWORD)
```

### Login using a sessionid

``` python
from instagrapi import Client

cl = Client()
cl.login_by_sessionid("<your_sessionid>")
```

### List and download another user's posts

``` python
from instagrapi import Client

cl = Client()
cl.login(USERNAME, PASSWORD)

target_id = cl.user_id_from_username("target_user")
posts = cl.user_medias(target_id, amount=10)
for media in posts:
    # download photos to the current folder
    cl.photo_download(media.pk)
```
See [examples/session_login.py](examples/session_login.py) for a standalone script demonstrating these login methods.


<details>
    <summary>Additional example</summary>

```python
from instagrapi import Client
from instagrapi.types import StoryMention, StoryMedia, StoryLink, StoryHashtag

cl = Client()
cl.login(USERNAME, PASSWORD, verification_code="<2FA CODE HERE>")

media_pk = cl.media_pk_from_url('https://www.instagram.com/p/CGgDsi7JQdS/')
media_path = cl.video_download(media_pk)
subzeroid = cl.user_info_by_username('subzeroid')
hashtag = cl.hashtag_info('dhbastards')

cl.video_upload_to_story(
    media_path,
    "Credits @subzeroid",
    mentions=[StoryMention(user=subzeroid, x=0.49892962, y=0.703125, width=0.8333333333333334, height=0.125)],
    links=[StoryLink(webUri='https://github.com/subzeroid/instagrapi')],
    hashtags=[StoryHashtag(hashtag=hashtag, x=0.23, y=0.32, width=0.5, height=0.22)],
    medias=[StoryMedia(media_pk=media_pk, x=0.5, y=0.5, width=0.6, height=0.8)]
)
```
</details>

## Documentation

* [Index](https://subzeroid.github.io/instagrapi/)
* [Getting Started](https://subzeroid.github.io/instagrapi/getting-started.html)
* [Usage Guide](https://subzeroid.github.io/instagrapi/usage-guide/fundamentals.html)
* [Interactions](https://subzeroid.github.io/instagrapi/usage-guide/interactions.html)
  * [`Media`](https://subzeroid.github.io/instagrapi/usage-guide/media.html) - Publication (also called post): Photo, Video, Album, IGTV and Reels
  * [`Resource`](https://subzeroid.github.io/instagrapi/usage-guide/media.html) - Part of Media (for albums)
  * [`MediaOembed`](https://subzeroid.github.io/instagrapi/usage-guide/media.html) - Short version of Media
  * [`Account`](https://subzeroid.github.io/instagrapi/usage-guide/account.html) - Full private info for your account (e.g. email, phone_number)
  * [`TOTP`](https://subzeroid.github.io/instagrapi/usage-guide/totp.html) - 2FA TOTP helpers (generate seed, enable/disable TOTP, generate code as Google Authenticator)
  * [`User`](https://subzeroid.github.io/instagrapi/usage-guide/user.html) - Full public user data
  * [`UserShort`](https://subzeroid.github.io/instagrapi/usage-guide/user.html) - Short public user data (used in Usertag, Comment, Media, Direct Message)
  * [`Usertag`](https://subzeroid.github.io/instagrapi/usage-guide/user.html) - Tag user in Media (coordinates + UserShort)
  * [`Location`](https://subzeroid.github.io/instagrapi/usage-guide/location.html) - GEO location (GEO coordinates, name, address)
  * [`Hashtag`](https://subzeroid.github.io/instagrapi/usage-guide/hashtag.html) - Hashtag object (id, name, picture)
  * [`Collection`](https://subzeroid.github.io/instagrapi/usage-guide/collection.html) - Collection of medias (name, picture and list of medias)
  * [`Comment`](https://subzeroid.github.io/instagrapi/usage-guide/comment.html) - Comments to Media
  * [`Highlight`](https://subzeroid.github.io/instagrapi/usage-guide/highlight.html) - Highlights
  * [`Notes`](https://subzeroid.github.io/instagrapi/usage-guide/notes.html) - Notes
  * [`Story`](https://subzeroid.github.io/instagrapi/usage-guide/story.html) - Story
  * [`StoryLink`](https://subzeroid.github.io/instagrapi/usage-guide/story.html) - Link Sticker
  * [`StoryLocation`](https://subzeroid.github.io/instagrapi/usage-guide/story.html) - Tag Location in Story (as sticker)
  * [`StoryMention`](https://subzeroid.github.io/instagrapi/usage-guide/story.html) - Mention users in Story (user, coordinates and dimensions)
  * [`StoryHashtag`](https://subzeroid.github.io/instagrapi/usage-guide/story.html) - Hashtag for story (as sticker)
  * [`StorySticker`](https://subzeroid.github.io/instagrapi/usage-guide/story.html) - Tag sticker to story (for example from giphy)
  * [`StoryBuild`](https://subzeroid.github.io/instagrapi/usage-guide/story.html) - [StoryBuilder](/instagrapi/story.py) return path to photo/video and mention co-ordinates
  * [`DirectThread`](https://subzeroid.github.io/instagrapi/usage-guide/direct.html) - Thread (topic) with messages in Direct Message
  * [`DirectMessage`](https://subzeroid.github.io/instagrapi/usage-guide/direct.html) - Message in Direct Message
  * [`Insight`](https://subzeroid.github.io/instagrapi/usage-guide/insight.html) - Insights for a post
  * [`Track`](https://subzeroid.github.io/instagrapi/usage-guide/track.html) - Music track (for Reels/Clips)
* [Best Practices](https://subzeroid.github.io/instagrapi/usage-guide/best-practices.html)
* [Development Guide](https://subzeroid.github.io/instagrapi/development-guide.html)
* [Handle Exceptions](https://subzeroid.github.io/instagrapi/usage-guide/handle_exception.html)
* [Challenge Resolver](https://subzeroid.github.io/instagrapi/usage-guide/challenge_resolver.html)
* [Exceptions](https://subzeroid.github.io/instagrapi/exceptions.html)

## Contributing

[![List of contributors](https://opencollective.com/instagrapi/contributors.svg?width=890&button=0)](https://github.com/subzeroid/instagrapi/graphs/contributors)

To release, you need to call the following commands:

    python -m build
    twine upload dist/*

---

## Instagram Tool (Web Dashboard + Chrome Extension)

A complete Instagram management suite built on top of `instagrapi` with **FastAPI backend**, **Web Dashboard**, and **Chrome Extension**.

### Project Structure

```
instagrapi/
├── .venv/                         ← shared virtual environment
└── instagram-tool/
    ├── run.py                     ← one-command launcher
    ├── backend/                   # FastAPI server, session management
    ├── web/                       # Dashboard UI (HTML/JS/CSS)
    └── extension/                 # Chrome Extension files
```

### Quick Start

```bash
python3 instagrapi/instagram-tool/run.py
```

Automatically sets up the virtual environment, installs dependencies, finds an available port (8000–9000), and opens the web dashboard.

### Chrome Extension Setup

1. Go to `chrome://extensions` in Chrome
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select `instagrapi/instagram-tool/extension` folder

The extension auto-detects the backend port (scans 8000–8010).

### Dashboard Features

- **Dashboard** - Statistics cards (followers, following, posts), smart search (URL/@user/#hashtag/location)
- **Search Profile** - User lookup, follow/unfollow, view followers/following
- **Download** - Posts, reels, videos, albums, stories; hashtag/location search; preview cards
- **Downloads** - File management with thumbnails, filters, open in Finder
- **Saved** - Saved posts & collections, bulk download
- **Followers** - Follower management, "not following back" detection, CSV export
- **Explore** - Media grid by hashtag, user, or location
- **Messages** - DM inbox and sending
- **Scheduler** - Auto-download stories with interval settings
- **Publish** - Photo, video, reel, album (max 10), story uploads with drag-drop, caption editor, mentions, location tagging, and **scheduled posting**

### API Endpoints (Instagram Tool)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/login` / `/logout` | Authentication |
| GET | `/me` | Session info |
| POST | `/challenge/submit` | 2FA/challenge verification |
| GET | `/profile/{username}` | Profile data |
| POST | `/follow` / `/unfollow` | Follow actions |
| POST | `/download/post` | Download posts/reels/albums |
| GET | `/download/stories/{username}` | Download stories |
| GET | `/saved` / `/saved/collections` | Saved posts management |
| POST | `/publish/now` / `/publish/schedule` | Publish immediately or schedule |
| GET | `/publish/queue` | Scheduled posts queue |
| GET | `/inbox` / POST `/dm/send` | Direct messages |

See [`instagram-tool/README.md`](instagram-tool/README.md) for full documentation.
