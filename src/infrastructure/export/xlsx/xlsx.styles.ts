
// src/infrastructure/export/xlsx/xlsx.styles.ts

import type {
  Alignment,
  Border,
  Borders,
  Fill,
  Font,
} from "exceljs";

/**
 * Centralized XLSX presentation configuration.
 *
 * This file contains no application/domain dependencies.
 */

export const XLSX_COLORS = {
  white: "FFFFFF",
  black: "111827",
  text: "374151",
  border: "E5E7EB",
  headerBackground: "111827",
  link: "2563EB",
} as const;

export const WORKBOOK_FONT: Partial<Font> = {
  name: "Aptos",
  size: 11,
  color: {
    argb: XLSX_COLORS.text,
  },
};

export const HEADER_FONT: Partial<Font> = {
  name: "Aptos",
  size: 11,
  bold: true,
  color: {
    argb: XLSX_COLORS.white,
  },
};

export const HEADER_FILL: Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: {
    argb: XLSX_COLORS.headerBackground,
  },
};

export const HEADER_ALIGNMENT: Partial<Alignment> = {
  vertical: "middle",
  horizontal: "left",
  wrapText: true,
};

export const BODY_ALIGNMENT: Partial<Alignment> = {
  vertical: "top",
  horizontal: "left",
  wrapText: true,
};

export const BODY_BORDER: Partial<Borders> = {
  bottom: {
    style: "thin",
    color: {
      argb: XLSX_COLORS.border,
    },
  },
};

export const HYPERLINK_FONT: Partial<Font> = {
  name: "Aptos",
  size: 11,
  color: {
    argb: XLSX_COLORS.link,
  },
  underline: "single",
};

/**
 * Default column widths.
 *
 * These are keyed by semantic column names, but the writer
 * remains completely independent of the application's data model.
 */
export const DEFAULT_COLUMN_WIDTHS = {
  email: 34,
  firstName: 18,
  lastName: 20,
  company: 28,
  title: 42,
  website: 34,
  linkedinUrl: 42,
  reason: 65,
  leadId: 28,
  qualifiedAt: 24,
} as const;

