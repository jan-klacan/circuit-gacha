import { artwork } from "./art.js";

const $ = selector => document.querySelector(selector);
const stage = $("#stage");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const pending = new Map();
const packButtons = new Map();
let packs, cards, packSize, odds, cardsById, packsById, pack;
let album;
let pulls = [];
let revealed = new Set();
let busy = false;
let albumRequest = 0;

function node(tag, className, content) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (content !== undefined) element.textContent = content;
  return element;
}

function button(text, className, action) {
  const element = node("button", className, text);
  element.type = "button";
  element.addEventListener("click", action);
  return element;
}

function showError(message, selector = "#error") {
  const error = $(selector);
  error.textContent = message;
  error.hidden = !message;
}

function status(message) {
  $("#status").textContent = message;
}

async function request(path, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(path, { ...options, signal: controller.signal });
    const data = await response.json().catch(error => {
      if (!(error instanceof SyntaxError)) throw error;
      return null;
    });
    if (!response.ok || data === null) {
      throw new Error(data?.error || "The local game server returned an unexpected response.");
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

function requestError(error, fallback) {
  return error.name === "Error" ? error.message : fallback;
}

function setAlbum(value) {
  album = value;
  const unique = cards.filter(card => album.cards[card.id]).length;
  $("#nav-count").textContent = `${unique}/${cards.length}`;
  $("#nav-count").hidden = false;
  showError("", "#album-error");
  if (!$("#album-view").hidden) renderAlbum();
}

async function refreshAlbum() {
  const sequence = ++albumRequest;
  try {
    const current = await request("/api/album");
    if (sequence !== albumRequest) return;
    setAlbum(current);
  } catch (error) {
    if (sequence !== albumRequest) return;
    showError(requestError(error, "Could not load the local album. Check that the game server is running."), "#album-error");
    if (!$("#album-view").hidden) renderAlbum();
  }
}

function renderPackList() {
  const list = $("#pack-list");
  packs.forEach(item => {
    const pick = button("", `pack-choice theme-${item.id}`, () => {
      if (item === pack) return;
      pack = item;
      pulls = [];
      revealed = new Set();
      showError("");
      updatePackList();
      renderStage();
    });
    const preview = node("span", "pack-preview");
    preview.append(artwork(item.id));
    const label = node("span", "choice-label");
    const type = item.subset ? `${item.type} / ${item.subset}` : item.type;
    label.append(node("span", "choice-type", type), node("strong", "", item.name), node("span", "choice-description", item.description));
    const arrow = node("span", "choice-arrow", "›");
    arrow.setAttribute("aria-hidden", "true");
    pick.append(preview, label, arrow);
    packButtons.set(item.id, pick);
    list.append(pick);
  });
  updatePackList();
}

function updatePackList() {
  for (const [id, pick] of packButtons) {
    pick.setAttribute("aria-pressed", String(id === pack.id));
    pick.disabled = busy;
  }
}

function wrapper(item) {
  const assembly = node("div", "wrapper");
  assembly.setAttribute("aria-hidden", "true");
  const body = node("div", "wrapper-body");
  const strip = node("div", "wrapper-strip");
  strip.setAttribute("aria-hidden", "true");
  const panel = node("div", "wrapper-label");
  panel.append(node("div", "wrapper-kicker", `CIRCUIT DRAW / ${item.edition}`));
  const emblem = node("div", "wrapper-art");
  emblem.append(artwork(item.id));
  panel.append(emblem, node("div", "wrapper-title", item.name), node("div", "wrapper-sub", `${item.type.toUpperCase()} COMPONENTS`));
  const bottom = node("div", "wrapper-footer");
  bottom.append(node("span", "barcode"), node("span", "", `${packSize} CARDS`));
  panel.append(bottom);
  body.append(panel);
  const seal = node("div", "seal");
  seal.append(node("span", "scissors", "✂"), node("span", "dashes"), node("span", "seal-arrow", "›"));
  assembly.append(body, strip, seal);
  return { assembly, seal };
}

function attachSwipe(seal, assembly) {
  let start;
  function reset() {
    start = undefined;
    assembly.style.removeProperty("--tear");
    assembly.style.removeProperty("--lift");
    assembly.style.removeProperty("--shift");
    assembly.style.removeProperty("--tilt");
  }
  function progress(event) {
    const dx = event.clientX - start.x;
    const dy = Math.abs(event.clientY - start.y);
    return dy < 85 ? Math.min(1, Math.max(0, dx / (seal.offsetWidth * .58))) : 0;
  }
  seal.addEventListener("pointerdown", event => {
    if (busy || start || (event.pointerType === "mouse" && event.button !== 0)) return;
    start = { x: event.clientX, y: event.clientY, id: event.pointerId };
    seal.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  seal.addEventListener("pointermove", event => {
    if (!start || start.id !== event.pointerId) return;
    const amount = progress(event);
    assembly.style.setProperty("--tear", `${amount * 100}%`);
    assembly.style.setProperty("--lift", `-${amount * 12}px`);
    assembly.style.setProperty("--shift", `${amount * 11}px`);
    assembly.style.setProperty("--tilt", `${amount * 5}deg`);
    if (amount === 1) {
      start = undefined;
      tear(assembly);
    }
  });
  seal.addEventListener("pointerup", event => {
    if (!start || start.id !== event.pointerId) return;
    if (progress(event) >= .82) tear(assembly);
    else reset();
  });
  const cancel = event => { if (!busy && start?.id === event.pointerId) reset(); };
  seal.addEventListener("pointercancel", cancel);
  seal.addEventListener("lostpointercapture", cancel);
}

function renderStage() {
  stage.className = `stage theme-${pack.id}${pulls.length ? " is-open" : ""}`;
  stage.replaceChildren();
  if (pulls.length) {
    renderPulls();
    return;
  }

  const platform = node("div", "platform");
  const rings = node("div", "rings");
  rings.setAttribute("aria-hidden", "true");
  const { assembly, seal } = wrapper(pack);
  platform.append(rings, assembly);
  const controls = node("div", "open-controls");
  const type = pack.subset ? `${pack.subset} · ${pack.type}` : pack.type;
  const label = node("p", "stage-label", `${type} / Set ${pack.edition}`);
  const open = button(pending.has(pack.id) ? "Retry opening" : "Tear open", "primary tear-button", () => tear(assembly));
  controls.append(label, node("h2", "", pack.name), node("p", "pack-description", pack.description),
    node("p", "pack-size", `${packSize} cards per pack`), open,
    node("p", "swipe-hint", "Or drag across the dotted seal."));
  stage.append(controls, platform);
  attachSwipe(seal, assembly);
}

async function tear(assembly) {
  if (busy || pulls.length) return;
  busy = true;
  ++albumRequest;
  showError("");
  updatePackList();
  const open = stage.querySelector(".primary");
  open.disabled = true;
  open.textContent = "Opening…";
  status("Opening pack.");
  stage.setAttribute("aria-busy", "true");
  assembly.classList.add("tearing");
  const animation = new Promise(resolve => setTimeout(resolve, reducedMotion.matches ? 0 : 680));
  let opened = false;
  try {
    const requestId = pending.get(pack.id) || crypto.randomUUID();
    pending.set(pack.id, requestId);
    const data = await request("/api/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pack: pack.id, requestId }),
    });
    setAlbum(data.album);
    await animation;
    pending.delete(pack.id);
    pulls = data.pulls;
    revealed = new Set();
    opened = true;
  } catch (error) {
    await animation;
    showError(requestError(error, "Could not open the pack. Check that the game server is running, then retry."));
    status("");
  } finally {
    const restoreFocus = document.activeElement === document.body || stage.contains(document.activeElement);
    busy = false;
    updatePackList();
    renderStage();
    stage.removeAttribute("aria-busy");
    if (restoreFocus && !$("#packs-view").hidden) stage.querySelector(opened ? ".pull-card" : ".primary")?.focus();
    if (opened) status(`${pulls.length} cards saved to your album. Flip each card to reveal it.`);
  }
}

function cardBack(item) {
  const back = node("div", `card-surface card-back theme-${item.id}`);
  back.append(node("div", "card-serial", `CD  /  ${item.edition}`), artwork(item.id),
    node("div", "back-name", item.name), node("div", "back-stamp", "CIRCUIT DRAW"));
  return back;
}

function cardFace(card, { isNew = false, count = 0, missing = false } = {}) {
  const item = packsById.get(card.set);
  const rarity = card.rarity.toLowerCase();
  const face = node("div", `card-surface card-face theme-${card.set} rarity-${rarity}${missing ? " missing" : ""}`);
  const top = node("div", "card-top");
  top.append(node("span", "card-serial", `${item.edition} · ${String(card.number).padStart(2, "0")}`));
  if (isNew || count) top.append(node("span", "card-badge", isNew ? "NEW" : `×${count}`));
  const graphic = node("div", "card-graphic");
  graphic.append(artwork(card.set, card.symbol, card.number));
  face.append(top, graphic, node("div", "card-name", card.name), node("div", "card-type", card.function),
    node("div", "card-rarity", `${{common: "●", uncommon: "◆", rare: "✦", legendary: "✷"}[rarity]} ${card.rarity}`));
  if (!missing && ["rare", "legendary"].includes(rarity)) {
    const foil = node("div", "foil");
    face.append(foil);
    face.addEventListener("pointermove", event => {
      const box = face.getBoundingClientRect();
      foil.style.setProperty("--gloss-x", `${(event.clientX - box.left) / box.width * 100}%`);
      foil.style.setProperty("--gloss-y", `${(event.clientY - box.top) / box.height * 100}%`);
    });
  }
  return face;
}

function renderPulls() {
  const area = node("div", "pull-area");
  const heading = node("div", "pull-heading");
  const title = node("h2", "", `Inside ${pack.name}`);
  const prompt = node("p");
  heading.append(title, prompt);
  const grid = node("div", "pull-grid");
  const actions = node("div", "pull-actions");
  const flipAll = button("Reveal all", "quiet", () => {
    pulls.forEach((_, index) => reveal(index, false));
    updateActions();
    status(prompt.textContent);
    next.focus();
  });
  const next = button("Open another", "primary", () => {
    pulls = [];
    revealed = new Set();
    renderStage();
    stage.querySelector(".primary").focus();
  });
  const tiles = pulls.map(({id, isNew}, index) => {
    const card = cardsById.get(id);
    const tile = button("", "pull-card", () => {
      if (revealed.has(index)) openDetail(card, false);
      else reveal(index);
    });
    const flipper = node("div", "flipper");
    const back = cardBack(pack);
    const face = cardFace(card, {isNew});
    back.setAttribute("aria-hidden", "true");
    face.setAttribute("aria-hidden", "true");
    flipper.append(back, face);
    tile.append(flipper);
    tile.style.setProperty("--slot", index);
    return tile;
  });
  function reveal(index, announce = true) {
    if (revealed.has(index)) return;
    revealed.add(index);
    const {id, isNew} = pulls[index];
    const card = cardsById.get(id);
    updateTile(index);
    if (announce) {
      status(`${card.name}, ${card.rarity}${isNew ? ", new to your album" : ""}.`);
      updateActions();
    }
  }
  function updateTile(index) {
    const tile = tiles[index];
    const card = cardsById.get(pulls[index].id);
    tile.classList.toggle("revealed", revealed.has(index));
    tile.setAttribute("aria-label", revealed.has(index) ? `Inspect ${card.name}, ${card.rarity}` : `Reveal card ${index + 1}`);
  }
  function updateActions() {
    const complete = revealed.size === pulls.length;
    const newCount = pulls.filter(card => card.isNew).length;
    flipAll.hidden = complete;
    prompt.textContent = complete ? `${newCount} new · ${pulls.length - newCount} duplicates · Saved to album` :
      `${revealed.size} of ${pulls.length} revealed · Select a card to flip it`;
  }
  tiles.forEach((tile, index) => {
    updateTile(index);
    grid.append(tile);
  });
  actions.append(flipAll, next);
  area.append(heading, grid, actions);
  stage.append(area);
  updateActions();
}

function openDetail(card, missing) {
  const dialog = $("#detail");
  const item = packsById.get(card.set);
  const entry = album.cards[card.id];
  const art = node("div", "detail-art");
  const properties = node("div", "detail-info");
  const heading = node("h2", "", card.name);
  heading.id = "detail-title";
  properties.append(node("p", "choice-type", `${item.name} / ${card.rarity}`), heading,
    node("p", "", card.description), node("p", "detail-count", entry ? `Copies in album · ${entry.count}` : "Still missing from your album"));
  $("#detail-content").replaceChildren(art, properties);
  dialog.setAttribute("aria-labelledby", heading.id);
  const toggle = $("#flip-detail");
  let showingBack = false;
  function showSide() {
    art.replaceChildren(showingBack ? cardBack(item) : cardFace(card, {missing, count: entry?.count}));
    toggle.textContent = showingBack ? "Show front" : "Show back";
  }
  toggle.onclick = () => { showingBack = !showingBack; showSide(); };
  showSide();
  dialog.showModal();
}

function renderAlbum() {
  const grid = $("#album-grid");
  $(".filters").hidden = !album;
  $(".album-meter").hidden = !album;
  if (!album) {
    $("#album-summary").textContent = $("#album-error").hidden ? "Reading local album…" : "Album unavailable";
    grid.replaceChildren();
    return;
  }
  const selected = $("#album-set").value;
  const filter = $("#album-filter").value;
  const owned = cards.filter(card => album.cards[card.id]).length;
  const total = Object.values(album.cards).reduce((sum, card) => sum + card.count, 0);
  $("#album-summary").textContent = `${album.packsOpened} packs opened · ${total} cards pulled`;
  $("#album-progress-label").textContent = `${owned} / ${cards.length} unique cards`;
  $("#album-progress").max = cards.length;
  $("#album-progress").value = owned;
  grid.replaceChildren();
  const visible = cards.filter(card => {
    const hasCard = Boolean(album.cards[card.id]);
    return (selected === "all" || card.set === selected) &&
      (filter === "all" || (filter === "owned") === hasCard);
  });
  if (!visible.length) {
    grid.append(node("p", "empty", filter === "owned" ? "No collected cards here yet. Open a pack to start." : "No cards match these filters."));
  }
  visible.forEach(card => {
    const entry = album.cards[card.id];
    const tile = button("", "album-card", () => openDetail(card, !entry));
    const face = cardFace(card, {missing: !entry, count: entry?.count});
    tile.setAttribute("aria-label", `${card.name}, ${card.rarity}, ${entry ? `${entry.count} collected` : "missing"}`);
    tile.append(face);
    grid.append(tile);
  });
}

function navigate() {
  const inAlbum = location.hash === "#album";
  $("#packs-view").hidden = inAlbum;
  $("#album-view").hidden = !inAlbum;
  $("#nav-packs").setAttribute("aria-current", inAlbum ? "false" : "page");
  $("#nav-album").setAttribute("aria-current", inAlbum ? "page" : "false");
  if (inAlbum) renderAlbum();
  if (!busy) refreshAlbum();
}

function renderOdds() {
  const table = $("#odds-table");
  const head = table.createTHead().insertRow();
  const slot = node("th", "", "Slot");
  slot.scope = "col";
  head.append(slot);
  const rarities = Object.keys(odds.standard);
  rarities.forEach(rarity => {
    const name = node("th", `odds-${rarity.toLowerCase()}`, rarity);
    name.scope = "col";
    head.append(name);
  });
  const body = table.createTBody();
  for (const [label, data] of [[`First ${packSize - 1} cards`, odds.standard], ["Final card", odds.featured]]) {
    const row = body.insertRow();
    const name = node("th", "", label);
    name.scope = "row";
    row.append(name);
    rarities.forEach(rarity => row.append(node("td", "", `${data[rarity]}%`)));
  }
}

async function start() {
  try {
    ({ packs, cards, packSize, odds } = await request("/catalog.json"));
  } catch (error) {
    showError(requestError(error, "Could not load the card catalog. Check that the game server is running."));
    $("#error").after(button("Reload game", "quiet", () => location.reload()));
    return;
  } finally {
    $("#loading").hidden = true;
  }
  cardsById = new Map(cards.map(card => [card.id, card]));
  packsById = new Map(packs.map(pack => [pack.id, pack]));
  pack = packs[0];
  $("#album-set").append(new Option("All sets", "all"), ...packs.map(item => new Option(item.name, item.id)));
  $("#album-set").addEventListener("change", renderAlbum);
  $("#album-filter").addEventListener("change", renderAlbum);
  window.addEventListener("hashchange", navigate);
  renderOdds();
  renderPackList();
  renderStage();
  navigate();
}

start();
