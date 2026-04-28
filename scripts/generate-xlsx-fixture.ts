import ExcelJS from 'exceljs';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

const outDir = resolve('./fixtures/templates/xlsx/summary');
mkdirSync(outDir, { recursive: true });

async function generate() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'report-service';
  workbook.created = new Date();

  // Sheet 1: Resumo
  const summarySheet = workbook.addWorksheet('Resumo');
  summarySheet.getCell('A1').value = 'Relatório:';
  summarySheet.getCell('B1').value = '{{reportTitle}}';
  summarySheet.getCell('B1').name = 'ReportTitle';

  summarySheet.getCell('A2').value = 'Período:';
  summarySheet.getCell('B2').value = '{{period}}';
  summarySheet.getCell('B2').name = 'Period';

  summarySheet.getCell('A3').value = 'Empresa:';
  summarySheet.getCell('B3').value = '{{tenantName}}';
  summarySheet.getCell('B3').name = 'TenantName';

  summarySheet.getCell('A5').value = 'Receita Total:';
  summarySheet.getCell('B5').value = 0;
  summarySheet.getCell('B5').name = 'TotalRevenue';
  summarySheet.getCell('B5').numFmt = '#,##0.00';

  summarySheet.getCell('A6').value = 'Despesa Total:';
  summarySheet.getCell('B6').value = 0;
  summarySheet.getCell('B6').name = 'TotalExpense';
  summarySheet.getCell('B6').numFmt = '#,##0.00';

  summarySheet.getCell('A7').value = 'Saldo:';
  summarySheet.getCell('B7').value = 0;
  summarySheet.getCell('B7').name = 'Balance';
  summarySheet.getCell('B7').numFmt = '#,##0.00';

  summarySheet.getColumn('A').width = 18;
  summarySheet.getColumn('B').width = 30;

  // Sheet 2: Transações
  const txSheet = workbook.addWorksheet('Transações');
  txSheet.addRow(['Data', 'Descrição', 'Valor', 'Status']);
  const headerRow = txSheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A56DB' } };
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  txSheet.getColumn(1).width = 14;
  txSheet.getColumn(2).width = 35;
  txSheet.getColumn(3).width = 15;
  txSheet.getColumn(4).width = 14;

  const outPath = resolve(outDir, 'v1.xlsx');
  await workbook.xlsx.writeFile(outPath);
  console.log(`Generated: ${outPath}`);
}

generate().catch(console.error);
