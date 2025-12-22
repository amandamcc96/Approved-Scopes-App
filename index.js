// index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');

const app = express();

app.use(cors());
app.use(express.json());

// TODO: replace with your real Google Sheet ID
const SPREADSHEET_ID = '6lwrs3gw0A0p486FVH4ekgMBVbS0wi8n-IPnqTseJxI';

// Tabs in your spreadsheet that should be included
const SHEET_NAMES = ['ERP', 'CRM', 'OTHER SYSTEMS'];

// Google service account auth using .env values
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  },
  // read + write so we can update the Scope column
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

async function getSheetsClient() {
  const authClient = await auth.getClient();
  return google.sheets({ version: 'v4', auth: authClient });
}

// Convert rows to objects with headers as keys
function convertSheetToObjects(rows, sheetName) {
  if (!rows || rows.length < 2) return [];

  const headers = rows[0];
  const dataRows = rows.slice(1);

  return dataRows.map((row, index) => {
    const obj = {
      id: `${sheetName}-${index}`,
      sheet: sheetName,
      _rowIndex: index, // used for updating the correct row
    };

    headers.forEach((header, i) => {
      obj[header] = row[i] ?? '';
    });

    return obj;
  });
}

// GET /api/systems -> all rows from all sheets
app.get('/api/systems', async (req, res) => {
  try {
    const sheets = await getSheetsClient();
    let allSystems = [];

    for (const sheetName of SHEET_NAMES) {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheetName}!A1:Z2000`,
      });

      const rows = response.data.values || [];
      const systems = convertSheetToObjects(rows, sheetName);
      allSystems = allSystems.concat(systems);
    }

    res.json(allSystems);
  } catch (err) {
    console.error('Error loading systems', err);
    res.status(500).json({ error: 'Failed to load systems from Google Sheets' });
  }
});

// Helper: 0 -> A, 1 -> B, ...
function columnIndexToLetter(index) {
  let letters = '';
  index += 1;
  while (index > 0) {
    const remainder = (index - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    index = Math.floor((index - 1) / 26);
  }
  return letters;
}

/*
 * PUT /api/system-field
 * Only allows updating the "Scope" column for safety.
 *
 * Body example:
 * {
 *   "sheet": "ERP",
 *   "rowIndex": 0,
 *   "columnName": "Scope",
 *   "value": "Updated scope here"
 * }
 */
app.put('/api/system-field', async (req, res) => {
  try {
    const { sheet, rowIndex, columnName, value } = req.body;

    if (!sheet || rowIndex === undefined || !columnName) {
      return res.status(400).json({
        error: 'sheet, rowIndex, and columnName are required',
      });
    }

    // Safety check: only allow updating the Scope column
    if (columnName !== 'Scope') {
      return res.status(403).json({ error: 'Only the "Scope" column can be edited via the app.' });
    }

    const sheets = await getSheetsClient();

    // Get header row to find correct column index
    const headerResp = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheet}!A1:Z1`,
    });

    const headers = headerResp.data.values?.[0] || [];
    const colIndex = headers.indexOf(columnName);

    if (colIndex === -1) {
      return res
        .status(400)
        .json({ error: `Column "${columnName}" not found in sheet "${sheet}"` });
    }

    const colLetter = columnIndexToLetter(colIndex);
    const sheetRowNumber = rowIndex + 2; // +2: headers row + 1-based index
    const range = `${sheet}!${colLetter}${sheetRowNumber}`;

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[value]],
      },
    });

    res.json({ success: true, sheet, rowIndex, columnName, value });
  } catch (err) {
    console.error('Error updating cell', err);
    res.status(500).json({ error: 'Failed to update Scope cell' });
  }
});

const PORT = process.env.PORT || 5500;
app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
