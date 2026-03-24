type AuditEvent = {
  action: string;
  tenantId?: string | null;
  actorUserId?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
};

export function logPlatformAuditEvent(event: AuditEvent) {
  console.info(
    "[platform-audit]",
    JSON.stringify({
      occurredAt: new Date().toISOString(),
      ...event,
    }),
  );
}
