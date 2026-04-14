import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { saveCase } from '@/lib/voc-db';
import type { AnalysisResult, RiskLevel } from '@/types/voc';

interface ImportRow {
  productName?: string;
  substanceType: string;
  characteristics: string;
  riskLevel: RiskLevel;
  riskReason?: string;
  estimatedSource?: string;
  recommendedActions?: string;
  csScript: string;
  imageBase64?: string;
}

const HEADER_MAP: Record<string, keyof ImportRow> = {
  '제품명': 'productName',
  'productName': 'productName',
  'product_name': 'productName',
  '이물질종류': 'substanceType',
  '이물질 종류': 'substanceType',
  'substanceType': 'substanceType',
  'substance_type': 'substanceType',
  '특징': 'characteristics',
  '외관특징': 'characteristics',
  'characteristics': 'characteristics',
  '위험도': 'riskLevel',
  'riskLevel': 'riskLevel',
  'risk_level': 'riskLevel',
  '위험근거': 'riskReason',
  'riskReason': 'riskReason',
  'risk_reason': 'riskReason',
  '추정원인': 'estimatedSource',
  'estimatedSource': 'estimatedSource',
  'estimated_source': 'estimatedSource',
  '권장조치': 'recommendedActions',
  'recommendedActions': 'recommendedActions',
  'recommended_actions': 'recommendedActions',
  'CS스크립트': 'csScript',
  'CS': 'csScript',
  'csScript': 'csScript',
  'cs_script': 'csScript',
};

function normalizeRiskLevel(v: string): RiskLevel {
  const s = (v ?? '').toString().trim().toLowerCase();
  if (['low', '낮음', '하', '1'].includes(s)) return 'low';
  if (['high', '높음', '상', '3'].includes(s)) return 'high';
  return 'medium';
}

function parseRecommendedActions(v: unknown): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(String);
  const str = String(v).trim();
  if (!str) return [];
  if (str.startsWith('[')) {
    try {
      const arr = JSON.parse(str);
      if (Array.isArray(arr)) return arr.map(String);
    } catch {}
  }
  return str.split(/[\n;|]/).map((s) => s.trim()).filter(Boolean);
}

function cellText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object') {
    const v = value as Record<string, unknown>;
    if (typeof v.text === 'string') return v.text;
    if (Array.isArray(v.richText)) {
      return v.richText.map((r) => (r as { text?: string }).text ?? '').join('');
    }
    if (typeof v.result === 'string' || typeof v.result === 'number') return String(v.result);
    if (v.hyperlink && typeof v.text === 'string') return v.text;
  }
  return String(value);
}

async function parseCsv(buffer: Buffer): Promise<{ headers: string[]; rows: string[][] }> {
  const text = buffer.toString('utf-8').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQuote) {
        if (c === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (c === '"') {
          inQuote = false;
        } else cur += c;
      } else {
        if (c === ',') {
          out.push(cur);
          cur = '';
        } else if (c === '"') inQuote = true;
        else cur += c;
      }
    }
    out.push(cur);
    return out;
  };
  const headers = parseLine(lines[0]).map((h) => h.trim());
  const rows = lines.slice(1).map(parseLine);
  return { headers, rows };
}

// 헤더 키 정규화 (공백/대소문자/특수문자 제거)
const NORMALIZED_HEADER_MAP: Record<string, keyof ImportRow> = Object.fromEntries(
  Object.entries(HEADER_MAP).map(([k, v]) => [k.replace(/[\s_-]/g, '').toLowerCase(), v])
);

function normalizeHeader(h: string): string {
  return h.replace(/^\uFEFF/, '').replace(/[\s_-]/g, '').toLowerCase();
}

function buildImportRow(map: Record<string, string>): ImportRow | null {
  const norm: Partial<ImportRow> = {};
  for (const [key, value] of Object.entries(map)) {
    const mapped = NORMALIZED_HEADER_MAP[normalizeHeader(key)];
    if (mapped && value) (norm as Record<string, unknown>)[mapped] = value;
  }
  // 매핑된 값이 하나도 없으면 버림. 그 외에는 최대한 저장(이미지만 있는 행도 허용).
  const hasAny =
    norm.productName ||
    norm.substanceType ||
    norm.characteristics ||
    norm.csScript ||
    norm.riskReason ||
    norm.estimatedSource ||
    norm.recommendedActions;
  if (!hasAny) return null;
  return {
    productName: norm.productName ? String(norm.productName) : undefined,
    substanceType: norm.substanceType ? String(norm.substanceType) : '',
    characteristics: norm.characteristics ? String(norm.characteristics) : '',
    riskLevel: normalizeRiskLevel(String(norm.riskLevel ?? 'medium')),
    riskReason: norm.riskReason ? String(norm.riskReason) : undefined,
    estimatedSource: norm.estimatedSource ? String(norm.estimatedSource) : undefined,
    recommendedActions: norm.recommendedActions ? String(norm.recommendedActions) : undefined,
    csScript: norm.csScript ? String(norm.csScript) : '',
  };
}

