
// src/domains/chat/services/lead-export.service.ts

import type { Writable } from "node:stream";

import {
  StreamingXlsxWriter,
  type LeadExportRecord,
} from "../../../infrastructure/export/xlsx/index.js";

import {
  leadRepository,
} from "../repositories/lead.repository.js";

import {
  searchRepository,
} from "../repositories/search.repository.js";

/**
 * Service responsible for orchestrating lead exports.
 *
 * Responsibilities:
 *
 * - Retrieve leads belonging to a search
 * - Transform persistence records into the XLSX export contract
 * - Provide those records as an AsyncIterable
 * - Delegate workbook generation to the XLSX infrastructure
 *
 * It does NOT:
 *
 * - format Excel cells
 * - know about ExcelJS internals
 * - construct XLSX files
 * - interact with HTTP directly
 * - access Prisma directly
 */
export class LeadExportService {
  private readonly xlsxWriter: StreamingXlsxWriter;

  constructor(
    xlsxWriter: StreamingXlsxWriter =
      new StreamingXlsxWriter()
  ) {
    this.xlsxWriter =
      xlsxWriter;
  }

  /**
  * Export all leads belonging to every search in a chat as an XLSX
   * workbook directly into the supplied writable stream.
   *
   * Data flows through the system incrementally:
   *
   * Prisma
   *   ↓
   * repository batch
   *   ↓
   * AsyncGenerator
   *   ↓
   * LeadExportRecord
   *   ↓
   * StreamingXlsxWriter
   *   ↓
   * HTTP response
   *
   * The complete lead dataset is never materialized
   * in this service.
   */
  async exportChatLeads(
    chatId: string,
    stream: Writable
  ): Promise<void> {
    this.validateChatId(
      chatId
    );

    this.validateStream(
      stream
    );

    const searches =
      await searchRepository.findManyByChatId(
        chatId
      );

    const searchIds =
      searches.map(
        (search) => search.id
      );

    const data =
      this.createLeadExportStream(
        searchIds
      );

    await this.xlsxWriter.write({
      stream,

      worksheetName:
        "Leads",

      title:
        "Lead Export",

      creator:
        "Magnifinder",

      data,
    });
  }

  /**
   * Transform database leads into the generic export
   * contract expected by the XLSX infrastructure.
   *
   * This generator deliberately yields one record at a time.
   *
   * The XLSX infrastructure therefore controls when the next
   * database record is requested.
   */
  private async *createLeadExportStream(
    searchIds: string[]
  ): AsyncGenerator<LeadExportRecord> {
    for (
      const searchId of searchIds
    ) {
      /**
       * Each search is streamed before the next one is read,
       * keeping export memory bounded across the whole chat.
       */
      for await (
        const lead of
          leadRepository.streamBySearchId(
            searchId
          )
      ) {
        yield {
          email:
            lead.email ??
            "",

          firstName:
            lead.firstName ??
            "",

          lastName:
            lead.lastName ??
            "",

          company:
            lead.company ??
            "",

          title:
            lead.title ??
            "",

          website:
            lead.website ??
            "",

          linkedinUrl:
            lead.linkedinUrl ??
            "",

          reason:
            lead.reason ??
            "",

        /*
         * The persistence layer calls this externalId.
         *
         * The export contract exposes the same value as
         * leadId because that is the human-facing export
         * column.
         */
          leadId:
            lead.externalId ??
            "",

          qualifiedAt:
            lead.qualifiedAt ??
            "",
        };
      }
    }
  }

  /**
   * Validate the search identifier before accessing
   * the repository.
   */
  private validateChatId(
    chatId: string
  ): void {
    if (
      typeof chatId !==
        "string" ||
      !chatId.trim()
    ) {
      throw new Error(
        "Chat ID is required."
      );
    }
  }

  /**
   * Validate the destination stream before beginning
   * workbook generation.
   */
  private validateStream(
    stream: Writable
  ): void {
    if (
      !stream ||
      typeof stream.write !==
        "function"
    ) {
      throw new Error(
        "A writable output stream is required."
      );
    }
  }
}

/**
 * Application-level singleton.
 */
export const leadExportService =
  new LeadExportService();

