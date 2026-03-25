"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import type { DragEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import type { Route } from "next";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  CalendarRange,
  Kanban,
  LayoutList,
  Plus,
  Search,
} from "lucide-react";
import {
  format,
  startOfISOWeek,
  eachDayOfInterval,
  startOfMonth,
  endOfMonth,
  differenceInCalendarDays,
} from "date-fns";
import type { Project } from "@shared/schema";
import { getProjectDepartmentDisplay } from "@shared/projectDepartment";
import { apiRequest } from "@/lib/queryClient";
import {
  PROJECT_MONITORING_REFETCH_INTERVAL_MS,
  createAlwaysFreshQueryOptions,
} from "@/lib/projectMetricsRealtime";
import { useToast } from "@/hooks/use-toast";
import { ReportGenerateDialog } from "@/components/ReportGenerateDialog";
import { ListPaginationControls } from "@/components/ListPaginationControls";
import { paginateItems } from "@/lib/pagination";
import {
  getProjectActionKinds,
  resolveProjectStopUpdates,
  type ProjectActionKind,
} from "./projectActionPolicy";
import {
  canCompareSelectedProjects,
  canCopySelectedProjects,
  canStartSelectedProjects,
  canStopSelectedProjects,
} from "./projectSelectionPolicy";

/* -------------------------------------------------------------------------- */
/*                                   Types                                    */
/* -------------------------------------------------------------------------- */

type StatusFilter = "all" | "임시" | "예약" | "진행중" | "완료";
type Quarter = "Q1" | "Q2" | "Q3" | "Q4";
type ViewMode = "list" | "board" | "calendar";
type CalendarMode = "month" | "timeline";

type QuarterStatsItem = {
  quarter: number;
  total: number;
  done: number;
  running: number;
  scheduled: number;
  avg_click_rate: number;
  avg_report_rate: number;
};

const toProjectEditRoute = (projectId: string) =>
  `/projects/${projectId}/edit` as Route;
const toProjectDetailRoute = (projectId: string) =>
  `/projects/${projectId}` as Route;

type CalendarProjectSummary = {
  id: string;
  name: string;
  status: string;
  department: string;
  startDate: string;
  endDate: string;
};

type CalendarDaySummary = {
  date: string;
  inMonth: boolean;
  inQuarter: boolean;
  projects: CalendarProjectSummary[];
  overflowCount: number;
  allProjects: CalendarProjectSummary[];
};

type CalendarWeekDaySummary = {
  start: string;
  end: string;
  days: CalendarDaySummary[];
};

type CalendarMonthSummary = {
  month: string;
  weeks: CalendarWeekDaySummary[];
};

type CalendarWeekDepartment = {
  department: string;
  projects: CalendarProjectSummary[];
};

type CalendarWeekSummary = {
  isoYear: number;
  isoWeek: number;
  start: string;
  end: string;
  departments: CalendarWeekDepartment[];
};

type CalendarResponse = {
  months: CalendarMonthSummary[];
  weeks: CalendarWeekSummary[];
};

const EMPTY_PROJECTS: Project[] = [];
const EMPTY_CALENDAR: CalendarResponse = { months: [], weeks: [] };

type UpdateProjectPayload = {
  id: string;
  updates: Partial<Project>;
  successMessage?: string;
  successDescription?: string;
};

type QuarterGroup = {
  key: string;
  year: number;
  quarter: Quarter;
  label: string;
  projects: Project[];
  statusCounts: Record<StatusFilter, number>;
};

type MonthOption = {
  value: string;
  label: string;
  month?: number;
  quarter?: Quarter;
};

type BoardColumn = {
  status: StatusFilter;
  projects: Project[];
};

/* -------------------------------------------------------------------------- */
/*                                 Constants                                  */
/* -------------------------------------------------------------------------- */

const statusOptions: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "임시", label: "임시" },
  { value: "예약", label: "예약" },
  { value: "진행중", label: "진행중" },
  { value: "완료", label: "완료" },
];

const statusColor: Record<string, string> = {
  임시: "bg-slate-500/20 text-slate-500",
  예약: "bg-blue-500/20 text-blue-500",
  진행중: "bg-orange-500/20 text-orange-500",
  완료: "bg-green-500/20 text-green-500",
};

const statusAccent: Record<string, string> = {
  임시: "bg-slate-500/80 text-white",
  예약: "bg-blue-500/80 text-white",
  진행중: "bg-orange-500/80 text-white",
  완료: "bg-green-500/80 text-white",
};

const quarterOrder: Quarter[] = ["Q1", "Q2", "Q3", "Q4"];

const viewModeOptions: { value: ViewMode; label: string; icon: typeof LayoutList }[] = [
  { value: "list", label: "리스트", icon: LayoutList },
  { value: "board", label: "보드", icon: Kanban },
  { value: "calendar", label: "캘린더", icon: CalendarRange },
];

const calendarModeOptions: { value: CalendarMode; label: string }[] = [
  { value: "month", label: "달력" },
  { value: "timeline", label: "타임라인" },
];

const statusQueryMap: Record<StatusFilter, string | undefined> = {
  all: undefined,
  임시: "temp",
  예약: "scheduled",
  진행중: "running",
  완료: "done",
};

const quarterNumberMap: Record<Quarter, number> = {
  Q1: 1,
  Q2: 2,
  Q3: 3,
  Q4: 4,
};

const numberToQuarter: Record<number, Quarter> = {
  1: "Q1",
  2: "Q2",
  3: "Q3",
  4: "Q4",
};

const quarterStartMonth: Record<Quarter, string> = {
  Q1: "1",
  Q2: "4",
  Q3: "7",
  Q4: "10",
};
const QUARTER_ALL_VALUE = "all";
const MONTH_CARD_HEIGHT = 420;
const boardColumnOrder: StatusFilter[] = ["예약", "진행중", "완료", "임시"];
const PROJECTS_PAGE_SIZE = 10;

/* -------------------------------------------------------------------------- */
/*                               Util Functions                               */
/* -------------------------------------------------------------------------- */

async function fetchJson<T>(url: string): Promise<T> {
  const res = await apiRequest("GET", url);
  const contentType = res.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    const fallback = await res.text();
    throw new Error(
      fallback || "서버가 올바른 JSON 응답을 반환하지 않았습니다.",
    );
  }
  return (await res.json()) as T;
}

function calculateRate(count: number | null | undefined, total: number | null | undefined) {
  if (!total || total <= 0 || !count) return 0;
  return Math.round((count / total) * 100);
}

