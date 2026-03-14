import type { FastifyInstance } from "fastify";

export async function registerAuditRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { limit?: string; eventType?: string } }>("/audit", async (req) => {
    // TODO: Query from Prisma AuditEvent table
    // const { limit = "100", eventType } = req.query;
    return {
      events: [],
      message: "Connect Prisma to list audit events. Schema defined in apps/api/prisma/schema.prisma",
    };
  });
}
