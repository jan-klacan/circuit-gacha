# Circuit Draw

Circuit Draw is a free, offline pack-opening game about electrical components, quantum gates, and proteins involved in cellular signaling. It runs in a browser with a Python standard-library server bound to `127.0.0.1`. After downloading the project, you can play offline without an account or Python packages.

## Play

1. Clone the repository or choose **Code → Download ZIP** on GitHub and extract the archive to a writable folder.
2. With Python 3.8 or later installed, run `python3 server.py` from that folder. On Windows, use `py -3 server.py` if you have the Python launcher. On macOS, you can also run `./Play.command` from Terminal.
3. Choose a pack. Drag from the scissors across the dotted seal or select **Tear open**. Flip cards one at a time or use **Reveal all**.
4. Open **Album** to filter by set or collection status and inspect both sides of a card.

The game opens your default browser. If it stays closed, use the exact `http://127.0.0.1:…` address printed in the terminal. Press Ctrl+C in the terminal to stop the game. The local Python server handles pack draws and saves, so GitHub Pages alone cannot run the game. See [GitHub Pages hosting requirements](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site).

## Sets and rarity

**Current** covers electrical components, **Superposition** covers quantum gates and measurement, **Membrane** covers channels and pumps, and **Signal Cascade** covers cellular signaling proteins. Each set has four Common cards, three Uncommon cards, three Rare cards, and two Legendary cards.

In the two biological sets, a protein is a molecule made of amino acids that does a job in a cell. For example, the sodium–potassium pump moves ions across the cell membrane, and protein kinase A passes signals along by adding phosphate groups to other proteins.

| Draw | Common | Uncommon | Rare | Legendary |
| --- | ---: | ---: | ---: | ---: |
| First three slots, per slot | 67% | 24% | 8% | 1% |
| Final slot | 0% | 72% | 24% | 4% |

Each slot rolls a rarity, then draws uniformly from that tier in the selected set. A card can repeat within a pack once every card of that rarity has appeared. Rare and Legendary cards have pointer-responsive foil that respects the system's reduced-motion setting.

## Graphics disclaimer

Card art is simplified for gameplay. Electrical and quantum cards may omit pins, connections, or other details. Biological cards reuse icons for proteins with related functions. Use the references below for technical diagrams, pinouts, or molecular structures.

## Saves and caching

The game saves your collection to `album.json` alongside `server.py` as soon as you open a pack. It stores card IDs, copy counts, first-found times, the total number of packs opened, and the last 100 openings for safe retries. All browsers using the same game folder share that album. To back up or move it, stop the game and copy `album.json`. Git ignores the save, lock, and temporary album files.

The browser can cache the HTML, CSS, JavaScript, and catalog, but revalidates them with the server before reuse. Album and pack-opening responses carry `Cache-Control: private, no-store`. Clearing browser data leaves the local save intact.

## Development

Run `python3 -m unittest -v` from the project folder. The tests use temporary saves and cover pack draws, duplicate-request handling, failed writes, and HTTP cache headers. Restart `server.py` after editing files in `static/` so the UI and draw pools use the same catalog version.

The catalog is in [`static/catalog.json`](static/catalog.json). [`static/art.js`](static/art.js) draws the card diagrams and pack emblems with Canvas.

- Electrical references include the [KiCad device library](https://kicad.github.io/symbols/Device.html), [Epson crystal oscillator block diagram](https://www.epsondevice.com/crystal/en/products/crystal-oscillator/programmable/info/pspxo-82/), and Texas Instruments documentation for the [INA826 instrumentation amplifier](https://www.ti.com/lit/ds/symlink/ina826.pdf) and [LMR51420 buck regulator](https://www.ti.com/lit/ds/symlink/lmr51420.pdf).
- The quantum and ion-channel cards draw on the [IBM Quantum circuit library](https://quantum.cloud.ibm.com/docs/en/qiskit/circuit-library) and the [IUPHAR/BPS ion-channel guide](https://bpspubs.onlinelibrary.wiley.com/doi/10.1111/bph.70231).

Circuit Draw is released under the [MIT License](LICENSE).
