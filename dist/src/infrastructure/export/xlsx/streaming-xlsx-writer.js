// src/infrastructure/export/xlsx/streaming-xlsx-writer.ts
import ExcelJS from "exceljs";
import { BODY_ALIGNMENT, BODY_BORDER, DEFAULT_COLUMN_WIDTHS, HEADER_ALIGNMENT, HEADER_FILL, HEADER_FONT, HYPERLINK_FONT, WORKBOOK_FONT, } from "./xlsx.styles.js";
/**
 * Exact column configuration for lead exports.
 *
 * Keeping this here means the chat layer only needs to
 * provide lead data. It does not need to know how the
 * Excel file is structured or styled.
 */
const LEAD_COLUMNS = [
    {
        key: "firstName",
        header: "First Name",
        width: DEFAULT_COLUMN_WIDTHS.firstName,
    },
    {
        key: "lastName",
        header: "Last Name",
        width: DEFAULT_COLUMN_WIDTHS.lastName,
    },
    {
        key: "company",
        header: "Company",
        width: DEFAULT_COLUMN_WIDTHS.company,
    },
    {
        key: "title",
        header: "Title",
        width: DEFAULT_COLUMN_WIDTHS.title,
    },
    {
        key: "website",
        header: "Website",
        width: DEFAULT_COLUMN_WIDTHS.website,
        hyperlink: true,
    },
    {
        key: "linkedinUrl",
        header: "LinkedIn",
        width: DEFAULT_COLUMN_WIDTHS.linkedinUrl,
        hyperlink: true,
    },
    {
        key: "reason",
        header: "Reason",
        width: DEFAULT_COLUMN_WIDTHS.reason,
    },
    {
        key: "qualifiedAt",
        header: "Qualified At",
        width: DEFAULT_COLUMN_WIDTHS.qualifiedAt,
    },
];
/**
 * Streaming XLSX generator for lead exports.
 *
 * Completely self-contained infrastructure.
 *
 * Dependencies:
 *
 * - ExcelJS
 * - Node.js streams
 *
 * It does NOT depend on:
 *
 * - chat
 * - Prisma
 * - OpenOutFind
 * - repositories
 * - controllers
 * - Express
 * - authentication
 * - domain types
 */
export class StreamingXlsxWriter {
    /**
     * Generate a lead XLSX workbook directly into
     * the supplied writable stream.
     */
    async write(input) {
        this.validateInput(input);
        const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
            stream: input.stream,
            useStyles: true,
            useSharedStrings: true,
        });
        workbook.creator =
            input.creator ??
                "Application";
        workbook.title =
            input.title ??
                "Lead Export";
        workbook.subject =
            "Lead Export";
        workbook.created =
            new Date();
        const worksheet = workbook.addWorksheet(input.worksheetName ??
            "Leads");
        this.configureWorksheet(worksheet);
        for await (const lead of input.data) {
            const values = this.createRowValues(lead);
            const row = worksheet.addRow(values);
            this.styleRow(row);
            row.commit();
        }
        worksheet.commit();
        await workbook.commit();
    }
    /**
     * Configure the worksheet before data starts streaming.
     */
    configureWorksheet(worksheet) {
        worksheet.columns =
            LEAD_COLUMNS.map((column) => ({
                header: column.header,
                key: column.key,
                width: column.width ??
                    24,
                font: WORKBOOK_FONT,
                alignment: BODY_ALIGNMENT,
                border: BODY_BORDER,
            }));
        /*
         * Header styling.
         */
        const headerRow = worksheet.getRow(1);
        headerRow.height =
            24;
        headerRow.font =
            HEADER_FONT;
        headerRow.fill =
            HEADER_FILL;
        headerRow.alignment =
            HEADER_ALIGNMENT;
        /*
         * Enable filtering across the complete header.
         */
        worksheet.autoFilter = {
            from: "A1",
            to: this.columnLetter(LEAD_COLUMNS.length) + "1",
        };
    }
    /**
     * Convert a lead object into an Excel row.
     */
    createRowValues(lead) {
        const values = {};
        for (const column of LEAD_COLUMNS) {
            const value = column.key === "reason"
                ? this.normalizeReason(lead[column.key])
                : this.normalizeValue(lead[column.key]);
            values[column.key] =
                value;
        }
        return values;
    }
    /**
     * Convert Markdown-style qualification text into a plain paragraph.
     */
    normalizeReason(value) {
        const normalized = this.normalizeValue(value);
        if (typeof normalized !== "string") {
            return String(normalized);
        }
        return normalized
            .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
            .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
            .replace(/(`{1,3})(.*?)\1/g, "$2")
            .replace(/(^|\s)#{1,6}\s+/gm, "$1")
            .replace(/(^|\s)([*_~]{1,3})(?=\S)/g, "$1")
            .replace(/[*_~]+/g, "")
            .replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/gm, "")
            .replace(/\s*\r?\n\s*/g, " ")
            .replace(/\s{2,}/g, " ")
            .trim();
    }
    /**
     * Normalize values into types ExcelJS can safely consume.
     */
    normalizeValue(value) {
        if (value === null ||
            value === undefined) {
            return "";
        }
        if (value instanceof Date) {
            return value;
        }
        if (typeof value === "string" ||
            typeof value === "number" ||
            typeof value === "boolean") {
            return value;
        }
        /*
         * This is defensive. LeadExportRecord should normally
         * contain only scalar values.
         */
        if (typeof value === "object") {
            return JSON.stringify(value);
        }
        return String(value);
    }
    /**
     * Apply row-level formatting and hyperlinks.
     */
    styleRow(row) {
        row.alignment =
            BODY_ALIGNMENT;
        for (let index = 0; index < LEAD_COLUMNS.length; index++) {
            const column = LEAD_COLUMNS[index];
            if (!column ||
                !column.hyperlink) {
                continue;
            }
            const cell = row.getCell(index + 1);
            if (typeof cell.value !==
                "string") {
                continue;
            }
            const url = this.normalizeUrl(cell.value);
            if (!url) {
                continue;
            }
            cell.value = {
                text: cell.value,
                hyperlink: url,
                tooltip: url,
            };
            cell.font =
                HYPERLINK_FONT;
        }
    }
    /**
     * Normalize a URL so Excel receives a valid hyperlink.
     */
    normalizeUrl(value) {
        const trimmed = value.trim();
        if (!trimmed) {
            return "";
        }
        if (/^https?:\/\//i.test(trimmed)) {
            return trimmed;
        }
        if (/^\/\//.test(trimmed)) {
            return `https:${trimmed}`;
        }
        return `https://${trimmed}`;
    }
    /**
     * Convert a 1-based column index to an Excel column letter.
     */
    columnLetter(columnNumber) {
        let number = columnNumber;
        let result = "";
        while (number > 0) {
            const remainder = (number - 1) %
                26;
            result =
                String.fromCharCode(65 + remainder) +
                    result;
            number =
                Math.floor((number - 1) /
                    26);
        }
        return result;
    }
    /**
     * Validate the infrastructure-level contract.
     */
    validateInput(input) {
        if (!input ||
            typeof input !== "object") {
            throw new Error("XLSX export input is required.");
        }
        if (!input.stream ||
            typeof input.stream.write !==
                "function") {
            throw new Error("A writable output stream is required.");
        }
        if (!input.data ||
            typeof input.data[Symbol.asyncIterator] !== "function") {
            throw new Error("XLSX data must be an AsyncIterable.");
        }
    }
}
//# sourceMappingURL=streaming-xlsx-writer.js.map