# Glance Privacy Policy

Glance processes screenshot snippets locally in your browser to provide floating pinned references.

## What data Glance stores

- `savedSnips` in `chrome.storage.local` (image data, timestamp, page URL)
- `savedWorkspace` in `chrome.storage.local` (active workspace state)
- `activeSnips` in `chrome.storage.session` (session-only active widgets)
- `defaultOpacity` and `snipExpirationDays` in `chrome.storage.sync` (user preferences)

## What Glance does not do

- Does not send snip images or personal data to external servers
- Does not use remote analytics or tracking scripts
- Does not collect authentication credentials

## Permissions usage

- `activeTab`: trigger snip mode on current tab
- `scripting`: inject content script and CSS on supported pages
- `storage`: save user snippets and preferences
- `tabs`: tab activation/update handling for restoring active snips

## Data retention

Saved snips can be automatically cleaned based on the configured expiration days.

## Contact

Project repository: https://github.com/HarshalPatel1972/Glance
