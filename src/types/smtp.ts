export type SecurityMode = "SMTPS" | "STARTTLS" | "NONE";

export type SmtpConfigResponse = {
  id: string;
  tenantId: string;
  name: string;
  host: string;
  port: number;
  securityMode: SecurityMode;
  username?: string | null;
  tlsVerify: boolean;
  rateLimitPerMin: number;
  allowedSenderDomains?: string[] | null;
  isActive: boolean;
  lastTestedAt?: string | null;
  lastTestStatus?: "success" | "failure" | null;
  lastTestError?: string | null;
  hasPassword: boolean;
};

export type UpdateSmtpConfigPayload = {
  name?: string;
  host: string;
  port: number;
  securityMode: SecurityMode;
  username?: string;
  password?: string;
  tlsVerify?: boolean;
  rateLimitPerMin?: number;
  allowedSenderDomains?: string[];
  isActive?: boolean;
};

export type TestSmtpConfigPayload = {
  testSenderEmail: string;
  testRecipientEmail: string;
  testSubject?: string;
  testBody?: string;
};

export type SmtpConfigSummary = {
  id: string;
  tenantId: string;
  name: string;
  host: string;
  port: number;
  securityMode: SecurityMode;
  username?: string | null;
  allowedSenderDomains?: string[] | null;
  isActive: boolean;
  hasPassword: boolean;
  lastTestedAt?: string | null;
  lastTestStatus?: "success" | "failure" | null;
  updatedAt?: string | null;
};
