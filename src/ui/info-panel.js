// General-purpose side panel for things in the office the player inspects (team boards, the knowledge hub, ...).
// Content is a title, an optional note and a list of rows, each optionally linking out.
export function createInfoPanel() {
  const panel = el('aside', 'panel');
  panel.hidden = true;

  const header = el('header', 'panel-header');
  const title = el('h2', 'panel-title');
  const close = el('button', 'panel-close', '×');
  close.setAttribute('aria-label', 'Close');
  header.append(title, close);

  const body = el('div', 'panel-body');
  panel.append(header, body);
  document.body.append(panel);

  close.addEventListener('click', () => api.close());
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) api.close();
  });

  const api = {
    get isOpen() {
      return !panel.hidden;
    },
    // rows: [{ title, subtitle?, url?, onClick? }]; sections: [{ heading, rows }] for several titled lists;
    // actions: [{ label, kind: 'primary' | 'danger', onClick }] shown as buttons under the note;
    // text: a long block shown as-is in a scrolling box. keepScroll leaves the scroll position alone (live refresh).
    open({ heading, badge, note, text, rowsHeading, rows = [], sections = [], actions = [], keepScroll = false }) {
      const scrollTop = body.scrollTop;
      title.textContent = heading;
      panel.setAttribute('aria-label', heading);
      const children = [];
      if (badge) children.push(el('span', 'badge source-0', badge));
      if (note) children.push(el('p', 'skill-description', note));
      if (actions.length) {
        const bar = el('div', 'panel-actions');
        for (const action of actions) {
          const button = el('button', `panel-action ${action.kind ?? ''}`, action.label);
          button.type = 'button';
          button.addEventListener('click', () => action.onClick(button));
          bar.append(button);
        }
        children.push(bar);
      }
      if (text !== undefined) children.push(el('pre', 'skill-body panel-text', text));
      if (rowsHeading) children.push(el('h3', 'panel-subhead', rowsHeading));
      for (const row of rows) children.push(rowElement(row));
      for (const section of sections) {
        children.push(el('h3', 'panel-subhead', section.heading));
        if (!section.rows.length) children.push(el('p', 'panel-empty', 'None'));
        for (const row of section.rows) children.push(rowElement(row));
      }
      body.replaceChildren(...children);
      body.scrollTop = keepScroll ? scrollTop : 0;
      panel.hidden = false;
    },
    get heading() {
      return title.textContent;
    },
    close() {
      panel.hidden = true;
    },
  };
  return api;
}

function rowElement({ title, subtitle, url, onClick, failed }) {
  const row = url ? el('a', 'skill-item') : onClick ? el('button', 'skill-item') : el('div', 'skill-item');
  if (onClick) {
    row.type = 'button';
    row.addEventListener('click', onClick);
  }
  if (url) {
    row.href = url;
    row.target = '_blank';
    row.rel = 'noopener';
  }
  if (failed) row.classList.add('is-failed');
  row.append(el('span', 'dot source-0'), el('strong', '', title));
  if (subtitle) row.append(el('span', 'skill-summary', subtitle));
  return row;
}

// Text is always set via textContent, never parsed as HTML.
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