function parseSearchTerm(raw: string) {
  const tokens = raw
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);

  let year: number | null = null;
  let quarter: Quarter | null = null;
  const rest: string[] = [];

  tokens.forEach((token) => {
    const match = token.match(/^(\d{4}):q([1-4])$/i);
    if (match) {
      year = Number(match[1]);
      quarter = numberToQuarter[Number(match[2])];
      return;
    }
    const yearMatch = token.match(/^(\d{4})$/);
    if (yearMatch && !year) {
      year = Number(yearMatch[1]);
      return;
    }
    const quarterMatch = token.match(/^q([1-4])$/i);
    if (quarterMatch && !quarter) {
      quarter = numberToQuarter[Number(quarterMatch[1])];
      return;
    }
    rest.push(token);
  });

  return {
    normalized: rest.join(" ").toLowerCase(),
    year,
    quarter,
  };
}

function formatMonthLabel(date: Date) {
  return format(date, "yyyy년 MM월");
}

function toDate(value: Date | string): Date {
  if (value instanceof Date) return new Date(value);
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  const fallback = new Date();
  fallback.setMilliseconds(0);
  return fallback;
}

const toSortableTime = (value: Date | string | null | undefined) => {
  if (!value) return Number.POSITIVE_INFINITY;
  const parsed = value instanceof Date ? value : new Date(value);
  const timestamp = parsed.getTime();
  return Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : timestamp;
};

export function compareProjectsBySchedule(
  a: Pick<Project, "startDate" | "endDate" | "name">,
  b: Pick<Project, "startDate" | "endDate" | "name">,
) {
  const startDiff = toSortableTime(a.startDate) - toSortableTime(b.startDate);
  if (startDiff !== 0) return startDiff;

  const endDiff = toSortableTime(a.endDate) - toSortableTime(b.endDate);
  if (endDiff !== 0) return endDiff;

  return (a.name ?? "").localeCompare(b.name ?? "", "ko");
}

export function buildVisibleProjectsByMonth(quarterProjects: Project[], selectedMonthNumber: number) {
  const filtered = Number.isNaN(selectedMonthNumber)
    ? quarterProjects
    : quarterProjects.filter((project) => {
      const rawStart = project.startDate;
      if (!rawStart) return false;
      const start =
        rawStart instanceof Date ? new Date(rawStart) : new Date(rawStart);
      if (Number.isNaN(start.getTime())) return false;
      return start.getMonth() + 1 === selectedMonthNumber;
    });

  return [...filtered].sort(compareProjectsBySchedule);
}

export function resolveCalendarTargetMonthNumber(selectedMonth: string, selectedQuarter: Quarter) {
  if (selectedMonth === QUARTER_ALL_VALUE) {
    return Number(quarterStartMonth[selectedQuarter]);
  }
  const parsed = Number(selectedMonth);
  return Number.isNaN(parsed) ? Number(quarterStartMonth[selectedQuarter]) : parsed;
}

export function findCalendarMonthIndex(months: CalendarMonthSummary[], targetMonthNumber: number) {
  if (months.length === 0) return 0;
  const index = months.findIndex((month) => {
    const monthDate = toDate(month.month);
    return monthDate.getMonth() + 1 === targetMonthNumber;
  });
  return index >= 0 ? index : 0;
}

function formatPercent(value: number) {
  return `${Math.max(0, value)}%`;
}

function getDepartmentLabel(project: Pick<Project, "department" | "departmentTags">, fallback = "-") {
  return getProjectDepartmentDisplay(project, fallback);
}

export function buildVisibleBoardColumns(projects: Project[]): BoardColumn[] {
  const columns = new Map<StatusFilter, Project[]>();

  boardColumnOrder.forEach((status) => {
    columns.set(status, []);
  });

  projects.forEach((project) => {
    if (!boardColumnOrder.includes(project.status as StatusFilter)) {
      return;
    }

    columns.get(project.status as StatusFilter)?.push(project);
  });

  return boardColumnOrder
    .map((status) => ({
      status,
      projects: columns.get(status) ?? [],
    }))
    .filter((column) => column.projects.length > 0);
}

export function getBoardGridClassName(columnCount: number) {
  if (columnCount >= 4) {
    return "grid gap-4 md:grid-cols-2";
  }

  if (columnCount === 3) {
    return "grid gap-4 xl:grid-cols-3";
  }

  if (columnCount === 2) {
    return "grid gap-4 md:grid-cols-2";
  }

  return "grid gap-4";
}

/* -------------------------------------------------------------------------- */
/*                               Main Component                               */
/* -------------------------------------------------------------------------- */

