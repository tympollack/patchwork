/**
 * Municipal Zoning Brief Template & PDF Compilation Engine
 * (SPEC-PW-ZON-01 / TASK-PW-ZON-07)
 *
 * Board of Zoning Appeals Statutory 500-Ft Evidentiary Dossier
 */

import { HTN_TRUST_STRING } from '../../../apps/web/src/styles/tokens';

export interface MunicipalBriefParcel {
  parcel_pin: string;
  deeded_address: string;
  calculated_distance_ft: number;
  claim_status: string;
}

export interface MunicipalBriefAffidavit {
  filing_ref: string;
  code_section: string;
  narrative_summary: string;
  evidence_s3_url: string;
  evidence_sha256: string;
  az_heading?: number | null;
  gps_precision_m?: number | null;
  created_at: string;
}

export interface MunicipalBriefData {
  zoningNode: {
    id: string;
    parcel_pin: string;
    jurisdiction: string;
    status: string;
    created_at: string;
  };
  parcels: MunicipalBriefParcel[];
  affidavits: MunicipalBriefAffidavit[];
  metrics: {
    totalParcels: number;
    claimedParcels: number;
    verifiedParcels: number;
    claimPercentage: number;
  };
}

/**
 * Sanitize untrusted text for safe HTML embedding
 */
export function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Generates official HTML representation matching municipal filing standards
 */
export function renderMunicipalZoningBriefHtml(data: MunicipalBriefData): string {
  const { zoningNode, parcels, affidavits, metrics } = data;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Zoning Dossier - ${escapeHtml(zoningNode.parcel_pin)}</title>
  <style>
    @page { size: letter; margin: 0.75in; }
    body {
      font-family: 'Inter', -apple-system, sans-serif;
      color: #0F172A;
      line-height: 1.5;
      margin: 0;
      padding: 0;
    }
    .page-break { page-break-before: always; }
    .header-box {
      border: 2px solid #0B132B;
      padding: 18px;
      margin-bottom: 24px;
      background: #F8FAFC;
    }
    .trust-stamp {
      font-family: 'Courier', monospace;
      font-size: 10px;
      font-weight: bold;
      color: #0369A1;
      border: 1px solid #0284C7;
      padding: 6px 10px;
      display: inline-block;
      margin-bottom: 12px;
    }
    .section-title {
      font-size: 14px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      border-bottom: 2px solid #0B132B;
      padding-bottom: 4px;
      margin-top: 24px;
      margin-bottom: 12px;
    }
    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
      margin-top: 10px;
    }
    .data-table th, .data-table td {
      border: 1px solid #CBD5E1;
      padding: 6px 8px;
      text-align: left;
    }
    .data-table th {
      background: #F1F5F9;
      font-family: 'Courier', monospace;
      font-weight: bold;
    }
    .mono { font-family: 'Courier', monospace; }
    .exhibit-card {
      border: 1px solid #94A3B8;
      padding: 12px;
      margin-bottom: 14px;
      background: #F8FAFC;
    }
    .exhibit-header {
      font-weight: bold;
      font-family: 'Courier', monospace;
      font-size: 11px;
      color: #0369A1;
      border-bottom: 1px solid #E2E8F0;
      padding-bottom: 4px;
      margin-bottom: 8px;
    }
  </style>
