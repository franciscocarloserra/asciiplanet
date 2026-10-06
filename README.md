# ASCII Planet

16-color ASCII globe, styled like an 80s terminal program, that you can spin and zoom, where anyone can drop short ephemeral messages on a spot of the planet. Proof of concept.

    python3 serve.py        # http://localhost:7804
    bun relay.js            # ws://127.0.0.1:7805, message relay

The page connects to `WS_URL` in `js/params.js` (localhost, or a cloudflared quick tunnel from GitHub Pages). The relay broadcasts every message to everyone; it only takes lowercase a-z and spaces, checks Origin, and limits rate, size and connections per IP.

Drag or arrows to move, wheel to zoom, click to place yourself, type and press enter. Letters a-z and spaces only, lowercased, 100 chars; messages crumble letter by letter and are gone after 20 s.

Tunables are in `js/params.js`. `js/globe.js` draws the planet, `js/sun.js` places the day/night line from the real UTC time, `js/sky.js` draws the stars, the sun (with a bit of lens flare) and the moon in a sky that rotates with the planet, `js/lights.js` fakes night lights around the cities in `data/cities.js`, `js/title.js` is the intro title, `js/sound.js` makes the PC-speaker beeps, `js/messages.js` holds messages (`send()` is where a backend plugs in), `js/input.js` handles mouse and keys, `js/main.js` puts the frame together.

`data/land.js` is a 2880x1440 land bitmap made by `make_land.py` (needs the `global-land-mask` Python package). `data/curses.js` is the curse word list used by `js/filter.js` on both the page and the relay, made by `make_curses.py` from the system Spanish/English dictionaries and the list in `../curse-chat`. Console errors and slow frames go to `/tmp/asciiplanet-console.jsonl`.
