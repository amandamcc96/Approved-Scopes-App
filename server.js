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

    for (const sheetName of sheetNames) {
      // Pull grid data INCLUDING formatting
      const result = await sheets.spreadsheets.get({
        auth,
        spreadsheetId: SPREADSHEET_ID,
        ranges: [`${sheetName}!A1:Z`],
        includeGridData: true
      });

      const sheet = result.data.sheets && result.data.sheets[0];
      if (!sheet || !sheet.data || !sheet.data[0] || !sheet.data[0].rowData) {
        continue;
      }

      const rowData = sheet.data[0].rowData;
      if (!rowData.length) continue;

      // First row: headers (plain text)
      const headerRow = rowData[0];
      const headerValues = headerRow.values || [];
      const headers = headerValues.map((cell) => (cell && cell.formattedValue) || '');

      if (!headers.length) continue;

      // Remaining rows: data
      for (let i = 1; i < rowData.length; i++) {
        const row = rowData[i];
        if (!row || !row.values) continue;

        const cellValues = row.values;
        const obj = {};

        headers.forEach((h, colIndex) => {
          if (!h) return;
          const cell = cellValues[colIndex] || {};
          const html = cellToHtml(cell);
          obj[h] = html || '';
        });

        // Determine if this row has a "name" in any of the expected columns
        const rawName =
          obj['System Name'] ||
          obj['ERP'] ||
          obj['CRM'] ||
          obj['Other System'];

        const plainName = rawName
          ? String(rawName).replace(/<[^>]*>/g, '').trim()
          : '';

        if (!plainName) {
          continue; // skip empty rows
        }

        const rowNumber = i + 1; // +1 because Sheets rows start at 1

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

// POST /api/systems/:id/scope - update Approved Scopes cell (plain text)
app.post('/api/systems/:id/scope', async (req, res) => {
  try {
    const auth = await getAuth();
    const id = req.params.id;
    const [sheetName, rowStr] = id.split('__');
    const rowNumber = parseInt(rowStr, 10);

    if (!sheetName || !rowNumber) {
      return res.status(400).json({ error: 'Invalid system id' });
    }

    const newScope = req.body.scope || '';

    // Get header row to find "Approved Scopes"
    const headerRes = await sheets.spreadsheets.values.get({
      auth,
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A1:Z1`
    });

    const headers = (headerRes.data.values && headerRes.data.values[0]) || [];
    const colIndex = headers.indexOf('Approved Scopes');

    if (colIndex === -1) {
      return res
        .status(500)
        .json({ error: 'Approved Scopes column not found in sheet' });
    }

    // Convert colIndex (0-based) to column letter (A, B, C, ...)
    const columnLetter = String.fromCharCode('A'.charCodeAt(0) + colIndex);
    const range = `${sheetName}!${columnLetter}${rowNumber}`;

    await sheets.spreadsheets.values.update({
      auth,
      spreadsheetId: SPREADSHEET_ID,
      range,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[newScope]]
      }
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('Error in POST /api/systems/:id/scope', err);
    res.status(500).json({ error: 'Failed to update Approved Scopes' });
  }
});

app.get('/', (req, res) => {
  res.send('Inquiry Compilation API running');
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});