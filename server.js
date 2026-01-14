require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;
if (!SPREADSHEET_ID) {
  console.warn('Warning: GOOGLE_SHEET_ID is not set.');
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

// Helper to get all sheet/tab names in the spreadsheet
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

// GET /api/systems - list all systems from all sheets (values-only)
app.get('/api/systems', async (req, res) => {
  try {
    const auth = await getAuth();
    const sheetNames = await getSheetNames(auth);

    const allRows = [];

    for (const sheetName of sheetNames) {
      const result = await sheets.spreadsheets.values.get({
        auth,
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheetName}!A1:Z2000` // A-K covers your 11 columns
      });

      const rows = result.data.values || [];
      if (!rows.length) continue;

      const headers = rows[0] || [];
      if (!headers.length) continue;

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

        const rowNumber = i + 1; // Google Sheets rows are 1-indexed
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

    // Read header row to find the "Approved Scopes" column index
    const headerRes = await sheets.spreadsheets.values.get({
      auth,
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A1:K1`
    });

    const headers = (headerRes.data.values && headerRes.data.values[0]) || [];
    const colIndex = headers.indexOf('Approved Scopes');

    if (colIndex === -1) {
      return res.status(500).json({ error: 'Approved Scopes column not found' });
    }

    // Convert colIndex (0-based) to column letter (A-K)
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

// POST /api/systems/:id/observations - update Observations cell (plain text)
app.post('/api/systems/:id/observations', async (req, res) => {
  try {
    const auth = await getAuth();
    const id = req.params.id;

    const [sheetName, rowStr] = id.split('__');
    const rowNumber = parseInt(rowStr, 10);

    if (!sheetName || !rowNumber) {
      return res.status(400).json({ error: 'Invalid system id' });
    }

    const newObs = req.body.observations || '';

    // Find the Observations column
    const headerRes = await sheets.spreadsheets.values.get({
      auth,
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A1:Z1`
    });

    const headers = (headerRes.data.values && headerRes.data.values[0]) || [];
    const colIndex = headers.indexOf('Observations');

    if (colIndex === -1) {
      return res.status(500).json({ error: 'Observations column not found' });
    }

    const columnLetter = String.fromCharCode('A'.charCodeAt(0) + colIndex);
    const range = `${sheetName}!${columnLetter}${rowNumber}`;

    await sheets.spreadsheets.values.update({
      auth,
      spreadsheetId: SPREADSHEET_ID,
      range,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[newObs]]
      }
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('Error in POST /api/systems/:id/observations', err);
    res.status(500).json({ error: 'Failed to update Observations' });
  }
});
app.get('/', (req, res) => {
  res.send('Inquiry Compilation API running');
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