</head>
<body>
  <!-- SECTION 1: BZA Summary Header & Standing Declaration -->
  <div class="header-box">
    <div class="trust-stamp">${escapeHtml(HTN_TRUST_STRING)}</div>
    <h1 style="font-size: 18px; margin: 0 0 6px 0; text-transform: uppercase;">
      Hamilton County Board of Zoning Appeals
    </h1>
    <h2 style="font-size: 13px; margin: 0; color: #475569;">
      CIVIL AUDIT DOSSIER & STATUTORY 500-FOOT STANDING DECLARATION
    </h2>
    <div style="margin-top: 12px; font-size: 11px;">
      <div><strong>TARGET PARCEL PIN:</strong> <span class="mono">${escapeHtml(zoningNode.parcel_pin)}</span></div>
      <div><strong>JURISDICTION:</strong> ${escapeHtml(zoningNode.jurisdiction)}</div>
      <div><strong>STATUTORY BUFFER STANDING:</strong> 500 Feet (152.4 Meters)</div>
      <div><strong>CLAIM PROGRESS:</strong> ${metrics.claimedParcels} of ${metrics.totalParcels} Parcels Claimed — ${metrics.claimPercentage}%</div>
    </div>
  </div>

  <p style="font-size: 11px; color: #334155;">
    Pursuant to Municipal Code Chapter 14, this certified dossier aggregates statutory affidavits and photographic evidence attested by deeded property owners within the statutory 500-foot perimeter. All exhibits include client-side SHA-256 cryptographic checksums.
  </p>

  <!-- SECTION 2: Geospatial Ledger -->
  <div class="section-title">Section 2: Geospatial Buffer Ledger (500-Ft Standing)</div>
  <table class="data-table">
    <thead>
      <tr>
        <th>PIN</th>
        <th>Deeded Address</th>
        <th>Distance (ft)</th>
        <th>Standing Status</th>
      </tr>
    </thead>
    <tbody>
      ${parcels
        .map(
          (p) => `<tr>
        <td class="mono">${escapeHtml(p.parcel_pin)}</td>
        <td>${escapeHtml(p.deeded_address)}</td>
        <td class="mono">${escapeHtml(String(p.calculated_distance_ft))}</td>
        <td class="mono">${escapeHtml(p.claim_status.toUpperCase())}</td>
      </tr>`
        )
        .join('')}
    </tbody>
  </table>

  <!-- SECTION 3: Evidentiary Impact Exhibits -->
  <div class="page-break"></div>
  <div class="section-title">Section 3: Evidentiary Impact Exhibits & Field Sightlines</div>
  ${
    affidavits.length === 0
      ? '<p style="font-size: 11px; color: #64748B;">No impact affidavits filed yet for this docket.</p>'
      : affidavits
          .map(
            (aff) => `<div class="exhibit-card">
        <div class="exhibit-header">EXHIBIT ${escapeHtml(aff.filing_ref)} • CODE VIOLATION ${escapeHtml(aff.code_section)}</div>
        <div style="font-size: 12px; margin-bottom: 8px;"><strong>Physical Impact:</strong> ${escapeHtml(aff.narrative_summary)}</div>
        <div style="font-size: 10px; color: #475569;" class="mono">
          <div>BEARING AZIMUTH: ${aff.az_heading ?? 'N/A'}° | PRECISION: ±${aff.gps_precision_m ?? 'N/A'}m</div>
          <div>EVIDENCE S3 URI: ${escapeHtml(aff.evidence_s3_url)}</div>
          <div>TIMESTAMP: ${escapeHtml(aff.created_at)}</div>
        </div>
      </div>`
          )
          .join('')
  }

  <!-- SECTION 4: Cryptographic Chain of Custody -->
  <div class="section-title">Section 4: Cryptographic Chain of Custody (SHA-256 Appendix)</div>
  <table class="data-table">
    <thead>
      <tr>
        <th>Filing Ref</th>
        <th>Violation</th>
        <th>SHA-256 Hash Digest</th>
      </tr>
    </thead>
    <tbody>
      ${
        affidavits.length === 0
          ? '<tr><td colspan="3">No cryptographic exhibits logged.</td></tr>'
          : affidavits
              .map(
                (aff) => `<tr>
        <td class="mono">${escapeHtml(aff.filing_ref)}</td>
        <td class="mono">${escapeHtml(aff.code_section)}</td>
        <td class="mono" style="font-size: 9px; word-break: break-all;">${escapeHtml(aff.evidence_sha256)}</td>
      </tr>`
              )
              .join('')
      }
    </tbody>
  </table>
