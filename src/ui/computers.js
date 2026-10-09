import * as THREE from 'three';

// Desk computers. Each desk monitor can show either
//   - a web page in a frame: works for sites that allow embedding, e.g. local dev apps on localhost; the dev server
//     checks a site's framing headers first, since a blocked site would just show a blank frame;
//   - a live window from the user's own screen (getDisplayMedia): works for any site, logged in as the user, but is
//     view-only from the office.
// One large panel shows the computer in use. Content keeps running when the panel closes, and the 3D monitor shows
// it: the live window itself, or a card naming the page.
// `setScreen(info, texture | null)` puts a texture on that desk's monitor.
export function createComputers({ setScreen }) {
  const panel = el('aside', 'panel computer-panel');
  panel.hidden = true;

  const header = el('header', 'panel-header');
  const title = el('h2', 'panel-title');
  const close = el('button', 'panel-close', '×');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close');
  header.append(title, close);

  const toolbar = el('form', 'computer-toolbar');
  const input = el('input', 'panel-search');
  input.type = 'text';
  input.placeholder = 'URL, e.g. localhost:3000 or wikipedia.org';
  input.setAttribute('aria-label', 'URL');
  const go = el('button', 'panel-action primary', 'Open');
  go.type = 'submit';
  const share = el('button', 'panel-action', 'Share a window');
  share.type = 'button';
  const stop = el('button', 'panel-action danger', 'Stop');
  stop.type = 'button';
  toolbar.append(input, go, share, stop);

  const message = el('p', 'computer-message');
  const stage = el('div', 'computer-stage');
  panel.append(header, toolbar, message, stage);
  document.body.append(panel);

  const states = new Map(); // computer id -> { container, mode, url, stream, texture }
  let current = null; // the computer whose panel is open: its interact data

  const state = (info) => {
    if (!states.has(info.id)) {
      const container = el('div', 'computer-screen');
      container.append(el('p', 'computer-empty', 'Nothing on this screen yet. Open a URL, or share a window from your desktop.'));
      stage.append(container); // each computer keeps its own container, so frames aren't reloaded by moving them
      states.set(info.id, { container, mode: null, url: '', stream: null, texture: null });
    }
    return states.get(info.id);
  };

  const say = (text, tone = '') => {
    message.textContent = text;
    message.dataset.tone = tone;
  };

  const clear = (info, s) => {
    s.stream?.getTracks().forEach((t) => t.stop());
    s.texture?.dispose();
    Object.assign(s, { mode: null, stream: null, texture: null });
    s.container.replaceChildren(el('p', 'computer-empty', 'Screen off.'));
    setScreen(info, null);
  };

  const openUrl = async (info, raw) => {
    const url = normaliseUrl(raw);
    if (!url) return say('That doesn’t look like a web address.', 'error');
    const s = state(info);
    say(`Checking ${url.host}…`);
    let check = { embeddable: null, reason: 'check failed' };
    try {
      check = await (await fetch(`/api/office/frame-check?url=${encodeURIComponent(url.href)}`)).json();
    } catch {
      // Dev server unreachable: try the frame anyway.
    }
    if (check.embeddable === false) {
      return say(`${url.host} doesn’t allow being shown inside another page (${check.reason}). Use “Share a window” for it instead.`, 'error');
    }
    clear(info, s);
    const frame = el('iframe', 'computer-frame');
    frame.src = url.href;
    frame.title = url.host;
    frame.allow = 'clipboard-read; clipboard-write; fullscreen';
    s.container.replaceChildren(frame);
    s.mode = 'url';
    s.url = url.href;
    s.texture = pageCard(url, info.color);
    setScreen(info, s.texture);
    say(check.embeddable ? `Showing ${url.host}.` : `Showing ${url.host} — couldn’t check it first, so if it stays blank it doesn’t allow embedding.`);
  };

  const shareWindow = async (info) => {
    const s = state(info);
    let stream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: false });
    } catch {
      return say('Sharing was cancelled.', '');
    }
    clear(info, s);
    const video = el('video', 'computer-video');
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.srcObject = stream;
    s.container.replaceChildren(video);
    video.play().catch(() => {});
    const texture = new THREE.VideoTexture(video);
    texture.colorSpace = THREE.SRGBColorSpace;
    Object.assign(s, { mode: 'share', stream, texture, url: '' });
    setScreen(info, texture);
    // The browser's own "Stop sharing" ends the track: switch the screen off with it.
    stream.getVideoTracks()[0]?.addEventListener('ended', () => {
      if (s.stream === stream) {
        clear(info, s);
        if (current?.id === info.id) say('Sharing stopped.');
      }
    });
    say('Sharing a window. It’s view-only here — click in the real window to use it.');
  };

  toolbar.addEventListener('submit', (e) => {
    e.preventDefault();
    if (current) openUrl(current, input.value);
  });
  share.addEventListener('click', () => current && shareWindow(current));
  stop.addEventListener('click', () => {
    if (!current) return;
    clear(current, state(current));
    say('Screen off.');
  });
  close.addEventListener('click', () => api.close());
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) api.close();
  });

  const api = {
    open(info) {
      current = info;
      const s = state(info);
      for (const other of states.values()) other.container.hidden = other !== s;
      title.textContent = `🖥️ ${info.title}`;
      input.value = s.mode === 'url' ? s.url : '';
      say(s.mode === 'share' ? 'Sharing a window.' : s.mode === 'url' ? `Showing ${new URL(s.url).host}.` : 'Open a page, or share a window from your desktop.');
      panel.hidden = false;
      input.focus();
    },
    // Hides the panel; whatever is on the computer keeps running and stays on its monitor.
    close() {
      panel.hidden = true;
    },
  };
  return api;
}

// Accepts "localhost:3000", "wikipedia.org", "https://…". Local addresses get http://, everything else https://.
export function normaliseUrl(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(text);
  const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(text) ? text : `${local ? 'http' : 'https'}://${text}`;
  try {
    const url = new URL(withScheme);
    const plausibleHost = local || url.hostname === 'localhost' || url.hostname.includes('.');
    return /^https?:$/.test(url.protocol) && plausibleHost ? url : null;
  } catch {
    return null;
  }
}

// What the 3D monitor shows for a page: the site's host on a card in the desk's role colour.
function pageCard(url, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 292;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f7f5f0';
  ctx.fillRect(0, 0, 512, 292);
  ctx.fillStyle = `#${new THREE.Color(color).getHexString()}`;
  ctx.fillRect(0, 0, 512, 46);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 22px system-ui, "Segoe UI", sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText('● ● ●', 16, 24);
  ctx.fillStyle = '#2b2a33';
  ctx.font = '800 40px system-ui, "Segoe UI", sans-serif';
  ctx.fillText(`🌐 ${url.host}`.slice(0, 26), 24, 140);
  ctx.fillStyle = '#7a7d86';
  ctx.font = '500 24px system-ui, "Segoe UI", sans-serif';
  ctx.fillText(url.pathname.slice(0, 34), 24, 196);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Text is always set via textContent, never parsed as HTML.
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
