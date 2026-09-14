/**
 * Tempel kode ini di: Google Sheet Anda -> Extensions -> Apps Script
 * Lalu Deploy -> New deployment -> Web app -> Execute as: Me, Who has access: Anyone.
 * Salin URL hasil deploy (diakhiri /exec) dan tempel di dashboard,
 * pada panel "Sumber Data" -> "2 - Sumber otomatis (live)".
 */
function doGet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Sheet1"); // ganti sesuai nama tab sheet Anda

  var values = sheet.getDataRange().getValues();
  var headers = values[0];
  var rows = [];

  for (var i = 1; i < values.length; i++) {
    var row = {};
    for (var j = 0; j < headers.length; j++) {
      var cell = values[i][j];
      if (cell instanceof Date) {
        cell = Utilities.formatDate(cell, ss.getSpreadsheetTimeZone(), "dd/MM/yyyy HH:mm:ss");
      }
      row[headers[j]] = cell;
    }
    rows.push(row);
  }

  return ContentService
    .createTextOutput(JSON.stringify(rows))
    .setMimeType(ContentService.MimeType.JSON);
}
