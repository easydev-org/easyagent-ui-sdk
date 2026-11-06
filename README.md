# @easydev-org/ext-ui

The contract between an **EasyAgent extension UI** and the **console that mounts it**.

An extension's interface runs in an `<iframe>` on the console's own origin (`/ext/<id>/`). An iframe has
its own `window` and its own `<html>`, so three things that look free are not:

- **the theme** does not reach it;
- **its height** is not known to the console, which owns the frame;
- **a tool result** arrives from the console, not from the extension's API.

This package is those three channels, and nothing else.

## Why this is a package

The messages are a contract between **two programs built and deployed separately**. When the strings
and shapes lived only in the console, every extension copied them and hoped — and a typo produced a card
that stayed empty forever, with no error on either side. Both ends import from here now, so a rename is
a compile error in both rather than a silent mismatch in one.

## Install

```sh
npm install @easydev-org/ext-ui
```

It is published to **GitHub Packages**, not npmjs. The consumer needs:

```
@easydev-org:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

## Two entry points

```
@easydev-org/ext-ui          the FRAME side — what an extension's own UI imports
@easydev-org/ext-ui/host     the HOST side — what the console imports
```

**The split is not cosmetic.** The frame sends `card-height` and `open-view` and receives `card-data`;
the host sends `card-data` and receives the other two. Each side needs a different half, and giving both
halves to both sides invites an extension to call `openViewFrom` on its own outgoing message.

|                                                                 | frame (`/`) | host (`/host`) |
| --------------------------------------------------------------- | ----------- | -------------- |
| `MSG_*` constants                                               | ✅          | ✅             |
| `connectToHost`, `applyTheme`, `onThemeChange`                  | ✅          | —              |
| `receiveCardData`, `reportCardHeight`, `requestOpenView`        | ✅          | —              |
| `openViewFrom`, `cardHeightFrom`, `isCardReady`, `isThemeReady` | —           | ✅             |
| `cardDataMessage`, `cardSrc`, `panelSrc`                        | —           | ✅             |

**Validation is asymmetric on purpose:** each side validates what it _receives_ and trusts what it
_sends_.

## The card

A card renders ONE tool call. The console picks it by the `template` the tool declared, mounts
`/ext/<id>/?theme=…#/card/<template>`, and hands over the call's data.

```svelte
<script lang="ts">
  import { receiveCardData, reportCardHeight, requestOpenView, type CardPayload } from '@easydev-org/ext-ui'
  import { onMount } from 'svelte'

  let payload = $state<CardPayload | null>(null)

  onMount(() => {
    // Ask for the data, and report the height as the card grows.
    const stopData = receiveCardData(p => { payload = p })
    const stopHeight = reportCardHeight()
    return () => { stopData(); stopHeight() }
  })
</script>

{#if payload}
  <article>
    <h4>{payload.tool}</h4>
    <pre>{payload.output}</pre>
    {#if payload.error}<p class="error">{payload.error}</p>{/if}
    <button onclick={() => requestOpenView('/runs/42', 'Run 42')}>Open the full run</button>
  </article>
{/if}
```

**A card is a pure render.** It is handed its result and fetches nothing, which is why it still renders
correctly after the workspace it describes has expired — it was never reading the workspace.

**Call `reportCardHeight` only on a card route.** The same UI is also mounted as a full page, where the
console sizes nothing and a stray height is noise.

## The theme

```svelte
<script lang="ts">
  import { connectToHost, onThemeChange } from '@easydev-org/ext-ui'

  // Once, at module scope: starts listening for the console's theme messages.
  connectToHost()

  // `immediate` — the callback runs with the current value, so a late subscriber is not stuck on the
  // default until somebody toggles the theme.
  onThemeChange(mode => document.documentElement.classList.toggle('dark', mode === 'dark'))
</script>
```

Two channels cover the theme and both are needed: `?theme=` in the URL (applied before first paint, so
dark mode never flashes light) and a `postMessage` on every change (so a switch while the panel is open
is not ignored). `connectToHost` handles the second; your page's bootstrap should handle the first:

```ts
import { applyTheme } from '@easydev-org/ext-ui'
applyTheme(new URLSearchParams(location.search).get('theme') ?? 'light')
```

## Opening a view from a card

A card **cannot navigate by itself**. It is a few hundred pixels tall, so an `<a href="#/ws/…">` would
open the whole interface inside that frame. Only the console knows where a view belongs — a side panel
on a wide screen, a full page on a phone — so the card asks and the console decides.

This is also why a tool result declares `card` and `view` separately: the card knows which route is
worth opening, the console decides how to present it.

## What is deliberately absent

**No client for the extension's own API.** The console proxies data requests for its own screens; a card
needs none because it is handed its result. And the credential must never enter the frame — an SDK that
offered a fetch would be offering a token.

## The protocol, if you are writing the other end

Every message is `{ type: string, ...body }`, posted with `targetOrigin: '*'`.

| Direction       | `type`                  | Body                       |
| --------------- | ----------------------- | -------------------------- |
| console → frame | `easyagent:theme`       | `theme: 'light' \| 'dark'` |
| frame → console | `easyagent:theme:ready` | —                          |
| frame → console | `easyagent:card-ready`  | —                          |
| console → frame | `easyagent:card-data`   | `CardPayload`              |
| frame → console | `easyagent:card-height` | `height: number`           |
| frame → console | `easyagent:open-view`   | `ext, route, title`        |

The constants are exported from this package, so the other end should import them rather than retype
them.

## Development

```sh
npm install
npm run check   # types, including the tests
npm test        # the protocol behaviour, in jsdom
npm run build   # emits dist/ (tests excluded)
```

## Styles

The **design tokens** live here too, so a console and an extension panel cannot disagree about
`--primary`.

```css
/* An extension UI — plain CSS, no Tailwind in the bundle. */
@import '@easydev-org/ext-ui/styles';
```

```css
/* The console — the same tokens, plus the Tailwind bridge. */
@import 'tailwindcss';
@import '@easydev-org/ext-ui/styles/tailwind';
```

| entry             | what it is                                                                |
| ----------------- | ------------------------------------------------------------------------- |
| `styles`          | tokens + base element styles. For a consumer without Tailwind.            |
| `styles/tokens`   | only the values: colour per theme, spacing, radius, type.                 |
| `styles/base`     | only the element defaults (`body`, `html`, the card-mode rules).          |
| `styles/tailwind` | `styles` + `@theme inline`, which turns the tokens into `bg-primary` etc. |

**Why the split.** A console needs its palette as utility classes; an extension UI is built into a Go
binary and cannot afford Tailwind. One file cannot serve both — importing the Tailwind layer from an
iframe is a parse error. Three layers, two entry points.

**`@theme inline`** makes Tailwind emit `var(--background)` at the use site rather than resolving the
value at build time, which is what lets one build serve both themes.

**The switch is `data-theme="dark"` on `<html>`.** `prefers-color-scheme` is only consulted when
nothing has been chosen, via `:root:not([data-theme])`. An explicit choice always wins.
