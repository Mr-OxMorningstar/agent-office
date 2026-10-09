import * as THREE from 'three';

const STORAGE_KEY = 'office.tv.url';
const ID_RE = /^[\w-]{11}$/;
const LIST_RE = /^[\w-]{10,80}$/;
const HOSTS = /^(?:www\.|m\.|music\.)?(?:youtube\.com|youtube-nocookie\.com)$/;

// Accepts a watch / short / embed URL, a youtu.be link, a playlist URL or a bare 11-char video id.
// Returns { video, list } (either may be null, never both) or null when it isn't YouTube.
export function parseYouTube(input) {
  const text = String(input ?? '').trim();
  if (ID_RE.test(text)) return { video: text, list: null };
  let url;
  try {
    url = new URL(/^[a-z]+:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.toLowerCase();
  const list = url.searchParams.get('list');
  const cleanList = list && LIST_RE.test(list) ? list : null;
  let video = null;
  if (host === 'youtu.be') {
    video = url.pathname.split('/')[1] ?? null;
  } else if (HOSTS.test(host)) {
    const [, first, second] = url.pathname.split('/');
    video = first === 'watch' ? url.searchParams.get('v') : ['shorts', 'embed', 'live', 'v'].includes(first) ? second : null;
  } else {
    return null;
  }
  const cleanVideo = video && ID_RE.test(video) ? video : null;
  return cleanVideo || cleanList ? { video: cleanVideo, list: cleanList } : null;
}

export function embedUrl({ video, list }) {
  const params = new URLSearchParams({ autoplay: '1', rel: '0' });
  if (video) {
    if (list) params.set('list', list);
    return `https://www.youtube-nocookie.com/embed/${video}?${params}`;
  }
  params.set('list', list);
  return `https://www.youtube-nocookie.com/embed/videoseries?${params}`;
}

// Lets the player put YouTube on the game-room TV. The iframe lives in a docked mini-player so the music keeps
// going when the URL panel is closed. `tv.setScreen(texture | null)` swaps what the 3D screen shows.
export function createOfficeTv({ tv }) {
  const panel = el('aside', 'panel tv-panel');
  panel.hidden = true;
  panel.setAttribute('aria-label', 'TV');
  const header = el('header', 'panel-header');
  const close = el('button', 'panel-close', '×');
  close.setAttribute('aria-label', 'Close');
  header.append(el('h2', 'panel-title', 'TV'), close);

  const body = el('div', 'panel-body');
  const form = el('form', 'tv-form');
  const input = el('input', 'panel-search');
  input.type = 'text';
  input.placeholder = 'YouTube video or playlist link';
  input.setAttribute('aria-label', 'YouTube link');
  input.autocomplete = 'off';
  input.spellcheck = false;
  const play = el('button', 'panel-action primary', 'Play');
  play.type = 'submit';
  const message = el('p', 'tv-message');
  message.setAttribute('role', 'status');
  form.append(input, play);
  body.append(form, message);
  panel.append(header, body);

  const mini = el('div', 'tv-mini');
  mini.hidden = true;
  const miniBar = el('div', 'tv-mini-bar');
  const miniTitle = el('span', 'tv-mini-title', '♪ Now playing');
  const toggle = el('button', 'tv-mini-btn', '–');
  toggle.type = 'button';
  toggle.setAttribute('aria-label', 'Collapse player');
  const stop = el('button', 'tv-mini-btn stop', 'Stop');
  stop.type = 'button';
  miniBar.append(miniTitle, toggle, stop);
  const frameWrap = el('div', 'tv-mini-frame');
  mini.append(miniBar, frameWrap);
  document.body.append(panel, mini);

  let texture = null;
  let playing = false;

  input.value = load();

  const setMessage = (text, isError = false) => {
    message.textContent = text;
    message.classList.toggle('error', isError);
  };

  const showScreen = (next) => {
    texture?.dispose();
    texture = next;
    tv.setScreen(next);
  };

  const startPlaying = (parsed) => {
    const frame = el('iframe');
    frame.src = embedUrl(parsed);
    frame.title = 'YouTube player';
    frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.setAttribute('allowfullscreen', '');
    frameWrap.replaceChildren(frame);
    mini.hidden = false;
    mini.classList.remove('collapsed');
    playing = true;
    if (!parsed.video) {
      showScreen(nowPlayingTexture());
      return;
    }
    // The thumbnail host sends CORS headers, so it can be a WebGL texture; fall back to the drawn screen if it fails.
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(
      `https://i.ytimg.com/vi/${parsed.video}/hqdefault.jpg`,
      (loaded) => {
        if (!playing) {
          loaded.dispose();
          return;
        }
        loaded.colorSpace = THREE.SRGBColorSpace;
        showScreen(loaded);
      },
      undefined,
      () => {
        if (playing) showScreen(nowPlayingTexture());
      },
    );
  };

  const stopPlaying = () => {
    playing = false;
    frameWrap.replaceChildren();
    mini.hidden = true;
    showScreen(null);
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const parsed = parseYouTube(input.value);
    if (!parsed) {
      setMessage('That is not a YouTube video or playlist link.', true);
      return;
    }
    save(input.value.trim());
    setMessage('Playing. You can close this and the music keeps going.');
    startPlaying(parsed);
  });
  close.addEventListener('click', () => api.close());
  toggle.addEventListener('click', () => {
    const collapsed = mini.classList.toggle('collapsed');
    toggle.textContent = collapsed ? '+' : '–';
    toggle.setAttribute('aria-label', collapsed ? 'Expand player' : 'Collapse player');
  });
  stop.addEventListener('click', () => {
    stopPlaying();
    setMessage('Stopped.');
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) api.close();
  });

  const api = {
    open() {
      panel.hidden = false;
      input.focus();
      input.select();
    },
    close() {
      panel.hidden = true;
      input.blur();
    },
  };
  return api;
}

// Drawn screen for playlists (no single thumbnail) or when the thumbnail can't load.
function nowPlayingTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 556;
  const g = canvas.getContext('2d');
  const fill = g.createLinearGradient(0, 0, 1024, 556);
  fill.addColorStop(0, '#2b1f5c');
  fill.addColorStop(1, '#d6407f');
  g.fillStyle = fill;
  g.fillRect(0, 0, 1024, 556);
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '700 200px system-ui, sans-serif';
  g.fillText('♪', 512, 220);
  g.font = '700 64px system-ui, sans-serif';
  g.fillText('Now playing', 512, 410);
  const canvasTexture = new THREE.CanvasTexture(canvas);
  canvasTexture.colorSpace = THREE.SRGBColorSpace;
  return canvasTexture;
}

function load() {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function save(value) {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Storage can be blocked; remembering the link is optional.
  }
}

// Text is always set via textContent, never parsed as HTML.
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
