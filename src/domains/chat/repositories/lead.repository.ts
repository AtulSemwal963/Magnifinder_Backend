
// src/domains/chat/repositories/lead.repository.ts

import { prisma } from "../../../lib/prisma.js";

import type {
  Lead,
} from "../../../generated/prisma/client.js";

import type {
  FetchLeadsResult,
} from "../../../infrastructure/fetch-leads/index.js";

// ============================================================
// Input Types
// ============================================================

export interface CreateLeadData {
  searchId: string;

  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  title?: string | null;
  website?: string | null;
  linkedinUrl?: string | null;
  reason?: string | null;
  externalId?: string | null;
  qualifiedAt?: Date | null;
}

export interface CreateManyLeadsData {
  searchId: string;
  leads: FetchLeadsResult["leads"];
}

// ============================================================
// Export Configuration
// ============================================================

/**
 * Number of database records fetched per database round-trip
 * when streaming leads to an export.
 *
 * This controls database memory usage without affecting the
 * XLSX output stream.
 */
const EXPORT_BATCH_SIZE = 500;

// ============================================================
// Repository
// ============================================================

export class LeadRepository {
  /**
   * Persist a single lead.
   */
  async create(
    data: CreateLeadData
  ): Promise<Lead> {
    return prisma.lead.create({
      data: {
        searchId: data.searchId,

        email:
          data.email?.trim() || null,

        firstName:
          data.firstName?.trim() || null,

        lastName:
          data.lastName?.trim() || null,

        company:
          data.company?.trim() || null,

        title:
          data.title?.trim() || null,

        website:
          data.website?.trim() || null,

        linkedinUrl:
          data.linkedinUrl?.trim() || null,

        reason:
          data.reason?.trim() || null,

        externalId:
          data.externalId?.trim() || null,

        qualifiedAt:
          data.qualifiedAt ?? null,
      },
    });
  }

  /**
   * Persist all leads produced by a single search.
   *
   * Every persisted lead is associated with the search
   * that produced it through searchId.
   */
  async createMany(
    data: CreateManyLeadsData
  ): Promise<{ count: number }> {
    if (
      data.leads.length === 0
    ) {
      return {
        count: 0,
      };
    }

    const result =
      await prisma.lead.createMany({
        data:
          data.leads.map(
            (lead) => ({
              searchId:
                data.searchId,

              email:
                lead.email?.trim() ||
                null,

              firstName:
                lead.firstName?.trim() ||
                null,

              lastName:
                lead.lastName?.trim() ||
                null,

              company:
                lead.company?.trim() ||
                null,

              title:
                lead.title?.trim() ||
                null,

              website:
                lead.website?.trim() ||
                null,

              linkedinUrl:
                lead.linkedinUrl?.trim() ||
                null,

              reason:
                lead.reason?.trim() ||
                null,

              externalId:
                lead.leadId
                  ?.toString() ||
                null,

              qualifiedAt:
                lead.qualifiedAt
                  ? new Date(
                      lead.qualifiedAt
                    )
                  : null,
            })
          ),
      });

    return {
      count:
        result.count,
    };
  }

  /**
   * Retrieve every lead produced by a specific search.
   *
   * This is used when reconstructing chat history so that
   * a previous lead-generation result can be displayed again.
   */
  async findManyBySearchId(
    searchId: string
  ): Promise<Lead[]> {
    return prisma.lead.findMany({
      where: {
        searchId,
      },

      orderBy: {
        createdAt: "asc",
      },
    });
  }

  /**
   * Stream every lead produced by a specific search.
   *
   * This method is intended for large exports.
   *
   * IMPORTANT:
   *
   * It does NOT load the complete result set into memory.
   *
   * Leads are fetched in bounded batches and yielded one
   * record at a time to the caller.
   *
   * The caller can therefore connect this generator directly
   * to the XLSX streaming writer.
   *
   * Pagination uses the lead's primary key rather than
   * offset pagination. This avoids progressively expensive
   * database scans as the number of exported records grows.
   */
  async *streamBySearchId(
    searchId: string
  ): AsyncGenerator<Lead> {
    let cursorId:
      string | undefined;

    while (true) {
      const leads =
        await prisma.lead.findMany({
          where: {
            searchId,
          },

          orderBy: {
            id: "asc",
          },

          take:
            EXPORT_BATCH_SIZE,

          ...(cursorId
            ? {
                cursor: {
                  id: cursorId,
                },

                skip: 1,
              }
            : {}),
        });

      if (
        leads.length === 0
      ) {
        break;
      }

      for (
        const lead of leads
      ) {
        yield lead;
      }

      const lastLead =
        leads[
          leads.length - 1
        ];

      if (
        !lastLead
      ) {
        break;
      }

      cursorId =
        lastLead.id;

      /*
       * If fewer than the batch size were returned,
       * there cannot be another complete page.
       */
      if (
        leads.length <
        EXPORT_BATCH_SIZE
      ) {
        break;
      }
    }
  }

  /**
   * Retrieve a specific lead while ensuring that it belongs
   * to the supplied search.
   */
  async findByIdAndSearchId(
    leadId: string,
    searchId: string
  ): Promise<Lead | null> {
    return prisma.lead.findFirst({
      where: {
        id: leadId,
        searchId,
      },
    });
  }

  /**
   * Delete every lead produced by a specific search.
   */
  async deleteManyBySearchId(
    searchId: string
  ): Promise<void> {
    await prisma.lead.deleteMany({
      where: {
        searchId,
      },
    });
  }
}

export const leadRepository =
  new LeadRepository();