export default function Projects() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const today = new Date();
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [calendarMode, setCalendarMode] = useState<CalendarMode>("month");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedYear, setSelectedYear] = useState<number>(today.getFullYear());
  const [selectedQuarter, setSelectedQuarter] = useState<Quarter>(
    quarterOrder[Math.floor(today.getMonth() / 3)],
  );
  const [selectedMonth, setSelectedMonth] = useState<string>(String(today.getMonth() + 1));
  const [monthIndex, setMonthIndex] = useState(0);
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [reportProject, setReportProject] = useState<Project | null>(null);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isCompareOpen, setIsCompareOpen] = useState(false);
  const [isDayModalOpen, setIsDayModalOpen] = useState(false);
  const [dayModalContent, setDayModalContent] = useState<{
    date: string;
    projects: CalendarProjectSummary[];
  } | null>(null);
  const [detailProject, setDetailProject] = useState<Project | null>(null);
  const [dragInfo, setDragInfo] = useState<
    | {
        projectId: string;
        durationMs: number;
        offsetMs: number;
      }
    | null
  >(null);

  const searchMeta = useMemo(() => parseSearchTerm(searchTerm), [searchTerm]);
  const handleQuarterChange = useCallback((quarter: Quarter) => {
    setSelectedQuarter(quarter);
    setSelectedMonth((prev) =>
      prev === QUARTER_ALL_VALUE ? QUARTER_ALL_VALUE : quarterStartMonth[quarter],
    );
  }, []);

  const handleMonthChange = useCallback((value: string) => {
    setSelectedMonth(value);
    if (value === QUARTER_ALL_VALUE) return;
    const monthNumber = Number(value);
    if (Number.isNaN(monthNumber)) return;
    const derivedQuarter = numberToQuarter[Math.ceil(monthNumber / 3)];
    if (derivedQuarter) {
      setSelectedQuarter(derivedQuarter);
    }
  }, []);

  useEffect(() => {
    if (searchMeta.year) {
      setSelectedYear(searchMeta.year);
    }
  }, [searchMeta.year]);

  useEffect(() => {
    if (searchMeta.quarter) {
      handleQuarterChange(searchMeta.quarter);
    }
  }, [searchMeta.quarter, handleQuarterChange]);

  const statusParam = statusQueryMap[statusFilter];
  const quarterNumber = quarterNumberMap[selectedQuarter];
  const searchQuery = searchMeta.normalized;
  const previousLabel = "이전";
  const nextLabel = "다음";

  const availableYearsQuery = useQuery({
    queryKey: ["projects", "available-years"] as const,
    queryFn: async () => {
      const list = await fetchJson<Project[]>("/api/projects");
      const years = new Set<number>();
      list.forEach((project) => {
        const start = toDate(project.startDate);
        years.add(start.getFullYear());
      });
      const sorted = Array.from(years).sort((a, b) => b - a);
      return sorted.length > 0 ? sorted : [today.getFullYear()];
    },
    ...createAlwaysFreshQueryOptions(),
  });

  const yearOptions = useMemo(() => {
    const years = availableYearsQuery.data ?? [today.getFullYear()];
    if (!years.includes(selectedYear)) {
      return [selectedYear, ...years];
    }
    return years;
  }, [availableYearsQuery.data, selectedYear, today]);

  const projectsQuery = useQuery({
    queryKey: [
      "projects",
      {
        year: selectedYear,
        quarter: quarterNumber,
        status: statusParam,
        search: searchQuery,
      },
    ] as const,
    queryFn: async ({ queryKey }) => {
      const [, params] = queryKey as [
        string,
        {
          year: number;
          quarter: number;
          status: string | undefined;
          search: string;
        },
      ];
      const queryString = new URLSearchParams({
        year: String(params.year),
        quarter: String(params.quarter),
      });
      if (params.status) queryString.set("status", params.status);
      if (params.search) queryString.set("q", params.search);
      return await fetchJson<Project[]>(`/api/projects?${queryString.toString()}`);
    },
    ...createAlwaysFreshQueryOptions(PROJECT_MONITORING_REFETCH_INTERVAL_MS),
  });

  const quarterStatsQuery = useQuery({
    queryKey: ["projects-quarter-stats", selectedYear] as const,
    queryFn: async ({ queryKey }) => {
      const [, year] = queryKey;
      return await fetchJson<QuarterStatsItem[]>(`/api/projects/quarter-stats?year=${year}`);
    },
    ...createAlwaysFreshQueryOptions(PROJECT_MONITORING_REFETCH_INTERVAL_MS),
  });

  const calendarQuery = useQuery({
    queryKey: [
      "projects-calendar",
      { year: selectedYear, quarter: quarterNumber },
    ] as const,
    queryFn: async ({ queryKey }) => {
      const [, params] = queryKey as [
        string,
        { year: number; quarter: number },
      ];
      return await fetchJson<CalendarResponse>(
        `/api/projects/calendar?year=${params.year}&quarter=${params.quarter}`,
      );
    },
    enabled: viewMode === "calendar",
    ...createAlwaysFreshQueryOptions(PROJECT_MONITORING_REFETCH_INTERVAL_MS),
  });

  const quarterProjects = projectsQuery.data ?? EMPTY_PROJECTS;
  const monthOptions = useMemo<MonthOption[]>(() => {
    const map = new Map<number, MonthOption>();
    quarterProjects.forEach((project) => {
      const rawStart = project.startDate;
      if (!rawStart) return;
      const start =
        rawStart instanceof Date ? new Date(rawStart) : new Date(rawStart);
      if (Number.isNaN(start.getTime())) return;
      const month = start.getMonth() + 1;
      if (map.has(month)) return;
      const quarter = numberToQuarter[Math.ceil(month / 3)];
      map.set(month, {
        value: String(month),
        label: formatMonthLabel(start),
        month,
        quarter,
      });
    });
    const monthList = Array.from(map.values()).sort((a, b) => (a.month ?? 0) - (b.month ?? 0));
    if (monthList.length === 0) return monthList;
    return [
      {
        value: QUARTER_ALL_VALUE,
        label: `${selectedYear}년 ${quarterNumber}분기 전체`,
        quarter: selectedQuarter,
      },
      ...monthList,
    ];
  }, [quarterProjects, quarterNumber, selectedQuarter, selectedYear]);

  useEffect(() => {
    if (monthOptions.length === 0) {
      setSelectedMonth(quarterStartMonth[selectedQuarter]);
      return;
    }
    if (!monthOptions.some((option) => option.value === selectedMonth)) {
      const fallback =
        monthOptions.find((option) => option.value !== QUARTER_ALL_VALUE)?.value ??
        monthOptions[0].value;
      setSelectedMonth(fallback);
    }
  }, [monthOptions, selectedMonth, selectedQuarter]);

  const selectedMonthNumber = Number(selectedMonth);

  const projects = useMemo(() => {
    return buildVisibleProjectsByMonth(quarterProjects, selectedMonthNumber);
  }, [quarterProjects, selectedMonthNumber]);
  const paginatedProjects = useMemo(
    () => paginateItems(projects, page, PROJECTS_PAGE_SIZE),
    [page, projects],
  );
  const visibleProjects = paginatedProjects.items;

  const quarterStats = quarterStatsQuery.data ?? [];
  const calendarData = calendarQuery.data ?? EMPTY_CALENDAR;

  useEffect(() => {
    setMonthIndex(0);
  }, [selectedQuarter, selectedYear]);

  useEffect(() => {
    if (viewMode !== "calendar") return;
    const targetMonthNumber = resolveCalendarTargetMonthNumber(selectedMonth, selectedQuarter);
    const targetIndex = findCalendarMonthIndex(calendarData.months, targetMonthNumber);
    setMonthIndex((prev) => (prev === targetIndex ? prev : targetIndex));
  }, [viewMode, selectedMonth, selectedQuarter, calendarData.months]);

  useEffect(() => {
    if (calendarData.months.length === 0) {
      setMonthIndex(0);
      return;
    }
    if (monthIndex >= calendarData.months.length) {
      setMonthIndex(calendarData.months.length - 1);
    }
  }, [calendarData.months.length, monthIndex]);

  const handlePrevMonth = () => {
    setMonthIndex((prev) => Math.max(0, prev - 1));
  };

  const handleNextMonth = () => {
    if (calendarData.months.length === 0) return;
    setMonthIndex((prev) => Math.min(calendarData.months.length - 1, prev + 1));
  };

  useEffect(() => {
    if (viewMode !== "list" && selectedProjects.length > 0) {
      setSelectedProjects([]);
    }
  }, [viewMode, selectedProjects.length]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, selectedYear, selectedQuarter, selectedMonth, statusFilter]);

  useEffect(() => {
    if (paginatedProjects.page !== page) {
      setPage(paginatedProjects.page);
    }
  }, [page, paginatedProjects.page]);

  useEffect(() => {
    setSelectedProjects((prev) => {
      if (prev.length === 0) return prev;
      const validIds = new Set(visibleProjects.map((project) => project.id));
      const next = prev.filter((id) => validIds.has(id));
      if (next.length === prev.length && next.every((id, index) => id === prev[index])) {
        return prev;
      }
      return next;
    });
  }, [visibleProjects]);

  const invalidateProjectData = () => {
    queryClient.invalidateQueries({ queryKey: ["projects"] });
    queryClient.invalidateQueries({ queryKey: ["projects-quarter-stats"] });
    queryClient.invalidateQueries({ queryKey: ["projects-calendar"] });
  };

  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map((id) => apiRequest("DELETE", `/api/projects/${id}`)));
      return ids;
    },
    onSuccess: (ids) => {
      invalidateProjectData();
      setSelectedProjects([]);
      toast({
        title: "프로젝트 삭제 완료",
        description: `${ids.length}개 프로젝트가 삭제되었습니다.`,
      });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "프로젝트 삭제에 실패했습니다.";
      toast({ title: "삭제 실패", description: message, variant: "destructive" });
    },
  });

  const copyMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await apiRequest("POST", "/api/projects/copy", { ids });
      return (await res.json()) as Project[];
    },
    onSuccess: (copiedProjects) => {
      invalidateProjectData();
      setSelectedProjects([]);
      toast({
        title: "프로젝트 복제 완료",
        description:
          copiedProjects[0]?.name != null
            ? `${copiedProjects[0].name} 프로젝트를 생성했습니다.`
            : "프로젝트를 복제했습니다.",
      });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "프로젝트 복제에 실패했습니다.";
      toast({ title: "복제 실패", description: message, variant: "destructive" });
    },
  });

  const bulkStartMutation = useMutation({
    mutationFn: async (projectsToStart: Project[]) => {
      const results = await Promise.allSettled(
        projectsToStart.map((project) =>
          apiRequest("PATCH", `/api/projects/${project.id}/status`, { to: "RUNNING" }),
        ),
      );

      const successCount = results.filter((result) => result.status === "fulfilled").length;
      const failureMessages = results
        .filter((result): result is PromiseRejectedResult => result.status === "rejected")
        .map((result) =>
          result.reason instanceof Error ? result.reason.message : "프로젝트 시작에 실패했습니다.",
        );

      if (successCount === 0) {
        throw new Error(failureMessages[0] ?? "프로젝트 시작에 실패했습니다.");
      }

      return {
        totalCount: projectsToStart.length,
        successCount,
        failureCount: results.length - successCount,
        failureMessages,
      };
    },
    onSuccess: ({ successCount, failureCount, failureMessages }) => {
      invalidateProjectData();
      setSelectedProjects([]);
      toast({
        title: failureCount > 0 ? "일부 프로젝트 시작 완료" : "프로젝트 시작 완료",
        description:
          failureCount > 0
            ? `${successCount}개 시작, ${failureCount}개 실패${failureMessages[0] ? ` · ${failureMessages[0]}` : ""}`
            : `${successCount}개 프로젝트를 시작했습니다.`,
      });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "프로젝트 시작에 실패했습니다.";
      toast({ title: "시작 실패", description: message, variant: "destructive" });
    },
  });

  const bulkStopMutation = useMutation({
    mutationFn: async (projectsToStop: Project[]) => {
      const stoppedAt = new Date();
      const results = await Promise.allSettled(
        projectsToStop.map((project) =>
          apiRequest("PATCH", `/api/projects/${project.id}`, {
            ...resolveProjectStopUpdates(project.status, stoppedAt),
          }),
        ),
      );

      const successCount = results.filter((result) => result.status === "fulfilled").length;
      const failureMessages = results
        .filter((result): result is PromiseRejectedResult => result.status === "rejected")
        .map((result) =>
          result.reason instanceof Error ? result.reason.message : "프로젝트 중지에 실패했습니다.",
        );

      if (successCount === 0) {
        throw new Error(failureMessages[0] ?? "프로젝트 중지에 실패했습니다.");
      }

      return {
        totalCount: projectsToStop.length,
        successCount,
        failureCount: results.length - successCount,
        failureMessages,
      };
    },
    onSuccess: ({ successCount, failureCount, failureMessages }) => {
      invalidateProjectData();
      setSelectedProjects([]);
      toast({
        title: failureCount > 0 ? "일부 프로젝트 중지 완료" : "프로젝트 중지 완료",
        description:
          failureCount > 0
            ? `${successCount}개 중지, ${failureCount}개 실패${failureMessages[0] ? ` · ${failureMessages[0]}` : ""}`
            : `${successCount}개 프로젝트를 중지했습니다.`,
      });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "프로젝트 중지에 실패했습니다.";
      toast({ title: "중지 실패", description: message, variant: "destructive" });
    },
  });

  const updateProjectMutation = useMutation<Project, Error, UpdateProjectPayload>({
    mutationFn: async ({ id, updates }) => {
      const res = await apiRequest("PATCH", `/api/projects/${id}`, updates);
      return (await res.json()) as Project;
    },
    onSuccess: (project, variables) => {
      invalidateProjectData();
      toast({
        title: variables.successMessage ?? "프로젝트가 업데이트되었습니다.",
        description: `${project.name} 일정이 변경되었습니다.`,
      });
    },
    onError: (error) => {
      toast({
        title: "업데이트 실패",
        description: error.message ?? "프로젝트 일정을 업데이트할 수 없습니다.",
        variant: "destructive",
      });
    },
  });

  const updateProjectDates = (projectId: string, startDate: Date, endDate: Date, message: string) => {
    updateProjectMutation.mutate({
      id: projectId,
      updates: {
        startDate,
        endDate,
      },
      successMessage: message,
    });
  };

  const quarterGroup = useMemo<QuarterGroup>(() => {
    const key = `${selectedYear}-${selectedQuarter}`;
    const statusCounts: Record<StatusFilter, number> = {
      all: projects.length,
      임시: 0,
      예약: 0,
      진행중: 0,
      완료: 0,
    };

    projects.forEach((project) => {
      const status = project.status as StatusFilter;
      if (statusCounts[status] !== undefined) {
        statusCounts[status] += 1;
      }
    });

    return {
      key,
      year: selectedYear,
      quarter: selectedQuarter,
      label: `${selectedYear} · ${selectedQuarter}`,
      projects,
      statusCounts,
    };
  }, [projects, selectedYear, selectedQuarter]);

  const quarterStatItem = useMemo(() =>
    quarterStats.find((item) => item.quarter === quarterNumber) ?? null,
  [quarterStats, quarterNumber]);

  const selectedProjectDetails = useMemo(() =>
    visibleProjects.filter((project) => selectedProjects.includes(project.id)),
  [selectedProjects, visibleProjects]);

  const canCompare = canCompareSelectedProjects(selectedProjectDetails.length);
  const canCopy = canCopySelectedProjects(selectedProjectDetails.length);
  const canBulkStart = canStartSelectedProjects(
    selectedProjectDetails.map((project) => project.status),
  );
  const canBulkStop = canStopSelectedProjects(
    selectedProjectDetails.map((project) => project.status),
  );

  useEffect(() => {
    if (isCompareOpen && !canCompare) {
      setIsCompareOpen(false);
    }
  }, [canCompare, isCompareOpen]);

  const comparisonData = useMemo(() =>
    selectedProjectDetails.map((project) => {
      const start = toDate(project.startDate);
      const end = toDate(project.endDate);
      return {
        id: project.id,
        name: project.name,
        department: getDepartmentLabel(project),
        status: project.status,
        발송수: project.targetCount ?? 0,
        오픈률: calculateRate(project.openCount, project.targetCount),
        클릭률: calculateRate(project.clickCount, project.targetCount),
        제출률: calculateRate(project.submitCount, project.targetCount),
        period: `${format(start, "yyyy-MM-dd")} ~ ${format(end, "yyyy-MM-dd")}`,
      };
    }),
  [selectedProjectDetails]);

  const isAllSelected = visibleProjects.length > 0 &&
    visibleProjects.every((project) => selectedProjects.includes(project.id));

  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedProjects(visibleProjects.map((project) => project.id));
      return;
    }
    setSelectedProjects([]);
  };

  const toggleProjectSelection = (projectId: string, checked: boolean) => {
    setSelectedProjects((prev) => {
      if (checked) {
        if (prev.includes(projectId)) return prev;
        return [...prev, projectId];
      }
      return prev.filter((id) => id !== projectId);
    });
  };

  const handleReportDialogChange = (open: boolean) => {
    setIsReportOpen(open);
    if (!open) setReportProject(null);
  };

  const handleCompareDialogChange = (open: boolean) => {
    setIsCompareOpen(open);
  };

  const handleCompareOpen = () => {
    if (!canCompare) return;
    setIsCompareOpen(true);
  };

  const handleCopySelected = () => {
    if (!canCopy) return;
    copyMutation.mutate(selectedProjects.slice(0, 1));
  };

  const handleBulkStart = () => {
    if (!canBulkStart) return;
    bulkStartMutation.mutate(selectedProjectDetails);
  };

  const handleBulkStop = () => {
    if (!canBulkStop) return;
    bulkStopMutation.mutate(selectedProjectDetails);
  };

  const handleBulkDelete = () => {
    if (selectedProjects.length === 0) return;
    const confirmMessage = selectedProjects.length === 1
      ? "선택한 프로젝트를 삭제하시겠습니까?"
      : `선택한 ${selectedProjects.length}개 프로젝트를 삭제하시겠습니까?`;
    if (!confirm(confirmMessage)) return;
    deleteMutation.mutate(selectedProjects);
  };

  const handleDeleteProject = (project: Project) => {
    if (!confirm(`"${project.name}" 프로젝트를 삭제하시겠습니까?`)) return;
    deleteMutation.mutate([project.id]);
  };

  const openReport = (project: Project) => {
    setReportProject(project);
    setIsReportOpen(true);
  };

  const handleCancelProject = (project: Project) => {
    if (!confirm(`"${project.name}" 프로젝트 예약을 취소하시겠습니까?`)) return;
    updateProjectMutation.mutate({
      id: project.id,
      updates: {
        status: "임시",
      },
      successMessage: "프로젝트 예약을 취소했습니다.",
    });
  };

  const handleStopProject = (project: Project) => {
    if (!confirm(`"${project.name}" 프로젝트를 중지하시겠습니까?`)) return;
    updateProjectMutation.mutate({
      id: project.id,
      updates: resolveProjectStopUpdates(project.status, new Date()),
      successMessage: "프로젝트를 중지했습니다.",
    });
  };

  const renderProjectActions = (project: Project) =>
    getProjectActionKinds(project.status).map((action) => {
      switch (action as ProjectActionKind) {
        case "detail":
          return (
            <Link key={`${project.id}-detail`} href={toProjectDetailRoute(project.id)}>
              <Button variant="ghost" size="sm">상세</Button>
            </Link>
          );
        case "edit":
          return (
            <Link key={`${project.id}-edit`} href={toProjectEditRoute(project.id)}>
              <Button variant="outline" size="sm">수정</Button>
            </Link>
          );
        case "delete":
          return (
            <Button
              key={`${project.id}-delete`}
              variant="ghost"
              size="sm"
              onClick={() => handleDeleteProject(project)}
            >
              삭제
            </Button>
          );
        case "cancel":
          return (
            <Button
              key={`${project.id}-cancel`}
              variant="ghost"
              size="sm"
              onClick={() => handleCancelProject(project)}
            >
              취소
            </Button>
          );
        case "stop":
          return (
            <Button
              key={`${project.id}-stop`}
              variant="ghost"
              size="sm"
              onClick={() => handleStopProject(project)}
            >
              중지
            </Button>
          );
        case "report":
          return (
            <Button
              key={`${project.id}-report`}
              variant="ghost"
              size="sm"
              onClick={() => openReport(project)}
            >
              보고서
            </Button>
          );
        default:
          return null;
      }
    });

  const yearQuarterPrefill = `?year=${selectedYear}&quarter=${quarterNumber}`;

  const selectedWeekLabel = (week: CalendarWeekSummary) =>
    `${week.isoYear}년 ${week.isoWeek}주`;

  const openDayModal = (payload: { date: string; projects: CalendarProjectSummary[] }) => {
    setDayModalContent(payload);
    setIsDayModalOpen(true);
  };

  const closeDayModal = () => {
    setIsDayModalOpen(false);
    setDayModalContent(null);
  };

  const openDetailPanel = (projectId: string) => {
      const project = projects.find((item) => item.id === projectId) ?? null;
    setDetailProject(project);
  };

  const closeDetailPanel = () => {
    setDetailProject(null);
  };

  const handleTimelineDragStart = (projectSummary: CalendarProjectSummary) =>
    (event: DragEvent<HTMLButtonElement>) => {
      const project = projects.find((item) => item.id === projectSummary.id);
      if (!project) return;
      const startDate = toDate(project.startDate);
      const endDate = toDate(project.endDate);
      const weekStart = startOfISOWeek(startDate);
      setDragInfo({
        projectId: projectSummary.id,
        durationMs: endDate.getTime() - startDate.getTime(),
        offsetMs: startDate.getTime() - weekStart.getTime(),
      });
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", projectSummary.id);
    };

  const handleTimelineDragEnd = () => {
    setDragInfo(null);
  };

  const handleWeekDrop = (week: CalendarWeekSummary) =>
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const projectId = event.dataTransfer.getData("text/plain");
      if (!projectId) return;
      const project = projects.find((item) => item.id === projectId);
      if (!project) return;
      const info = dragInfo || {
        projectId,
        durationMs: toDate(project.endDate).getTime() - toDate(project.startDate).getTime(),
        offsetMs: 0,
      };
      const newWeekStart = toDate(week.start);
      const newStart = new Date(newWeekStart.getTime() + info.offsetMs);
      const newEnd = new Date(newStart.getTime() + info.durationMs);
      updateProjectDates(projectId, newStart, newEnd, "일정이 이동되었습니다.");
      setDragInfo(null);
    };

  const handleWeekDragOver = () => (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  };

  const renderQuarterHighlights = () => (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">{quarterGroup.label}</h2>
          <p className="text-sm text-muted-foreground">
            {quarterGroup.projects.length}개 프로젝트 · 임시 {quarterGroup.statusCounts["임시"]}개 · 예약 {quarterGroup.statusCounts["예약"]}개 · 진행중 {quarterGroup.statusCounts["진행중"]}개 · 완료 {quarterGroup.statusCounts["완료"]}개
          </p>
        </div>
        {quarterStatItem ? (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>평균 클릭률 {formatPercent(quarterStatItem.avg_click_rate)}</span>
            <span>평균 신고율 {formatPercent(quarterStatItem.avg_report_rate)}</span>
          </div>
        ) : null}
      </div>
    </Card>
  );

  const renderListView = () => (
    <Card className="p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={isAllSelected}
                  onCheckedChange={(checked) => toggleSelectAll(Boolean(checked))}
                  data-testid="checkbox-select-all"
                />
              </TableHead>
              <TableHead>프로젝트명</TableHead>
              <TableHead>일정</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>대상자 수</TableHead>
              <TableHead>오픈률</TableHead>
              <TableHead>클릭률</TableHead>
              <TableHead>제출률</TableHead>
              <TableHead>부서</TableHead>
              <TableHead className="text-right">액션</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleProjects.map((project) => {
              const start = toDate(project.startDate);
              const end = toDate(project.endDate);
              return (
                <TableRow key={project.id}>
                  <TableCell>
                    <Checkbox
                      checked={selectedProjects.includes(project.id)}
                      onCheckedChange={(checked) =>
                        toggleProjectSelection(project.id, Boolean(checked))
                      }
                      data-testid={`checkbox-project-${project.id}`}
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    <div className="flex flex-col gap-1">
                      <span>{project.name}</span>
                      <Badge variant="secondary" className="w-fit">
                        {`${format(start, "yyyy")}·${numberToQuarter[quarterNumber]}`}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(start, "yyyy-MM-dd")} ~ {format(end, "yyyy-MM-dd")}
                  </TableCell>
                  <TableCell>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge className={statusColor[project.status] ?? ""}>
                          {project.status}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        {project.status === "예약"
                          ? `${format(start, "MM/dd HH:mm")} 시작 예정`
                          : `진행 기간 ${format(start, "MM/dd HH:mm")} ~ ${format(end, "MM/dd HH:mm")}`}
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell>{project.targetCount?.toLocaleString() ?? 0}명</TableCell>
                  <TableCell>{calculateRate(project.openCount, project.targetCount)}%</TableCell>
                  <TableCell>{calculateRate(project.clickCount, project.targetCount)}%</TableCell>
                  <TableCell>{calculateRate(project.submitCount, project.targetCount)}%</TableCell>
                  <TableCell>{getDepartmentLabel(project)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {renderProjectActions(project)}
                      <div className="hidden">
                      {project.status === "임시" ? (
                        <>
                          <Link href={`/projects/${project.id}/edit`}>
                            <Button variant="outline" size="sm">재개</Button>
                          </Link>
                          <Button variant="ghost" size="sm" onClick={() => handleDeleteProject(project)}>
                            삭제
                          </Button>
                        </>
                      ) : (
                        <>
                          <Link href={`/projects/${project.id}`}>
                            <Button variant="ghost" size="sm">상세</Button>
                          </Link>
                          <Button variant="ghost" size="sm" onClick={() => openReport(project)}>
                            보고서
                          </Button>
                        </>
                      )}
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {visibleProjects.length === 0 ? (
        <CardContent className="border-t px-6 py-10 text-center text-sm text-muted-foreground">
          표시할 프로젝트가 없습니다. 조건을 변경해보세요.
        </CardContent>
      ) : null}
    </Card>
  );

  const renderBoardView = () => {
    const columns = buildVisibleBoardColumns(visibleProjects);

    if (columns.length === 0) {
      return (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          표시할 프로젝트가 없습니다. 조건을 변경해보세요.
        </Card>
      );
    }

    return (
      <div className={getBoardGridClassName(columns.length)}>
        {columns.map(({ status, projects: list }) => (
          <Card key={status} className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{status}</h3>
              <Badge className={statusColor[status] ?? ""}>{list.length}</Badge>
            </div>
            <div className="space-y-3">
              {list.map((project) => {
                const start = toDate(project.startDate);
                const end = toDate(project.endDate);
                return (
                  <Card key={project.id} className="p-3 space-y-2 border border-dashed">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{project.name}</span>
                      <Badge variant="outline">{getDepartmentLabel(project)}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {format(start, "MM/dd")} ~ {format(end, "MM/dd")}
                    </p>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>대상 {project.targetCount ?? 0}명</span>
                      <span>클릭 {calculateRate(project.clickCount, project.targetCount)}%</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {renderProjectActions(project)}
                      <div className="hidden">
                      {project.status === "임시" ? (
                        <>
                          <Link href={`/projects/${project.id}/edit`}>
                            <Button variant="outline" size="sm">재개</Button>
                          </Link>
                          <Button variant="ghost" size="sm" onClick={() => handleDeleteProject(project)}>
                            삭제
                          </Button>
                        </>
                      ) : (
                        <Link href={`/projects/${project.id}`}>
                          <Button variant="ghost" size="sm">상세</Button>
                        </Link>
                      )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </Card>
        ))}
      </div>
    );
  };

  const renderCalendarMonth = () => {
    const months = calendarData.months;
    if (months.length === 0) {
      return (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          월간 캘린더에 표시할 프로젝트가 없습니다.
        </Card>
      );
    }

    const clampedIndex = Math.min(monthIndex, months.length - 1);
    const selectedMonth = months[clampedIndex];
    const monthDate = toDate(selectedMonth.month);
    const monthStart = startOfMonth(monthDate);
    const monthEnd = endOfMonth(monthDate);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

    const projectMap = new Map<
      string,
      {
        summary: CalendarProjectSummary;
        start: Date;
        end: Date;
      }
    >();

    selectedMonth.weeks.forEach((week) =>
      week.days.forEach((day) => {
        day.allProjects.forEach((project) => {
          if (projectMap.has(project.id)) return;
          projectMap.set(project.id, {
            summary: project,
            start: toDate(project.startDate),
            end: toDate(project.endDate),
          });
        });
      }),
    );

    const projectRows = Array.from(projectMap.values()).sort(
      (a, b) => a.start.getTime() - b.start.getTime(),
    );

    const gridTemplate = `160px repeat(${days.length}, minmax(32px, 1fr))`;

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={handlePrevMonth}
              disabled={clampedIndex === 0}
              aria-label="이전 달 보기"
            >
              &lt;
            </Button>
            <h3 className="text-lg font-semibold">{format(monthDate, "yyyy년 MM월")}</h3>
            <Button
              variant="outline"
              size="icon"
              onClick={handleNextMonth}
              disabled={clampedIndex === months.length - 1}
              aria-label="다음 달 보기"
            >
              &gt;
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            상태별 색상(예약/진행중/완료)으로 기간을 표시합니다.
          </p>
        </div>
        <div className="overflow-x-auto">
          <div
            className="grid text-xs"
            style={{ gridTemplateColumns: gridTemplate }}
            role="grid"
            aria-label={`${format(monthDate, "yyyy년 MM월")} 프로젝트 달력`}
          >
            <div className="sticky left-0 z-10 bg-background px-3 py-2 font-semibold" role="columnheader">
              프로젝트
            </div>
            {days.map((day) => (
              <div
                key={`header-${day.toISOString()}`}
                className="border-l px-2 py-2 text-center font-semibold text-muted-foreground"
                role="columnheader"
              >
                {day.getDate()}
              </div>
            ))}
            {projectRows.length === 0 ? (
              <div className="col-span-full px-3 py-6 text-center text-sm text-muted-foreground">
                이 달에는 프로젝트가 없습니다.
              </div>
            ) : (
              projectRows.map(({ summary, start, end }) => {
                const clampedStart = start < monthStart ? monthStart : start;
                const clampedEnd = end > monthEnd ? monthEnd : end;
                if (clampedEnd < monthStart || clampedStart > monthEnd) {
                  return null;
                }
                const startIndex = differenceInCalendarDays(clampedStart, monthStart);
                const endIndex = differenceInCalendarDays(clampedEnd, monthStart);
                const span = Math.max(1, endIndex - startIndex + 1);
                const leftPercent = (startIndex / days.length) * 100;
                const widthPercent = (span / days.length) * 100;
                const statusClass = statusAccent[summary.status] ?? "bg-primary/80 text-white";

                return (
                  <Fragment key={summary.id}>
                    <div
                      className="sticky left-0 z-10 border-t bg-background px-3 py-2 text-xs font-medium"
                      role="rowheader"
                    >
                      <div>{summary.name}</div>
                      <div className="text-[10px] text-muted-foreground">{summary.department || "부서 미지정"}</div>
                    </div>
                    <div
                      className="relative border-t"
                      style={{ gridColumn: `span ${days.length}` }}
                      role="gridcell"
                      aria-label={`${summary.name} · ${format(clampedStart, "MM/dd")} ~ ${format(clampedEnd, "MM/dd")}`}
                    >
                      <div
                        className={`absolute top-1 h-6 rounded ${statusClass}`}
                        style={{
                          left: `${leftPercent}%`,
                          width: `${widthPercent}%`,
                          minWidth: `calc(100% / ${days.length})`,
                        }}
                      >
                        <span className="sr-only">{summary.status}</span>
                      </div>
                    </div>
                  </Fragment>
                );
              })
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderTimelineWeekCard = (week: CalendarWeekSummary) => (
    <Card
      key={`${week.isoYear}-${week.isoWeek}`}
      className="space-y-1.5 rounded-lg border bg-background p-2 shadow-sm"
      onDragOver={handleWeekDragOver()}
      onDrop={handleWeekDrop(week)}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          {selectedWeekLabel(week)} · {format(toDate(week.start), "MM/dd")} ~ {format(toDate(week.end), "MM/dd")}
        </h3>
        {format(today, "yyyy-MM-dd") >= format(toDate(week.start), "yyyy-MM-dd") &&
        format(today, "yyyy-MM-dd") <= format(toDate(week.end), "yyyy-MM-dd") ? (
          <Badge variant="outline">이번 주</Badge>
        ) : null}
      </div>
      <div className="space-y-1.5">
        {week.departments.length === 0 ? (
          <div className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            해당 주차에 프로젝트가 없습니다.
          </div>
        ) : (
          week.departments.map((dept) => (
            <Card key={dept.department} className="border border-dashed p-2" role="group" aria-label={`${dept.department} 프로젝트`}>
              <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-semibold">{dept.department}</span>
                <span>{dept.projects.length}개</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {dept.projects.map((project) => (
                  <div key={project.id} className="flex items-center gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className={`rounded px-2 py-1 text-xs ${statusAccent[project.status] ?? "bg-primary/80 text-white"}`}
                          draggable
                          onDragStart={handleTimelineDragStart(project)}
                          onDragEnd={handleTimelineDragEnd}
                          onClick={() => openDetailPanel(project.id)}
                          aria-label={`${project.name} · ${project.status}`}
                        >
                          {project.name}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <div className="space-y-1 text-xs">
                          <p className="font-semibold">{project.name}</p>
                          <p>{project.status}</p>
                          <p>
                            {format(toDate(project.startDate), "MM/dd")} ~ {format(toDate(project.endDate), "MM/dd")}
                          </p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                ))}
              </div>
            </Card>
          ))
        )}
      </div>
    </Card>
  );

  const renderTimeline = () => {
    const weeks = calendarData.weeks;
    if (weeks.length === 0) {
      return (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          타임라인에 표시할 프로젝트가 없습니다.
        </Card>
      );
    }

    return (
      <div className="space-y-4 rounded-md border p-1" role="list" aria-label="주간 타임라인">
        {weeks.map((week) => (
          <div key={`${week.isoYear}-${week.isoWeek}`} role="listitem" className="px-1">
            {renderTimelineWeekCard(week)}
          </div>
        ))}
      </div>
    );
  };

  const renderCalendarView = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {calendarModeOptions.map((option) => (
          <Button
            key={option.value}
            variant={calendarMode === option.value ? "default" : "outline"}
            size="sm"
            onClick={() => setCalendarMode(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
      {calendarMode === "month" ? renderCalendarMonth() : renderTimeline()}
    </div>
  );

  const detailPanel = detailProject ? (
    <Dialog open={Boolean(detailProject)} onOpenChange={(open) => !open && closeDetailPanel()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{detailProject.name}</DialogTitle>
          <DialogDescription>
            {getDepartmentLabel(detailProject, "부서 미지정")} · {detailProject.status}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <p>
            일정: {format(toDate(detailProject.startDate), "yyyy-MM-dd")} ~ {format(toDate(detailProject.endDate), "yyyy-MM-dd")}
          </p>
          <p>대상: {detailProject.targetCount ?? 0}명</p>
          <p>오픈률: {calculateRate(detailProject.openCount, detailProject.targetCount)}%</p>
          <p>클릭률: {calculateRate(detailProject.clickCount, detailProject.targetCount)}%</p>
          <p>제출률: {calculateRate(detailProject.submitCount, detailProject.targetCount)}%</p>
          <p className="text-muted-foreground">
            {detailProject.description ?? "설명이 등록되지 않았습니다."}
          </p>
        </div>
        <DialogFooter>
          {renderProjectActions(detailProject)}
          <Button variant="outline" onClick={() => closeDetailPanel()}>
            닫기
          </Button>
          <div className="hidden">
          {detailProject.status === "임시" ? (
            <>
              <Link href={`/projects/${detailProject.id}/edit`}>
                <Button>재개</Button>
              </Link>
              <Button variant="ghost" onClick={() => handleDeleteProject(detailProject)}>
                삭제
              </Button>
            </>
          ) : (
            <Link href={`/projects/${detailProject.id}`}>
              <Button>상세 보기</Button>
            </Link>
          )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ) : null;

  const dayModal = dayModalContent ? (
    <Dialog open={isDayModalOpen} onOpenChange={(open) => !open && closeDayModal()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{format(toDate(dayModalContent.date), "yyyy년 MM월 dd일")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {dayModalContent.projects.map((project) => (
            <Card key={project.id} className="p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">{project.name}</span>
                <Badge className={statusColor[project.status] ?? ""}>{project.status}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {format(toDate(project.startDate), "MM/dd")} ~ {format(toDate(project.endDate), "MM/dd")}
              </p>
            </Card>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  ) : null;

  const comparisonDialog = (
    <Dialog open={isCompareOpen} onOpenChange={handleCompareDialogChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>비교 보고서 미리보기</DialogTitle>
          <DialogDescription>선택된 프로젝트의 주요 지표를 비교합니다.</DialogDescription>
        </DialogHeader>
        {canCompare ? (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              {selectedProjectDetails.length}개 프로젝트 비교 중
            </div>
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={comparisonData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" />
                <YAxis yAxisId="count" stroke="hsl(var(--muted-foreground))" />
                <YAxis
                  yAxisId="rate"
                  orientation="right"
                  domain={[0, 100]}
                  stroke="hsl(var(--muted-foreground))"
                  tickFormatter={(value) => `${value}%`}
                />
                <RechartsTooltip
                  formatter={(value: unknown, name: unknown) => {
                    const label = String(name);
                    if (typeof value === "number") {
                      return label.endsWith("률")
                        ? [`${value}%`, label]
                        : [`${value.toLocaleString()}명`, label];
                    }
                    return [String(value ?? ""), label];
                  }}
                />
                <Legend />
                <Bar yAxisId="count" dataKey="발송수" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Line yAxisId="rate" type="linear" dataKey="오픈률" stroke="hsl(var(--chart-2))" strokeWidth={2} />
                <Line yAxisId="rate" type="linear" dataKey="클릭률" stroke="hsl(var(--chart-3))" strokeWidth={2} />
                <Line yAxisId="rate" type="linear" dataKey="제출률" stroke="hsl(var(--chart-4))" strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">비교할 프로젝트가 선택되지 않았습니다.</p>
        )}
      </DialogContent>
    </Dialog>
  );

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold">프로젝트 관리</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {viewModeOptions.map((option) => {
            const Icon = option.icon;
            return (
              <Button
                key={option.value}
                variant={viewMode === option.value ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode(option.value)}
              >
                <Icon className="mr-2 h-4 w-4" />
                {option.label}
              </Button>
            );
          })}
          <Link href={`/projects/new${yearQuarterPrefill}`}>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> 새 프로젝트
            </Button>
          </Link>
        </div>
      </div>

      <Card className="space-y-4 p-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">연도</span>
            <Select value={String(selectedYear)} onValueChange={(value) => setSelectedYear(Number(value))}>
              <SelectTrigger className="w-28">
                <SelectValue placeholder="연도" />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((year) => (
                  <SelectItem key={year} value={String(year)}>
                    {year}년
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <ToggleGroup
            type="single"
            value={selectedQuarter}
            onValueChange={(value) => value && handleQuarterChange(value as Quarter)}
            className="flex items-center gap-1 rounded-md border bg-background p-1"
          >
            {quarterOrder.map((quarter) => (
              <ToggleGroupItem
                key={quarter}
                value={quarter}
                className="px-3 py-1 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
              >
                {quarter}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">월</span>
            <Select
              value={selectedMonth}
              onValueChange={handleMonthChange}
              disabled={monthOptions.length === 0}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="월 선택" />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    표시할 월이 없습니다.
                  </div>
                ) : (
                  monthOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <ToggleGroup
            type="single"
            value={statusFilter}
            onValueChange={(value) => value && setStatusFilter(value as StatusFilter)}
            className="flex items-center gap-2"
          >
            {statusOptions.map((option) => (
              <ToggleGroupItem key={option.value} value={option.value} className="px-3 py-1 text-xs">
                {option.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="프로젝트명/부서/설명 검색 또는 q2 / 연도:q분기 형식으로 필터"
            className="pl-10"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          예시: 분기(q1~q4) 또는 연도:분기 형식으로 조회할 수 있습니다.
        </p>
      </Card>

      {viewMode !== "calendar" ? renderQuarterHighlights() : null}

      {viewMode === "list" && selectedProjects.length > 0 ? (
        <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-4 py-3 text-sm">
          <span>{selectedProjects.length}개 프로젝트 선택됨</span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCompareOpen}
            disabled={!canCompare}
          >
            비교 미리보기
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopySelected}
            disabled={!canCopy || copyMutation.isPending}
          >
            {copyMutation.isPending ? "복제 중..." : "복제"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleBulkStart}
            disabled={!canBulkStart || bulkStartMutation.isPending}
          >
            {bulkStartMutation.isPending ? "시작 중..." : "시작"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleBulkStop}
            disabled={!canBulkStop || bulkStopMutation.isPending}
          >
            {bulkStopMutation.isPending ? "중지 중..." : "중지"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleBulkDelete}
            disabled={deleteMutation.isPending}
          >
            삭제
          </Button>
        </div>
      ) : null}

      {viewMode === "list" ? renderListView() : null}
      {viewMode === "board" ? renderBoardView() : null}
      {viewMode !== "calendar" ? (
        <ListPaginationControls
          page={paginatedProjects.page}
          totalPages={paginatedProjects.totalPages}
          onPageChange={setPage}
          previousLabel={previousLabel}
          nextLabel={nextLabel}
        />
      ) : null}
      {viewMode === "calendar" ? renderCalendarView() : null}

      <ReportGenerateDialog
        open={isReportOpen}
        onOpenChange={handleReportDialogChange}
        project={reportProject}
        onProjectUpdated={(updated) => {
          setReportProject(updated);
          queryClient.invalidateQueries({ queryKey: ["projects"] });
        }}
      />
      {comparisonDialog}
      {detailPanel}
      {dayModal}
    </div>
  );
}
