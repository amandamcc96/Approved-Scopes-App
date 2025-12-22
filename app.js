const API = 'http://localhost:5501/api/systems';

let systems = [];
const list = document.getElementById('list');
const details = document.getElementById('details');
const search = document.getElementById('search');

// The exact column headings from your spreadsheet:
const HEADERS = [
  'System Name',
  'Type of software',
  'Pre-approved?',
  'Pricing',
  'Next Steps',
  'Notes',
  'API Docs',
  'Approved Scopes',
  'Approval Date',
  'Research Doc',
  'Website/Useful links'
];

// Helper: strip HTML tags from a string
function stripTags(str) {
  return str ? String(str).replace(/<[^>]*>/g, '') : '';
}

// Load all systems from all sheets (ERP / CRM / Other Systems)
fetch(API)
  .then((r) => r.json())
  .then((data) => {
    systems = data || [];
    renderList(systems);
  })
  .catch((err) => {
    console.error('Failed to load systems', err);
  });

// Get a nice display name for each system (plain text)
function getSystemName(s) {
  const candidates = [s['System Name'], s['ERP'], s['CRM'], s['Other System']];

  for (const c of candidates) {
    const plain = stripTags(c).trim();
    if (plain) return plain;
  }

  return '(no name)';
}

// Filter list as the user types
search.addEventListener('input', () => {
  const q = search.value.toLowerCase();
  const filtered = systems.filter((s) =>
    getSystemName(s).toLowerCase().includes(q)
  );
  renderList(filtered);
});

// Show clickable list of systems (acts like a dropdown list under the search)
function renderList(items) {
  list.innerHTML = '';

  if (!items.length) {
    const empty = document.createElement('div');
    empty.textContent = 'No systems found';
    empty.style.color = '#888';
    empty.style.fontSize = '12px';
    list.appendChild(empty);
    return;
  }

  items.forEach((s) => {
    const div = document.createElement('div');
    div.textContent = getSystemName(s);
    div.style.border = '1px solid #ccc';
    div.style.margin = '4px 0';
    div.style.padding = '6px 8px';
    div.style.cursor = 'pointer';
    div.style.borderRadius = '4px';
    div.onmouseenter = () => (div.style.background = '#f5f5f5');
    div.onmouseleave = () => (div.style.background = 'transparent');
    div.onclick = () => showDetails(s);
    list.appendChild(div);
  });
}