async function parseExcel(
  arrayBuffer: ArrayBuffer
): Promise<{ rows: ImportRow[]; diagnostics: { headers: string[]; firstRowSample: Record<string, string> | null; totalRows: number } }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(arrayBuffer as ExcelJS.Buffer);
  const ws = wb.worksheets[0];
  if (!ws) return { rows: [], diagnostics: { headers: [], firstRowSample: null, totalRows: 0 } };

  // 1행 = 헤더
  const headerRow = ws.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber - 1] = cellText(cell.value).trim();
  });

  // 행번호(0-indexed) → ImportRow 매핑
  const rowsByExcelRow = new Map<number, ImportRow>();
  let firstRowSample: Record<string, string> | null = null;
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const map: Record<string, string> = {};
    headers.forEach((h, idx) => {
      if (!h) return;
      const cell = row.getCell(idx + 1);
      map[h] = cellText(cell.value);
    });
    if (r === 2) firstRowSample = map;
    const built = buildImportRow(map);
    if (built) rowsByExcelRow.set(r - 1, built); // exceljs anchor row는 0-indexed
  }

  // 임베디드 이미지 추출 후 행에 매칭 (텍스트가 비어 이미지만 있는 행도 허용)
  const images = ws.getImages();
  for (const img of images) {
    const anchorRow = Math.floor(img.range.tl.nativeRow ?? img.range.tl.row);
    const media = wb.getImage(Number(img.imageId));
    if (!media || !media.buffer) continue;
    const base64 = Buffer.from(media.buffer).toString('base64');
    let target = rowsByExcelRow.get(anchorRow);
    if (!target) {
      target = {
        substanceType: '',
        characteristics: '',
        riskLevel: 'medium',
        csScript: '',
      };
      rowsByExcelRow.set(anchorRow, target);
    }
    target.imageBase64 = base64;
  }

  return {
    rows: Array.from(rowsByExcelRow.values()),
    diagnostics: {
      headers,
      firstRowSample,
      totalRows: ws.rowCount - 1,
    },
  };
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ success: false, error: '파일이 없습니다.' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const isCsv = file.name.toLowerCase().endsWith('.csv');

    let rows: ImportRow[];
    let diagnostics: {
      headers: string[];
      firstRowSample: Record<string, string> | null;
      totalRows: number;
    } = { headers: [], firstRowSample: null, totalRows: 0 };

    if (isCsv) {
      const { headers, rows: rawRows } = await parseCsv(Buffer.from(arrayBuffer));
      rows = rawRows
        .map((r) => {
          const map: Record<string, string> = {};
          headers.forEach((h, i) => (map[h] = r[i] ?? ''));
          return buildImportRow(map);
        })
        .filter((r): r is ImportRow => r !== null);
      diagnostics = {
        headers,
        firstRowSample: rawRows[0]
          ? Object.fromEntries(headers.map((h, i) => [h, rawRows[0][i] ?? '']))
          : null,
        totalRows: rawRows.length,
      };
    } else {
      const result = await parseExcel(arrayBuffer);
      rows = result.rows;
      diagnostics = result.diagnostics;
    }

    let inserted = 0;
    let withImage = 0;
    for (const row of rows) {
      const result: AnalysisResult = {
        substanceType: row.substanceType,
        characteristics: row.characteristics,
        riskLevel: row.riskLevel,
        riskReason: row.riskReason ?? '',
        estimatedSource: row.estimatedSource ?? '',
        recommendedActions: parseRecommendedActions(row.recommendedActions),
        csScript: row.csScript,
      };
      await saveCase(row.productName, result, row.imageBase64);
      inserted++;
      if (row.imageBase64) withImage++;
    }

    return NextResponse.json({
      success: true,
      inserted,
      withImage,
      diagnostics: {
        ...diagnostics,
        recognizedRows: rows.length,
        requiredColumns: ['이물질종류 / substanceType', '특징 / characteristics', 'CS스크립트 / csScript'],
        message:
          inserted === 0
            ? '⚠️ 인식된 행이 0건입니다. 헤더 이름이 매핑 규칙과 다르거나 필수 컬럼(이물질종류/특징/CS스크립트)이 비어있을 수 있습니다. 아래 headers와 firstRowSample을 확인하세요.'
            : undefined,
      },
    });
  } catch (err) {
    console.error('Import error:', err);
    const message = err instanceof Error ? err.message : '업로드 처리 중 오류가 발생했습니다.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
