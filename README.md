# pgs_archive_bot

The Telegram bot behind the [Postgrowth Singapore resources archive](https://postgrowthsg.github.io/) ([site code](https://github.com/postgrowthsg/postgrowthsg.github.io)).

Anyone can send the bot a link. They tap a type, up to two themes and an optional region, and it's added to the **Entries** tab of a Google Sheet. The website reads that tab, so it shows up within a few minutes. Admins (the core team) can also send PDFs and edit entries. A newcomer's first link waits for an admin to approve it; after that their links go straight in, up to a daily limit.

It's a Google Apps Script attached to the Sheet. No server, no AI, no cost.

## What it does

- Reads the page it's sent (title, description, and for papers the authors and year from citation tags).
- Buttons for type (research, book, article, podcast, video, community resource, post, zine / own writing), theme 1 and theme 2, or a new theme typed on the spot.
- An optional **location** step: one of 11 regions (Singapore, Southeast Asia, East Asia, South Asia, Central Asia, West Asia, Europe, Africa, Oceania, North America, South America), or skip.
- An optional public one-liner and an optional private summary (only the team sees it).
- Admins can edit title, description, location, date/authors and who shared it (with a yes/no on crediting them).
- PDFs are saved to a Drive folder shared as "anyone with the link can view".
- Warns about links already in the archive. Saves a Wayback Machine snapshot of each new link (hourly).
- Everyone: `/start`, `/about` (what the archive holds), `/help`, `/cancel`.
- Admins: `/recent`, `/hide`, `/show`, `/block`, `/unblock`, `/invite` (one-time link for another admin).

## Sheet tabs

- **Entries** (published as CSV for the site): ID, Status (live/hidden), Title, Link, Type, Theme 1, Theme 2, Location, Date, Authors, Description, Shared by, Date added, Archive link
- **Themes**, **Types**: lists the buttons are built from
- **Private** and **Summaries** (not published): who shared what, whether they're OK to be credited, which admin added it, and the private summaries
- **Users** (not published): who has used the bot, their status and daily counts
- **Efforts** and **Cards** (published) are filled in by the team, not the bot. Efforts use the same Location list.

## Set up your own

1. Make a Google Sheet, open **Extensions → Apps Script**, and paste in `Code.gs` (or push it with [clasp](https://github.com/google/clasp)). Set the time zone in `appsscript.json`.
2. Make a bot with [@BotFather](https://t.me/BotFather) and add its token as the script property `BOT_TOKEN`.
3. Run `setup()` once. It creates the tabs, adds starter themes and types, makes the PDF folder and starts the bot.
4. Send `/start` to your bot. The first person to do so becomes its owner.
5. Publish the Entries tab to the web as CSV and point the site at it.

The bot checks Telegram once a minute (Apps Script web apps can't take Telegram webhooks), so replies can take up to a minute.
