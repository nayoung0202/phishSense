import { NextRequest, NextResponse } from "next/server";
import {
  collectDepartmentTagsFromTargets,
  normalizeProjectDate,
  normalizeStringArray,
  projectCreateSchema,
  quarterNumbers,
  statusParamMap,
  validateProjectPayload,
} from "@/server/services/projectsShared";
import { validateProjectSenderDomainPolicy } from "@/server/services/projectSmtpPolicy";
import { enqueueSendJobForProject } from "@/server/services/sendJobs";
import { validateTemplateForSend } from "@/server/services/templateSendValidation";
import {
  createProjectForTenant,
  createProjectTargetForTenant,
  getProjectsForTenant,
  getTargetsForTenant,
  getTemplateForTenant,
  getTrainingPageForTenant,
} from "@/server/tenant/tenantStorage";
import {
  buildReadyTenantErrorResponse,
  requireReadyTenant,
} from "@/server/tenant/currentTenant";
import {
  getProjectDepartmentDisplay,
  getProjectPrimaryDepartment,
} from "@shared/projectDepartment";
import type { InsertProject } from "@shared/schema";
import { ZodError } from "zod";

const STATUS_RUNNING = "진행중";

const toSortableTime = (value: Date | string | null | undefined) => {
  if (!value) return Number.POSITIVE_INFINITY;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? Number.POSITIVE_INFINITY : parsed.getTime();
};

export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await requireReadyTenant(request);
    const { searchParams } = new URL(request.url);
    const queryYear =
      searchParams.get("year") && !Number.isNaN(Number(searchParams.get("year")))
        ? Number(searchParams.get("year"))
        : undefined;
    const rawQuarter = searchParams.get("quarter");
    const parsedQuarter =
      rawQuarter && !Number.isNaN(Number(rawQuarter)) ? Number(rawQuarter) : undefined;
    const rawStatus = (searchParams.get("status") ?? "").toLowerCase();
    const statusFilter = statusParamMap[rawStatus] ?? undefined;
    const searchTerm = (searchParams.get("q") ?? "").trim().toLowerCase();

    const projects = await getProjectsForTenant(tenantId);
    const filtered = projects.filter((project) => {
      const fiscalYear =
        project.fiscalYear ?? normalizeProjectDate(project.startDate).getFullYear();
      if (queryYear && fiscalYear !== queryYear) return false;

      const fiscalQuarter =
        project.fiscalQuarter ??
        Math.floor(normalizeProjectDate(project.startDate).getMonth() / 3) + 1;
      if (
        parsedQuarter &&
        quarterNumbers.includes(parsedQuarter as (typeof quarterNumbers)[number]) &&
        fiscalQuarter !== parsedQuarter
      ) {
        return false;
      }

      if (statusFilter && project.status !== statusFilter) return false;

      if (searchTerm.length > 0) {
        const haystack = [
          project.name,
          getProjectDepartmentDisplay(project, ""),
          Array.isArray(project.departmentTags) ? project.departmentTags.join(" ") : "",
          project.description ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(searchTerm)) {
          return false;
        }
      }

      return true;
    });

    filtered.sort((a, b) => {
      const startDiff = toSortableTime(a.startDate) - toSortableTime(b.startDate);
      if (startDiff !== 0) return startDiff;
      const endDiff = toSortableTime(a.endDate) - toSortableTime(b.endDate);
      if (endDiff !== 0) return endDiff;
      return a.name.localeCompare(b.name, "ko");
    });

    return NextResponse.json(filtered);
  } catch (error) {
    return buildReadyTenantErrorResponse(error, "Failed to fetch projects");
  }
}

export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await requireReadyTenant(request);
    const payload = await request.json();
    const validated = projectCreateSchema.parse(payload);
    const { targetIds, ...projectPayload } = validated;
    const uniqueTargetIds = Array.from(
      new Set((targetIds ?? []).map((id) => id.trim()).filter(Boolean)),
    );
    const allTargets = uniqueTargetIds.length > 0 ? await getTargetsForTenant(tenantId) : [];
    const selectedTargetSet = new Set(uniqueTargetIds);
    const selectedTargets = allTargets.filter((target) => selectedTargetSet.has(target.id));
    const derivedDepartmentTags = collectDepartmentTagsFromTargets(selectedTargets);
    const { departmentTags, notificationEmails, ...projectRest } = projectPayload;
    const normalizedDepartmentTags =
      derivedDepartmentTags.length > 0
        ? derivedDepartmentTags
        : normalizeStringArray(departmentTags);
    const sanitized: InsertProject = {
      ...projectRest,
      department: getProjectPrimaryDepartment({
        department: projectRest.department ?? null,
        departmentTags: normalizedDepartmentTags,
      }),
      departmentTags: normalizedDepartmentTags,
      notificationEmails: normalizeStringArray(notificationEmails),
      endDate: projectRest.endDate ?? projectRest.startDate,
    };

    const issues = validateProjectPayload(sanitized, {
      allowTemporaryDraft: true,
    });
    const senderPolicyIssues = await validateProjectSenderDomainPolicy(tenantId, sanitized);
    issues.push(...senderPolicyIssues);
    if (issues.length > 0) {
      return NextResponse.json({ error: "validation_failed", issues }, { status: 422 });
    }

    if (sanitized.status === STATUS_RUNNING) {
      if (!sanitized.templateId) {
        return NextResponse.json(
          {
            error: "send_validation_failed",
            issues: [
              {
                code: "template_missing",
                scope: "project",
                message: "프로젝트에 템플릿이 연결되어 있지 않습니다.",
              },
            ],
          },
          { status: 422 },
        );
      }
      const [template, trainingPage] = await Promise.all([
        getTemplateForTenant(tenantId, sanitized.templateId),
        sanitized.trainingPageId
          ? getTrainingPageForTenant(tenantId, sanitized.trainingPageId)
          : Promise.resolve(undefined),
      ]);
      if (!template) {
        return NextResponse.json(
          {
            error: "send_validation_failed",
            issues: [
              {
                code: "template_missing",
                scope: "project",
                message: "템플릿을 찾을 수 없습니다.",
              },
            ],
          },
          { status: 422 },
        );
      }
      const validation = validateTemplateForSend(template, trainingPage);
      if (!validation.ok) {
        return NextResponse.json(
          { error: "send_validation_failed", issues: validation.issues },
          { status: 422 },
        );
      }
    }

    const project = await createProjectForTenant(tenantId, sanitized);
    if (uniqueTargetIds.length > 0) {
      await Promise.all(
        uniqueTargetIds.map((targetId) =>
          createProjectTargetForTenant(tenantId, {
            projectId: project.id,
            targetId,
            status: "sent",
          }),
        ),
      );
    }

    if (project.status === STATUS_RUNNING) {
      await enqueueSendJobForProject(tenantId, project.id);
    }
    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: "validation_error",
          issues: error.issues.map((issue) => ({
            field: Array.isArray(issue.path) ? issue.path.join(".") : "",
            code: issue.code,
            message: issue.message,
          })),
        },
        { status: 422 },
      );
    }
    return buildReadyTenantErrorResponse(error, "Failed to create project", 400);
  }
}
