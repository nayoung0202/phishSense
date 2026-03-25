"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useCallback, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/StatCard";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SafeText } from "@/components/security/SafeText";
import { ReportGenerateDialog } from "@/components/ReportGenerateDialog";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Mail,
  Eye,
  MousePointer,
  FileText,
  Clock,
  Play,
  AlertTriangle,
  Download,
} from "lucide-react";
import { type Project } from "@shared/schema";
import {
  getProjectDepartmentDisplay,
} from "@shared/projectDepartment";
import { format } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import {
  PROJECT_DETAIL_REFETCH_INTERVAL_MS,
  createAlwaysFreshQueryOptions,
} from "@/lib/projectMetricsRealtime";
import { apiRequest } from "@/lib/queryClient";
import {
  PROJECTS_CALENDAR_QUERY_KEY,
  PROJECTS_DETAIL_QUERY_KEY,
  PROJECTS_LIST_QUERY_KEY,
  PROJECTS_QUARTER_STATS_QUERY_KEY,
} from "@/lib/queryKeys";

const statusConfig: Record<string, { className: string }> = {
  "임시": { className: "bg-slate-500/20 text-slate-400" },
  "예약": { className: "bg-blue-500/20 text-blue-400" },
  "진행중": { className: "bg-orange-500/20 text-orange-400" },
  "완료": { className: "bg-green-500/20 text-green-400" },
};

const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))'];

const toProjectEditRoute = (projectId: string) =>
  `/projects/${projectId}/edit` as Route;

type ActionLogEvent = {
  type: "OPEN" | "CLICK" | "SUBMIT";
  label: string;
  at: string;
};

type ActionLogItem = {
  projectTargetId: string;
  targetId: string;
  name: string;
  email: string;
  department: string | null;
  sentAt: string | null;
  status: string;
  statusCode: string;
  trackingToken: string | null;
  events: ActionLogEvent[];
};

type ActionLogResponse = {
  items: ActionLogItem[];
};

const parseDepartmentEntries = (value: string | null): string[] => {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
};

