require('dotenv').config();
console.log('CWD =', process.cwd());
console.log('process.env.PORT =', process.env.PORT);
const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;
if (!SPREADSHEET_ID) {
  console.warn('Warning: GOOGLE_SHEET_ID is not set in your .env file.');
}

const sheets = google.sheets('v4');

function getAuth() {
  return new google.auth.JWT(
    process.env.GOOGLE_CLIENT_EMAIL,
    undefined,
    (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    ['https://www.googleapis.com/auth/spreadsheets']
  );
}

// Helper to convert a single cell (with possible rich text) into HTML
function cellToHtml(cell) {
  if (!cell) return '';

  const text = cell.formattedValue || '';
  const runs = cell.textFormatRuns;

  if (!runs || runs.length === 0) {
    // No rich text segments, just return the text
    return text;
  }

  let html = '';
  for (let i = 0; i < runs.length; i++) {
    const start = runs[i].startIndex || 0;
    const end = runs[i + 1]?.startIndex ?? text.length;
    const segment = text.substring(start, end);
    const format = runs[i].format || {};

    let wrapped = segment;

    // Apply formatting tags; order doesn't matter much here
    if (format.bold) wrapped = `<strong>${wrapped}</strong>`;
    if (format.italic) wrapped = `<em>${wrapped}</em>`;
    if (format.underline) wrapped = `<u>${wrapped}</u>`;

    html += wrapped;
  }

  return html;
}

// Helper to get sheet names
async function getSheetNames(auth) {
  const res = await sheets.spreadsheets.get({
    auth,
    spreadsheetId: SPREADSHEET_ID,
    fields: 'sheets.properties.title'
  });

  const sheetProps = res.data.sheets || [];
  return sheetProps
    .map((sh) => sh.properties && sh.properties.title)
    .filter(Boolean);
}

// GET /api/systems - list all systems from all sheets, with formatted cell HTML
app.get('/api/systems', async (req, res) => {
  try {
    const auth = await getAuth();
    const sheetNames = await getSheetNames(auth);

    const allRows = [];

    const result = await sheets.spreadsheets.values.get({
  auth,
  spreadsheetId: SPREADSHEET_ID,
  range: `${sheetName}!A1:K2000` // adjust if you expect more than 2000 rows
});
      const sheet = result.data.sheets && result.data.sheets[0];
      if (!sheet || !sheet.data || !sheet.data[0] || !sheet.data[0].rowData) {
        continue;
      }

  const rows = (result.data.values || []);
if (!rows.length) continue;

const headers = rows[0];
for (let i = 1; i < rows.length; i++) {
  const row = rows[i];
  const obj = {};

  headers.forEach((h, colIndex) => {
    if (!h) return;
    obj[h] = row[colIndex] || '';
  });

  const rawName =
    obj['System Name'] ||
    obj['ERP'] ||
    obj['CRM'] ||
    obj['Other System'];

  const plainName = rawName ? String(rawName).trim() : '';
  if (!plainName) continue;

  const rowNumber = i + 1;
  obj.id = `${sheetName}__${rowNumber}`;
  obj.sheet = sheetName;

  allRows.push(obj);
}

    res.json(allRows);
  } catch (err) {
    console.error('Error in GET /api/systems', err);
    res.status(500).json({ error: 'Failed to load systems' });
  }
});

// POST /api/systems/:id/scope - update Approved Scopes cell (plain text)
app.get('/api/systems', async (req, res) => {
  try {
    const auth = await getAuth();
    const sheetNames = await getSheetNames(auth);

    const allRows = [];

    for (const sheetName of sheetNames) {
      // Lightweight: values only (no formatting)
      const result = await sheets.spreadsheets.values.get({
        auth,
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheetName}!A1:K2000` // covers your 11 columns
      });

      const rows = result.data.values || [];
      if (!rows.length) continue;

      const headers = rows[0];
      if (!headers || !headers.length) continue;

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i] || [];
        const obj = {};

        headers.forEach((h, colIndex) => {
          if (!h) return;
          obj[h] = row[colIndex] || '';
        });

        const rawName =
          obj['System Name'] ||
          obj['ERP'] ||
          obj['CRM'] ||
          obj['Other System'];

        const plainName = rawName ? String(rawName).trim() : '';
        if (!plainName) continue;

        const rowNumber = i + 1; // sheet rows are 1-indexed
        obj.id = `${sheetName}__${rowNumber}`;
        obj.sheet = sheetName;

        allRows.push(obj);
      }
    }

    res.json(allRows);
  } catch (err) {
    console.error('Error in GET /api/systems', err);
    res.status(500).json({ error: 'Failed to load systems' });
  }
});

app.get('/', (req, res) => {
  res.send('Inquiry Compilation API running');
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
