// Side panel opened from the skills board: a searchable list of skills grouped by source, and a detail view.
export function createSkillsPanel(skills) {
  const sources = [...new Set(skills.map((s) => s.source))];

  const panel = el('aside', 'panel');
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Skills library');

  const header = el('header', 'panel-header');
  const title = el('h2', 'panel-title');
  const close = el('button', 'panel-close', '×');
  close.setAttribute('aria-label', 'Close');
  header.append(title, close);

  const listView = el('div', 'panel-body');
  const search = el('input', 'panel-search');
  search.type = 'search';
  search.placeholder = `Search ${skills.length} skills`;
  const list = el('div', 'panel-list');
  listView.append(search, list);

  const detailView = el('div', 'panel-body');
  detailView.hidden = true;

  panel.append(header, listView, detailView);
  document.body.append(panel);

  const showList = () => {
    title.textContent = 'Skills library';
    listView.hidden = false;
    detailView.hidden = true;
    renderList(search.value);
  };

  const showSkill = (skill) => {
    title.textContent = skill.name;
    listView.hidden = true;
    detailView.hidden = false;
    detailView.replaceChildren(
      backButton(showList),
      el('span', `badge source-${sources.indexOf(skill.source)}`, skill.source),
      el('p', 'skill-description', skill.description || 'No description.'),
      el('h3', 'panel-subhead', 'SKILL.md'),
      el('pre', 'skill-body', skill.body || '(empty)')
    );
    detailView.scrollTop = 0;
  };

  const renderList = (query) => {
    const q = query.trim().toLowerCase();
    const matches = skills.filter((s) => !q || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q));
    list.replaceChildren(
      ...sources.flatMap((source, i) => {
        const items = matches.filter((s) => s.source === source);
        if (!items.length) return [];
        return [
          el('h3', 'panel-subhead', `${source} · ${items.length}`),
          ...items.map((skill) => {
            const item = el('button', 'skill-item');
            item.append(el('span', `dot source-${i}`), el('strong', '', skill.name), el('span', 'skill-summary', skill.description));
            item.addEventListener('click', () => showSkill(skill));
            return item;
          }),
        ];
      })
    );
    if (!matches.length) list.append(el('p', 'panel-empty', 'No skills match.'));
  };

  search.addEventListener('input', () => renderList(search.value));
  close.addEventListener('click', () => api.close());
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) api.close();
  });

  const api = {
    open(skill) {
      panel.hidden = false;
      if (skill) showSkill(skill);
      else showList();
    },
    close() {
      panel.hidden = true;
    },
  };
  return api;
}

function backButton(onClick) {
  const button = el('button', 'panel-back', '← All skills');
  button.addEventListener('click', onClick);
  return button;
}

// Text is always set via textContent: skill files are rendered as plain text, never HTML.
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