export default function ProjectDetail({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isTimelineExporting, setIsTimelineExporting] = useState(false);
  const [selectedLog, setSelectedLog] = useState<ActionLogItem | null>(null);
  const invalidateProjectQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: PROJECTS_DETAIL_QUERY_KEY(projectId) });
    queryClient.invalidateQueries({ queryKey: PROJECTS_LIST_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: PROJECTS_QUARTER_STATS_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: PROJECTS_CALENDAR_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
  }, [projectId, queryClient]);

  const fetchProject = async (): Promise<Project> => {
    if (!projectId) {
      throw new Error("프로젝트 ID가 없습니다.");
    }
    const res = await apiRequest("GET", `/api/projects/${projectId}`);
    return (await res.json()) as Project;
  };
  const {
    data: project,
    isLoading,
    isError,
    error,
  } = useQuery<Project>({
    queryKey: PROJECTS_DETAIL_QUERY_KEY(projectId),
    enabled: Boolean(projectId),
    queryFn: fetchProject,
    ...createAlwaysFreshQueryOptions(PROJECT_DETAIL_REFETCH_INTERVAL_MS),
  });

  const fetchActionLogs = async (): Promise<ActionLogResponse> => {
    const res = await apiRequest("GET", `/api/projects/${projectId}/action-logs`);
    return (await res.json()) as ActionLogResponse;
  };

  const {
    data: actionLogs,
    isLoading: isActionLogsLoading,
  } = useQuery<ActionLogResponse>({
    queryKey: ["/api/projects", projectId, "action-logs"],
    enabled: Boolean(projectId),
    queryFn: fetchActionLogs,
    ...createAlwaysFreshQueryOptions(PROJECT_DETAIL_REFETCH_INTERVAL_MS),
  });

  const actionLogItems = Array.isArray(actionLogs?.items) ? actionLogs.items : [];
  const timelineItems = actionLogItems
    .flatMap((item) => {
      const events = Array.isArray(item.events) ? item.events : [];
      return events.map((event) => ({
        ...event,
        targetName: item.name,
      }));
    })
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 6);

  const formatEventTime = (value: string) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "-";
    return format(parsed, "yyyy-MM-dd HH:mm");
  };

  const startProjectMutation = useMutation({
    mutationFn: async (target: Project) => {
      const res = await apiRequest("PATCH", `/api/projects/${target.id}/status`, {
        to: "RUNNING",
      });
      return (await res.json()) as { id: string; status: string };
    },
    onSuccess: (_response, target) => {
      invalidateProjectQueries();
      toast({
        title: "프로젝트 시작",
        description: `${target.name} 프로젝트가 진행중으로 전환되었습니다.`,
      });
    },
    onError: (error) => {
      invalidateProjectQueries();
      toast({
        title: "시작 실패",
        description: error.message ?? "프로젝트를 시작할 수 없습니다.",
        variant: "destructive",
      });
    },
  });

  const resolveFilenameFromDisposition = (contentDisposition: string | null) => {
    if (!contentDisposition) return null;

    const encodedMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (encodedMatch?.[1]) {
      try {
        return decodeURIComponent(encodedMatch[1]);
      } catch {
        // noop
      }
    }

    const basicMatch = contentDisposition.match(/filename=\"?([^\";]+)\"?/i);
    if (basicMatch?.[1]) {
      return basicMatch[1];
    }

    return null;
  };

  const handleExportTimelineExcel = async () => {
    if (!projectId || isTimelineExporting) return;

    setIsTimelineExporting(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/action-logs/export`, {
        method: "GET",
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const message =
          typeof payload?.error === "string" && payload.error.length > 0
            ? payload.error
            : "타임라인 엑셀 다운로드에 실패했습니다.";
        throw new Error(message);
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get("Content-Disposition");
      const filename =
        resolveFilenameFromDisposition(contentDisposition) ??
        `${projectId}_event_timeline.xlsx`;

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast({
        title: "다운로드 시작",
        description: "이벤트 타임라인 엑셀 파일을 다운로드합니다.",
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "타임라인 엑셀 다운로드에 실패했습니다.";
      toast({
        title: "다운로드 실패",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsTimelineExporting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="text-center py-12">로딩 중...</div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6">
        <div className="text-center py-12 space-y-4">
          <p>프로젝트 정보를 불러오지 못했습니다.</p>
          <p className="text-sm text-muted-foreground">
            {(error as Error)?.message ?? "잠시 후 다시 시도하거나 목록으로 돌아가세요."}
          </p>
          <Link href="/projects">
            <Button>프로젝트 목록으로</Button>
          </Link>
        </div>
      </div>
    );
  }
  if (!project) {
    return (
      <div className="p-6">
        <div className="text-center py-12 space-y-4">
          <p>프로젝트 정보를 찾을 수 없습니다.</p>
          <Link href="/projects">
            <Button>프로젝트 목록으로</Button>
          </Link>
        </div>
      </div>
    );
  }

  const calculateRate = (count: number | null, total: number | null) => {
    if (!total || !count) return 0;
    return Math.round((count / total) * 100);
  };

  const openRate = calculateRate(project.openCount, project.targetCount);
  const clickRate = calculateRate(project.clickCount, project.targetCount);
  const submitRate = calculateRate(project.submitCount, project.targetCount);
  const projectDepartmentLabel = getProjectDepartmentDisplay(project);
  const selectedDepartments = (() => {
    const departmentSet = new Set<string>();
    actionLogItems.forEach((item) => {
      parseDepartmentEntries(item.department).forEach((entry) => {
        departmentSet.add(entry);
      });
    });
    if (departmentSet.size > 0) {
      return Array.from(departmentSet).sort((a, b) => a.localeCompare(b, "ko"));
    }
    const fallbackDepartment = getProjectDepartmentDisplay(project, "").trim();
    return fallbackDepartment ? [fallbackDepartment] : [];
  })();

  const timeSeriesData = [
    { name: '발송', value: project.targetCount || 0 },
    { name: '오픈', value: project.openCount || 0 },
    { name: '클릭', value: project.clickCount || 0 },
    { name: '제출', value: project.submitCount || 0 },
  ];

  const sentCountByDepartment = new Map<string, number>();
  selectedDepartments.forEach((department) => {
    sentCountByDepartment.set(department, 0);
  });

  actionLogItems.forEach((item) => {
    if (!item.sentAt) return;
    const entries = parseDepartmentEntries(item.department);
    const matchedDepartment =
      selectedDepartments.find((department) =>
        entries.some((entry) => entry === department),
      ) ??
      selectedDepartments.find((department) =>
        entries.some((entry) => entry.includes(department) || department.includes(entry)),
      ) ??
      null;

    if (!matchedDepartment) return;
    sentCountByDepartment.set(
      matchedDepartment,
      (sentCountByDepartment.get(matchedDepartment) ?? 0) + 1,
    );
  });

  const departmentData = selectedDepartments
    .map((department) => ({
      name: department,
      value: sentCountByDepartment.get(department) ?? 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
  const totalSentCount = actionLogItems.filter((item) => Boolean(item.sentAt)).length;
  const chartDepartmentData = departmentData.filter((item) => item.value > 0);
  const hasDepartmentDistribution = chartDepartmentData.length > 0;

  const handleStartProject = () => {
    if (project.status !== "예약") return;
    if (!confirm(`"${project.name}" 프로젝트를 지금 시작하시겠습니까?`)) return;
    startProjectMutation.mutate(project);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/projects">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-4xl font-bold">{project.name}</h1>
            <Badge className={statusConfig[project.status]?.className}>
              {project.status}
            </Badge>
          </div>
          <p className="text-muted-foreground">{project.description || '프로젝트 설명'}</p>
          <p className="text-sm text-muted-foreground">부서: {projectDepartmentLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          {project.status === "임시" ? (
            <Link href={toProjectEditRoute(project.id)}>
              <Button variant="outline">
                재개
              </Button>
            </Link>
          ) : null}
          {project.status === "예약" ? (
            <Button
              variant="outline"
              onClick={handleStartProject}
              disabled={startProjectMutation.isPending}
            >
              <Play className="w-4 h-4 mr-2" />
              {startProjectMutation.isPending ? "시작 중" : "지금 시작"}
            </Button>
          ) : null}
          <Button
            data-testid="button-generate-report"
            onClick={() => setIsReportOpen(true)}
          >
            <FileText className="w-4 h-4 mr-2" />
            보고서 생성
          </Button>
        </div>
      </div>

      {project.sendValidationError && (
        <Card className="border-red-200 bg-red-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-red-600" />
            <div>
              <p className="font-semibold text-red-700">발송 검증 실패</p>
              <p className="mt-1 whitespace-pre-line text-sm text-red-700">
                {project.sendValidationError}
              </p>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="발송 수"
          value={project.targetCount?.toLocaleString() || '0'}
          icon={Mail}
        />
        <StatCard
          title="오픈률"
          value={`${openRate}%`}
          icon={Eye}
          description={`${project.openCount || 0}명 열람`}
        />
        <StatCard
          title="클릭률"
          value={`${clickRate}%`}
          icon={MousePointer}
          description={`${project.clickCount || 0}명 클릭`}
        />
        <StatCard
          title="제출률"
          value={`${submitRate}%`}
          icon={FileText}
          description={`${project.submitCount || 0}명 제출`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">훈련 진행 추세</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={timeSeriesData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" />
              <YAxis stroke="hsl(var(--muted-foreground))" />
              <Tooltip 
                cursor={false}
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--popover))', 
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px'
                }} 
              />
              <Bar dataKey="value" fill="hsl(var(--primary))" />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">부서별 분포</h2>
          {totalSentCount > 0 && hasDepartmentDistribution ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={chartDepartmentData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name} ${value}명`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                  stroke="none"
                  paddingAngle={chartDepartmentData.length > 1 ? 1 : 0}
                >
                  {chartDepartmentData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => [`${Number(value).toLocaleString()}명`, "발송 수"]}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[300px] flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
              {totalSentCount === 0 && selectedDepartments.length > 0 ? (
                <>
                  <p>발송 전입니다. 발송 후 부서별 분포가 표시됩니다.</p>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {selectedDepartments.map((department) => (
                      <Badge key={department} variant="outline">
                        {department} 0명
                      </Badge>
                    ))}
                  </div>
                </>
              ) : totalSentCount > 0 ? (
                <p>발송 데이터가 있으나 선택한 부서와 일치하는 집계가 없습니다.</p>
              ) : (
                <p>선택된 부서가 없습니다.</p>
              )}
            </div>
          )}
        </Card>
      </div>

      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">대상자 상세</h2>
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>이름</TableHead>
                <TableHead>이메일</TableHead>
                <TableHead>소속</TableHead>
                <TableHead>상태</TableHead>
                <TableHead className="text-right">액션</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isActionLogsLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8">
                    로딩 중...
                  </TableCell>
                </TableRow>
              ) : actionLogItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    대상자가 없습니다
                  </TableCell>
                </TableRow>
              ) : (
                actionLogItems.map((item) => (
                  <TableRow key={item.projectTargetId}>
                    <TableCell className="font-medium">
                      <SafeText value={item.name} fallback="-" />
                    </TableCell>
                    <TableCell>
                      <SafeText value={item.email} fallback="-" />
                    </TableCell>
                    <TableCell>
                      <SafeText value={item.department ?? ""} fallback="-" />
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{item.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedLog(item)}
                        data-testid={`button-view-log-${item.targetId}`}
                      >
                        상세 로그
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="text-xl font-semibold">이벤트 타임라인</h2>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleExportTimelineExcel}
            disabled={isTimelineExporting}
            data-testid="button-export-timeline-excel"
          >
            <Download className="mr-2 h-4 w-4" />
            {isTimelineExporting ? "내보내는 중..." : "엑셀 다운로드"}
          </Button>
        </div>
        <div className="space-y-4">
          {isActionLogsLoading ? (
            <div className="text-sm text-muted-foreground">로딩 중...</div>
          ) : timelineItems.length === 0 ? (
            <div className="text-sm text-muted-foreground">이벤트가 없습니다.</div>
          ) : (
            timelineItems.map((event, index) => (
              <div key={`${event.type}-${event.at}-${index}`} className="flex items-start gap-4 pb-4 border-b last:border-0">
                <div className="p-2 rounded-md bg-primary/10">
                  <Clock className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-medium">{event.targetName} - {event.label}</p>
                  <p className="text-sm text-muted-foreground">{formatEventTime(event.at)}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      <Dialog
        open={Boolean(selectedLog)}
        onOpenChange={(open) => {
          if (!open) setSelectedLog(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>상세 로그</DialogTitle>
            <DialogDescription>대상자별 이벤트 타임라인</DialogDescription>
          </DialogHeader>
          {selectedLog ? (
            <div className="space-y-4">
              <div className="rounded-md border p-3 text-sm">
                <p className="font-medium">
                  <SafeText value={selectedLog.name} fallback="-" />
                </p>
                <p className="text-muted-foreground">
                  <SafeText value={selectedLog.email} fallback="-" />
                </p>
              </div>
              <div className="space-y-3">
                {selectedLog.events.length === 0 ? (
                  <p className="text-sm text-muted-foreground">이벤트가 없습니다.</p>
                ) : (
                  selectedLog.events.map((event, index) => (
                    <div
                      key={`${selectedLog.projectTargetId}-${event.type}-${index}`}
                      className="flex items-start gap-3 pb-3 border-b last:border-0"
                    >
                      <div className="p-2 rounded-md bg-primary/10">
                        <Clock className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">{event.label}</p>
                        <p className="text-sm text-muted-foreground">{formatEventTime(event.at)}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <ReportGenerateDialog
        open={isReportOpen}
        onOpenChange={setIsReportOpen}
        project={project}
        onProjectUpdated={() => {
          invalidateProjectQueries();
        }}
      />
    </div>
  );
}