// Create detail boxes for all columns on the right
function showDetails(system) {
  details.innerHTML = '';

  if (!system) return;

  HEADERS.forEach((header) => {
    const rawValue = system[header];
    const value = rawValue == null ? '' : String(rawValue).trim(); // HTML string from backend
    const plain = stripTags(value).trim(); // plain text version (no tags)

    // Card container
    const card = document.createElement('div');
    card.style.border = '1px solid #ddd';
    card.style.borderRadius = '8px';
    card.style.padding = '8px 10px';
    card.style.margin = '6px 0';
    card.style.background = '#ffffff';

    // Title (column name)
    const title = document.createElement('div');
    title.textContent = header;
    title.style.fontSize = '12px';
    title.style.fontWeight = '600';
    title.style.marginBottom = '4px';
    title.style.color = '#333';
    card.appendChild(title);

    // === SPECIAL CASES ===

    // 1) Approved Scopes — the ONLY editable field
    if (header === 'Approved Scopes') {
      const textarea = document.createElement('textarea');
      textarea.value = plain; // use plain text for editing
      textarea.placeholder = 'Add scope notes here...';
      textarea.style.width = '100%';
      textarea.style.minHeight = '60px';
      textarea.style.fontSize = '12px';
      textarea.style.resize = 'vertical';
      textarea.style.boxSizing = 'border-box';
      textarea.style.padding = '4px';
      card.appendChild(textarea);

      const saveBtn = document.createElement('button');
      saveBtn.textContent = 'Save scopes';
      saveBtn.style.marginTop = '6px';
      saveBtn.style.fontSize = '11px';
      saveBtn.style.padding = '4px 8px';
      saveBtn.style.cursor = 'pointer';
      saveBtn.onclick = () => {
        saveScope(system, textarea.value);
      };
      card.appendChild(saveBtn);

      details.appendChild(card);
      return;
    }

    // 2) Pre-approved? — simple Yes/No with optional checkmark
    if (header === 'Pre-approved?') {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '6px';
      row.style.fontSize = '12px';

      const lower = plain.toLowerCase();
      const isYes = lower === 'yes';

      if (isYes) {
        const check = document.createElement('span');
        check.textContent = '✓'; // or '✔'
        check.style.color = '#15803d'; // subtle green
        check.style.fontSize = '14px';
        row.appendChild(check);
      }

      const text = document.createElement('span');
      if (!plain) {
        text.textContent = '-';
        text.style.color = '#6b7280';
      } else {
        const pretty =
          plain.charAt(0).toUpperCase() + plain.slice(1).toLowerCase(); // Yes / No / Other
        text.textContent = pretty;
      }

      row.appendChild(text);
      card.appendChild(row);

      details.appendChild(card);
      return;
    }

    // 3) Research Doc — open Google Doc
    if (header === 'Research Doc') {
      // Use plain text to determine the URL
      const urlCandidatePlain = plain || stripTags(system['Information']);

      if (
        urlCandidatePlain &&
        (urlCandidatePlain.startsWith('http://') ||
          urlCandidatePlain.startsWith('https://'))
      ) {
        const btn = document.createElement('button');
        btn.textContent = 'Open Research Doc';
        btn.style.fontSize = '11px';
        btn.style.padding = '6px 10px';
        btn.style.cursor = 'pointer';
        btn.onclick = () => window.open(urlCandidatePlain, '_blank');
        card.appendChild(btn);
      } else {
        const span = document.createElement('div');
        span.textContent = '-';
        span.style.fontSize = '12px';
        card.appendChild(span);
      }

      details.appendChild(card);
      return;
    }

    // 4) Website/Useful links — support multiple URLs
    if (header === 'Website/Useful links') {
      const plainLinks = plain;

      if (plainLinks) {
        const container = document.createElement('div');
        plainLinks
          .split(/[\n,]+/)
          .map((v) => v.trim())
          .filter(Boolean)
          .forEach((url) => {
            const a = document.createElement('a');
            a.href = url;
            a.textContent = url;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.style.display = 'block';
            a.style.fontSize = '11px';
            a.style.wordBreak = 'break-all';
            a.style.color = '#1a0dab';
            container.appendChild(a);
          });
        card.appendChild(container);
      } else {
        const span = document.createElement('div');
        span.textContent = '-';
        span.style.fontSize = '12px';
        card.appendChild(span);
      }

      details.appendChild(card);
      return;
    }

    // === GENERIC YES/NO HANDLING for any other column ===
    const lower = plain.toLowerCase();
    if (lower === 'yes' || lower === 'no') {
      const display = document.createElement('div');
      display.textContent = plain ? plain.toUpperCase() : '-';
      display.style.fontSize = '16px';
      display.style.fontWeight = '700';
      display.style.textAlign = 'center';
      card.appendChild(display);

      details.appendChild(card);
      return;
    }

    // === DEFAULT: read-only text box for other columns, with HTML formatting ===
    const content = document.createElement('div');
    content.style.fontSize = '12px';
    content.style.whiteSpace = 'pre-wrap';
    content.innerHTML = value || '-'; // render bold/italic/etc.
    card.appendChild(content);

    details.appendChild(card);
  });

  // Optional: show sheet + id at the bottom as meta-info
  if (system.sheet || system.id) {
    const meta = document.createElement('div');
    meta.style.fontSize = '10px';
    meta.style.color = '#888';
    meta.style.marginTop = '8px';
    meta.textContent =
      (system.sheet ? `Sheet: ${system.sheet}` : '') +
      (system.id ? `  |  ID: ${system.id}` : '');
    details.appendChild(meta);
  }
}

// Save "Approved Scopes" back to the sheet via backend
function saveScope(system, newScope) {
  if (!system || !system.id) {
    alert('Cannot save: missing system id from API');
    return;
  }

  const url = `${API}/${encodeURIComponent(system.id)}/scope`;

  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scope: newScope })
  })
    .then((res) => {
      if (!res.ok) throw new Error('Request failed');
      system['Approved Scopes'] = newScope;
      alert('Approved scopes saved');
    })
    .catch((err) => {
      console.error(err);
      alert('Error saving scopes');
    });
}