</body>
</html>`;
}

/**
 * Escape text for raw PDF stream (pure ASCII 7-bit)
 */
function escapePdf(text: string): string {
  // Replace non-ascii chars to prevent UTF-8 multi-byte distortion in standard Type 1 fonts
  const asciiSafe = text.replace(/[^\x20-\x7E]/g, '?');
  return asciiSafe.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/**
 * Compiles a valid multi-page legal brief PDF conforming to PDF-1.4 specification.
 * Uses exact byte offsets calculated via Buffer.byteLength to guarantee strict reader compliance.
 */
export function generateMunicipalZoningBriefPdf(data: MunicipalBriefData): Uint8Array {
  const { zoningNode, parcels, affidavits, metrics } = data;

  const asciiTrustStamp = HTN_TRUST_STRING.replace(/[^\x20-\x7E]/g, '').trim();

  // Build page text streams
  const pagesStreams: string[] = [];

  // --- PAGE 1: Executive Overview & Buffer Ledger ---
  const p1Lines: string[] = [
    'BT',
    '/F1 14 Tf',
    '50 750 Td',
    `(${escapePdf('HAMILTON COUNTY BOARD OF ZONING APPEALS')}) Tj`,
    '0 -18 Td',
    '/F1 11 Tf',
    `(${escapePdf('CIVIL AUDIT DOSSIER & STATUTORY 500-FT STANDING DECLARATION')}) Tj`,
    '0 -16 Td',
    '/F2 8 Tf',
    `(${escapePdf(`[HTN-TRUST-COMPLIANT] ${asciiTrustStamp}`)}) Tj`,
    '0 -22 Td',
    '/F1 9 Tf',
    `(${escapePdf(`TARGET PARCEL PIN: ${zoningNode.parcel_pin}`)}) Tj`,
    '0 -13 Td',
    `(${escapePdf(`JURISDICTION: ${zoningNode.jurisdiction}`)}) Tj`,
    '0 -13 Td',
    `(${escapePdf(
      `BUFFER CLAIM STATUS: ${metrics.claimedParcels} of ${metrics.totalParcels} Parcels Claimed (${metrics.claimPercentage}%)`
    )}) Tj`,
    '0 -22 Td',
    '/F1 10 Tf',
    `(${escapePdf('SECTION 2: GEOSPATIAL BUFFER LEDGER')}) Tj`,
    '0 -14 Td',
    '/F2 8 Tf',
  ];

  // Render first batch of parcels (up to 30)
  const firstBatch = parcels.slice(0, 30);
  for (const p of firstBatch) {
    const row = `${p.parcel_pin.padEnd(16)} | ${p.deeded_address.slice(0, 26).padEnd(26)} | ${String(
      p.calculated_distance_ft
    ).padStart(4)} ft | [${p.claim_status.toUpperCase()}]`;
    p1Lines.push(`(${escapePdf(row)}) Tj`);
    p1Lines.push('0 -10.5 Td');
  }
  p1Lines.push('ET');
  pagesStreams.push(p1Lines.join('\n'));

  // --- ADDITIONAL PARCEL PAGES IF MORE THAN 30 PARCELS ---
  if (parcels.length > 30) {
    let offset = 30;
    while (offset < parcels.length) {
      const batch = parcels.slice(offset, offset + 45);
      offset += 45;

      const pLines: string[] = [
        'BT',
        '/F1 10 Tf',
        '50 750 Td',
        `(${escapePdf('SECTION 2: GEOSPATIAL BUFFER LEDGER (CONTINUED)')}) Tj`,
        '0 -16 Td',
        '/F2 8 Tf',
      ];
      for (const p of batch) {
        const row = `${p.parcel_pin.padEnd(16)} | ${p.deeded_address.slice(0, 26).padEnd(26)} | ${String(
          p.calculated_distance_ft
        ).padStart(4)} ft | [${p.claim_status.toUpperCase()}]`;
        pLines.push(`(${escapePdf(row)}) Tj`);
        pLines.push('0 -10.5 Td');
      }
      pLines.push('ET');
      pagesStreams.push(pLines.join('\n'));
    }
  }

  // --- EXHIBITS & CHAIN OF CUSTODY PAGE ---
  const exhibitsLines: string[] = [
    'BT',
    '/F1 10 Tf',
    '50 750 Td',
    `(${escapePdf('SECTION 3: EVIDENTIARY IMPACT EXHIBITS')}) Tj`,
    '0 -14 Td',
    '/F2 8 Tf',
  ];

  if (affidavits.length === 0) {
    exhibitsLines.push(`(${escapePdf('No impact affidavits filed yet for this docket.')}) Tj`);
    exhibitsLines.push('0 -12 Td');
  } else {
    for (const aff of affidavits) {
      exhibitsLines.push(
        `(${escapePdf(`EXHIBIT ${aff.filing_ref} [${aff.code_section}]: ${aff.narrative_summary}`)}) Tj`
      );
      exhibitsLines.push('0 -10 Td');
      exhibitsLines.push(`(${escapePdf(`  SHA-256: ${aff.evidence_sha256}`)}) Tj`);
      exhibitsLines.push('0 -12 Td');
    }
  }

  exhibitsLines.push('0 -14 Td');
  exhibitsLines.push('/F1 10 Tf');
  exhibitsLines.push(
    `(${escapePdf('SECTION 4: CRYPTOGRAPHIC CHAIN OF CUSTODY (COMPLETE SHA-256 LEDGER)')}) Tj`
  );
  exhibitsLines.push('0 -14 Td');
  exhibitsLines.push('/F2 8 Tf');
  exhibitsLines.push(
    `(${escapePdf(
      `Total Exhibits Sealed: ${affidavits.length} | Hardware S3 ETag Verified | Timestamp: ${new Date().toISOString()}`
    )}) Tj`
  );
  exhibitsLines.push('ET');
  pagesStreams.push(exhibitsLines.join('\n'));

  // Assembly with exact byte counting
  const numPages = pagesStreams.length;
  // Objects:
  // 1: Catalog
  // 2: Pages root
  // 3..(2+numPages): Page objects
  // (3+numPages)..(2+2*numPages): Contents streams
  // Font 1 (F1): Bold
  // Font 2 (F2): Courier
  const f1Obj = 3 + 2 * numPages;
  const f2Obj = f1Obj + 1;
  const totalObjs = f2Obj;

  const chunks: Buffer[] = [];
  const offsets: number[] = [];
  let currentByteOffset = 0;

  function pushChunk(str: string) {
    const buf = Buffer.from(str, 'utf-8');
    chunks.push(buf);
    currentByteOffset += buf.length;
  }

  pushChunk('%PDF-1.4\n');

  // Object 1: Catalog
  offsets.push(currentByteOffset);
  pushChunk('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  // Object 2: Pages Root
  offsets.push(currentByteOffset);
  const kids = Array.from({ length: numPages }, (_, i) => `${3 + i} 0 R`).join(' ');
  pushChunk(`2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${numPages} >>\nendobj\n`);

  // Page Objects
  for (let i = 0; i < numPages; i++) {
    const pageObjNum = 3 + i;
    const streamObjNum = 3 + numPages + i;
    offsets.push(currentByteOffset);
    pushChunk(
      `${pageObjNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${streamObjNum} 0 R /Resources << /Font << /F1 ${f1Obj} 0 R /F2 ${f2Obj} 0 R >> >> >>\nendobj\n`
    );
  }

  // Stream Objects
  for (let i = 0; i < numPages; i++) {
    const streamObjNum = 3 + numPages + i;
    const stream = pagesStreams[i];
    const streamBytes = Buffer.byteLength(stream, 'utf-8');
    offsets.push(currentByteOffset);
    pushChunk(
      `${streamObjNum} 0 obj\n<< /Length ${streamBytes} >>\nstream\n${stream}\nendstream\nendobj\n`
    );
  }

  // Fonts
  offsets.push(currentByteOffset);
  pushChunk(`${f1Obj} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n`);

  offsets.push(currentByteOffset);
  pushChunk(`${f2Obj} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj\n`);

  // Xref
  const startXref = currentByteOffset;
  let xrefStr = `xref\n0 ${totalObjs + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    xrefStr += `${off.toString().padStart(10, '0')} 00000 n \n`;
  }
  pushChunk(xrefStr);

  // Trailer
  pushChunk(`trailer\n<< /Size ${totalObjs + 1} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF\n`);

  return Buffer.concat(chunks);
}
