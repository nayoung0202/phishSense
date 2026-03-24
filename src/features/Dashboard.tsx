"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { StatCard } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import Link from "next/link";
import { type Project } from "@shared/schema";
import { useI18n } from "@/components/I18nProvider";
import { getIntlLocale } from "@/lib/i18n";
import {
  Users,
  BarChart3,
  Shield,
  TrendingUp,
  LineChart,
  Plus,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

type MonthlySummary = {
  key: string;
  monthLabel: string;
  monthDate: Date;
  targetCount: number;
  openCount: number;
  clickCount: number;
  submitCount: number;
  openRate: number | null;
  clickRate: number | null;
  submitRate: number | null;
};

type QuarterlySummary = {
  key: string;
  quarterLabel: string;
  quarterDate: Date;
  targetCount: number;
  openCount: number;
  clickCount: number;
  submitCount: number;
  openRate: number | null;
  clickRate: number | null;
  submitRate: number | null;
};

type QuarterComparisonItem = {
  index: number;
  projectName: string;
  targetCount: number;
  openRate: number;
  clickRate: number;
  submitRate: number;
};

const toMonthKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const getMonthParts = (monthKey: string) => {
  const [year = "", month = ""] = monthKey.split("-");
  return { year, month };
};
const getInitialMonthKey = (availableMonthKeys: string[], now: Date) => {
  if (availableMonthKeys.length === 0) return null;

  const currentMonthKey = toMonthKey(now);
  if (availableMonthKeys.includes(currentMonthKey)) {
    return currentMonthKey;
  }

  const currentYearPrefix = `${now.getFullYear()}-`;
  const monthsInCurrentYear = availableMonthKeys.filter((key) =>
    key.startsWith(currentYearPrefix),
  );
  if (monthsInCurrentYear.length > 0) {
    return monthsInCurrentYear[monthsInCurrentYear.length - 1] ?? null;
  }

  return availableMonthKeys[availableMonthKeys.length - 1] ?? null;
};

const getQuarterNumber = (date: Date) => Math.floor(date.getMonth() / 3) + 1;

const toQuarterKey = (date: Date) => `${date.getFullYear()}-Q${getQuarterNumber(date)}`;

const toQuarterStartDate = (date: Date) =>
  new Date(date.getFullYear(), (getQuarterNumber(date) - 1) * 3, 1);

const RATE_DATA_KEYS = new Set(["openRate", "clickRate", "submitRate"]);

export const formatPercent = (value: number | null) =>
  value === null ? "-" : `${Math.round(value)}%`;

export const formatCount = (value: number | null | undefined, locale?: string) =>
  Number(value ?? 0).toLocaleString(locale);

export const isRateDataKey = (dataKey: unknown): dataKey is "openRate" | "clickRate" | "submitRate" =>
  typeof dataKey === "string" && RATE_DATA_KEYS.has(dataKey);

export default function Dashboard() {
  const { locale, t } = useI18n();
  const intlLocale = getIntlLocale(locale);
  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });
  const toMonthLabel = (date: Date) =>
    new Intl.DateTimeFormat(intlLocale, {
      year: "numeric",
      month: "long",
    }).format(date);
  const toMonthOptionLabel = (date: Date) =>
    new Intl.DateTimeFormat(intlLocale, {
      month: "short",
    }).format(date);
  const toQuarterLabel = (date: Date) => {
    const quarterNumber = getQuarterNumber(date);
    if (locale === "en") {
      return `Q${quarterNumber} ${date.getFullYear()}`;
    }
    return locale === "ja"
      ? `${date.getFullYear()}年 第${quarterNumber}四半期`
      : `${date.getFullYear()}년 ${quarterNumber}분기`;
  };
  const formatProjectLabel = (name: string | null | undefined) =>
    name ?? t("무제 프로젝트");
  const formatSummaryCount = (value: number | null | undefined) =>
    formatCount(value, intlLocale);

  const projectsByQuarter = useMemo(() => {
    const map = new Map<string, Project[]>();
    projects.forEach((project) => {
      if (!project.startDate) return;
      const date = new Date(project.startDate);
      if (Number.isNaN(date.getTime())) return;
      const key = toQuarterKey(date);
      const list = map.get(key);
      if (list) {
        list.push(project);
      } else {
        map.set(key, [project]);
      }
    });
    return map;
  }, [intlLocale, projects]);

  const monthlySummaries = useMemo<MonthlySummary[]>(() => {
    if (!projects.length) return [];

    const map = new Map<string, MonthlySummary>();

    projects.forEach((project) => {
      if (!project.startDate) return;
      const date = new Date(project.startDate);
      if (Number.isNaN(date.getTime())) return;

      const key = toMonthKey(date);
      const existing = map.get(key);
      const summary =
        existing ??
        {
          key,
          monthDate: new Date(date.getFullYear(), date.getMonth(), 1),
          monthLabel: toMonthLabel(date),
          targetCount: 0,
          openCount: 0,
          clickCount: 0,
          submitCount: 0,
          openRate: null,
          clickRate: null,
          submitRate: null,
        };

      summary.targetCount += project.targetCount ?? 0;
      summary.openCount += project.openCount ?? 0;
      summary.clickCount += project.clickCount ?? 0;
      summary.submitCount += project.submitCount ?? 0;

      map.set(key, summary);
    });

    return Array.from(map.values())
      .map((summary) => {
        const { targetCount, openCount, clickCount, submitCount } = summary;
        const safeRate = (count: number) =>
          targetCount > 0 ? (count / targetCount) * 100 : null;

        return {
          ...summary,
          openRate: safeRate(openCount),
          clickRate: safeRate(clickCount),
          submitRate: safeRate(submitCount),
        };
      })
      .sort((a, b) => b.monthDate.getTime() - a.monthDate.getTime());
  }, [locale, projects]);

  const quarterlySummaries = useMemo<QuarterlySummary[]>(() => {
    if (!projects.length) return [];

    const map = new Map<string, QuarterlySummary>();

    projects.forEach((project) => {
      if (!project.startDate) return;
      const date = new Date(project.startDate);
      if (Number.isNaN(date.getTime())) return;

      const key = toQuarterKey(date);
      const existing = map.get(key);
      const summary =
        existing ??
        {
          key,
          quarterLabel: toQuarterLabel(date),
          quarterDate: toQuarterStartDate(date),
          targetCount: 0,
          openCount: 0,
          clickCount: 0,
          submitCount: 0,
          openRate: null,
          clickRate: null,
          submitRate: null,
        };

      summary.targetCount += project.targetCount ?? 0;
      summary.openCount += project.openCount ?? 0;
      summary.clickCount += project.clickCount ?? 0;
      summary.submitCount += project.submitCount ?? 0;

      map.set(key, summary);
    });

    return Array.from(map.values())
      .map((summary) => {
        const safeRate = (count: number) =>
          summary.targetCount > 0 ? (count / summary.targetCount) * 100 : null;

        return {
          ...summary,
          openRate: safeRate(summary.openCount),
          clickRate: safeRate(summary.clickCount),
          submitRate: safeRate(summary.submitCount),
        };
      })
      .sort((a, b) => b.quarterDate.getTime() - a.quarterDate.getTime());
  }, [projects]);

  const quartersByYear = useMemo(() => {
    const baseMap = new Map<number, Set<number>>();
    quarterlySummaries.forEach((summary) => {
      const year = summary.quarterDate.getFullYear();
      const quarter = getQuarterNumber(summary.quarterDate);
      if (!baseMap.has(year)) {
        baseMap.set(year, new Set());
      }
      baseMap.get(year)!.add(quarter);
    });
    const normalized = new Map<number, number[]>();
    baseMap.forEach((set, year) => {
      normalized.set(
        year,
        Array.from(set.values()).sort((a, b) => b - a),
      );
    });
    return normalized;
  }, [quarterlySummaries]);

  const yearOptions = useMemo(
    () =>
      Array.from(quartersByYear.keys())
        .sort((a, b) => b - a)
        .map((year) => ({
          value: String(year),
          label:
            locale === "en"
              ? String(year)
              : locale === "ja"
                ? `${year}年`
                : `${year}년`,
        })),
    [locale, quartersByYear],
  );

  const monthYearMap = useMemo(() => {
    const map = new Map<number, { key: string; value: string; label: string; monthNumber: number }[]>();
    monthlySummaries.forEach((summary) => {
      const year = summary.monthDate.getFullYear();
      const list = map.get(year) ?? [];
      const monthValue = String(summary.monthDate.getMonth() + 1).padStart(2, "0");
      list.push({
        key: summary.key,
        value: monthValue,
        label: toMonthOptionLabel(summary.monthDate),
        monthNumber: summary.monthDate.getMonth() + 1,
      });
      map.set(
        year,
        list.sort((a, b) => a.monthNumber - b.monthNumber),
      );
    });
    return map;
  }, [intlLocale, monthlySummaries]);

  const availableMonthKeys = useMemo(
    () =>
      [...monthlySummaries]
        .sort((a, b) => a.monthDate.getTime() - b.monthDate.getTime())
        .map((summary) => summary.key),
    [monthlySummaries],
  );

  const monthYearOptions = useMemo(
    () =>
      Array.from(monthYearMap.keys())
        .sort((a, b) => b - a)
        .map((year) => ({
          value: String(year),
          label:
            locale === "en"
              ? String(year)
              : locale === "ja"
                ? `${year}年`
                : `${year}년`,
        })),
    [locale, monthYearMap],
  );

  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(() => {
    return getInitialMonthKey(availableMonthKeys, new Date());
  });
  const selectedMonthYear = selectedMonthKey ? getMonthParts(selectedMonthKey).year : null;
  const monthOptions = useMemo(() => {
    if (!selectedMonthYear) return [];
    return monthYearMap.get(Number(selectedMonthYear)) ?? [];
  }, [monthYearMap, selectedMonthYear]);
  const selectedMonthNumber = selectedMonthKey ? getMonthParts(selectedMonthKey).month : null;
  const currentMonthIndex = selectedMonthKey ? availableMonthKeys.indexOf(selectedMonthKey) : -1;

  const [selectedYear, setSelectedYear] = useState<string | null>(() =>
    yearOptions.length > 0 ? yearOptions[0].value : null,
  );

  const [selectedQuarterNumber, setSelectedQuarterNumber] = useState<string | null>(() => {
    if (!yearOptions.length) return null;
    const initialYear = Number(yearOptions[0].value);
    const quarters = quartersByYear.get(initialYear) ?? [];
    return quarters.length > 0 ? String(quarters[0]) : null;
  });

  const quarterOptions = useMemo(() => {
    if (!selectedYear) return [];
    const quarters = quartersByYear.get(Number(selectedYear)) ?? [];
    return quarters.map((quarter) => ({
      value: String(quarter),
      label:
        locale === "en"
          ? `Q${quarter}`
          : locale === "ja"
            ? `第${quarter}四半期`
            : `${quarter}분기`,
    }));
  }, [locale, quartersByYear, selectedYear]);

  useEffect(() => {
    if (!availableMonthKeys.length) {
      setSelectedMonthKey(null);
      return;
    }

    if (!selectedMonthKey) {
      setSelectedMonthKey(getInitialMonthKey(availableMonthKeys, new Date()));
      return;
    }

    if (!availableMonthKeys.includes(selectedMonthKey)) {
      const selectedYear = getMonthParts(selectedMonthKey).year;
      const fallbackInSameYear = availableMonthKeys.filter((key) =>
        key.startsWith(`${selectedYear}-`),
      );
      setSelectedMonthKey(
        fallbackInSameYear[fallbackInSameYear.length - 1] ??
          availableMonthKeys[availableMonthKeys.length - 1] ??
          null,
      );
    }
  }, [availableMonthKeys, selectedMonthKey]);

  useEffect(() => {
    if (!yearOptions.length) {
      setSelectedYear(null);
      return;
    }

    if (!selectedYear || !yearOptions.some((option) => option.value === selectedYear)) {
      setSelectedYear(yearOptions[0].value);
    }
  }, [yearOptions, selectedYear]);

  useEffect(() => {
    if (!selectedYear) {
      setSelectedQuarterNumber(null);
      return;
    }

    const quarters = quartersByYear.get(Number(selectedYear)) ?? [];
    if (!quarters.length) {
      setSelectedQuarterNumber(null);
      return;
    }

    if (
      !selectedQuarterNumber ||
      !quarters.includes(Number(selectedQuarterNumber))
    ) {
      setSelectedQuarterNumber(String(quarters[0]));
    }
  }, [quartersByYear, selectedYear, selectedQuarterNumber]);

  const selectedSummary =
    monthlySummaries.find((summary) => summary.key === selectedMonthKey) ??
    monthlySummaries[0];

  const selectedQuarterKey =
    selectedYear && selectedQuarterNumber ? `${selectedYear}-Q${selectedQuarterNumber}` : null;

  const selectedQuarterProjects = useMemo(() => {
    if (!selectedQuarterKey) return [];
    const list = projectsByQuarter.get(selectedQuarterKey);
    if (!list) return [];
    return [...list].sort((a, b) => {
      const dateA = a.startDate ? new Date(a.startDate).getTime() : 0;
      const dateB = b.startDate ? new Date(b.startDate).getTime() : 0;
      if (dateA !== dateB) {
        return dateA - dateB;
      }
      const nameA = a.name ?? "";
      const nameB = b.name ?? "";
      return nameA.localeCompare(nameB, intlLocale);
    });
  }, [intlLocale, projectsByQuarter, selectedQuarterKey]);

  const quarterComparisonData = useMemo<QuarterComparisonItem[]>(() => {
    if (!selectedQuarterProjects.length) return [];
    return selectedQuarterProjects.map((project, index) => {
      const targetCount = project.targetCount ?? 0;
      const rate = (count: number | null | undefined) =>
        targetCount > 0 && count ? (count / targetCount) * 100 : 0;
      return {
        index: index + 1,
        projectName: formatProjectLabel(project.name),
        targetCount,
        openRate: rate(project.openCount),
        clickRate: rate(project.clickCount),
        submitRate: rate(project.submitCount),
      };
    });
  }, [selectedQuarterProjects, t]);

  const maxQuarterTarget = useMemo(() => {
    if (!quarterComparisonData.length) return 0;
    return quarterComparisonData.reduce((max, item) => Math.max(max, item.targetCount), 0);
  }, [quarterComparisonData]);

  const handleYearChange = (year: string) => {
    const nextMonths = monthYearMap.get(Number(year)) ?? [];
    if (!nextMonths.length) return;

    const sameMonth = selectedMonthNumber
      ? nextMonths.find((option) => option.value === selectedMonthNumber)
      : null;

    setSelectedMonthKey((sameMonth ?? nextMonths[nextMonths.length - 1]).key);
  };

  const handleMonthChange = (month: string) => {
    if (!selectedMonthYear) return;
    setSelectedMonthKey(`${selectedMonthYear}-${month}`);
  };

  const handlePrevMonth = () => {
    if (currentMonthIndex <= 0) return;
    setSelectedMonthKey(availableMonthKeys[currentMonthIndex - 1] ?? null);
  };

  const handleNextMonth = () => {
    if (currentMonthIndex < 0 || currentMonthIndex >= availableMonthKeys.length - 1) return;
    setSelectedMonthKey(availableMonthKeys[currentMonthIndex + 1] ?? null);
  };

  if (!isLoading && projects.length === 0) {
    return (
      <div className="p-6 space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold mb-2">{t("대시보드")}</h1>
            <p className="text-sm text-muted-foreground">
              {t(
                "첫 훈련을 아직 시작하지 않았습니다. AI로 메일을 만들고 실제 메일을 직접 받아보며 집계까지 확인해 보세요.",
              )}
            </p>
          </div>
          <Link href="/projects/new">
            <Button data-testid="button-new-project">
              <Plus className="mr-2 h-4 w-4" />
              {t("새 프로젝트")}
            </Button>
          </Link>
        </div>

        <Card className="overflow-hidden border-sky-200 bg-gradient-to-br from-sky-50 via-white to-cyan-50 p-0 text-slate-950">
          <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="space-y-4">
              <Badge variant="outline" className="border-sky-300 text-sky-700">
                {t("추천 시작 경로")}
              </Badge>
              <div className="space-y-2">
                <h2 className="text-3xl font-bold tracking-tight text-slate-950">
                  {t("첫 피싱 시뮬레이션 체험")}
                </h2>
                <p className="max-w-2xl text-sm text-slate-600">
                  {t(
                    "AI로 피싱 메일과 훈련 안내 페이지를 생성한 뒤, 내 이메일로 실제 프로젝트를 발송하고 오픈, 클릭, 제출 집계를 프로젝트 상세에서 직접 확인할 수 있습니다.",
                  )}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link href="/projects/experience">
                  <Button size="lg" className="bg-slate-950 text-white hover:bg-slate-800">
                    {t("체험 시작하기")}
                  </Button>
                </Link>
                <Link href="/admin/smtp">
                  <Button
                    size="lg"
                    variant="outline"
                    className="border-slate-300 bg-white text-slate-900 hover:bg-slate-100"
                  >
                    {t("발송 설정 열기")}
                  </Button>
                </Link>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-900/10 bg-slate-950 p-5 text-white shadow-sm">
              <p className="text-sm font-semibold text-sky-100">{t("체험 순서")}</p>
              <ol className="mt-3 space-y-3 text-sm text-slate-100">
                <li>{t("1. AI로 피싱 메일 생성")}</li>
                <li>{t("2. AI로 훈련 안내 페이지 생성")}</li>
                <li>{t("3. SMTP 연결 확인")}</li>
                <li>{t("4. 내 메일로 실제 발송")}</li>
                <li>{t("5. 프로젝트 상세에서 이벤트 확인")}</li>
              </ol>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold mb-2">{t("대시보드")}</h1>
        </div>
        <Link href="/projects/new">
          <Button data-testid="button-new-project">
            <Plus className="mr-2 h-4 w-4" />
            {t("새 프로젝트")}
          </Button>
        </Link>
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-2xl font-semibold">{t("월간 훈련 현황")}</h2>
          {monthYearOptions.length > 0 && (
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 disabled:opacity-30"
                disabled={currentMonthIndex <= 0}
                onClick={handlePrevMonth}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Select
                value={selectedMonthYear ?? undefined}
                onValueChange={handleYearChange}
              >
                <SelectTrigger className="w-[100px]" data-testid="select-dashboard-month-year">
                  <SelectValue placeholder={t("연도 선택")} />
                </SelectTrigger>
                <SelectContent>
                  {monthYearOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={selectedMonthNumber ?? undefined}
                onValueChange={handleMonthChange}
                disabled={monthOptions.length === 0}
              >
                <SelectTrigger className="w-[85px]" data-testid="select-dashboard-month">
                  <SelectValue placeholder={t("월 선택")} />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((option) => (
                    <SelectItem key={option.key} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 disabled:opacity-30"
                disabled={currentMonthIndex < 0 || currentMonthIndex >= availableMonthKeys.length - 1}
                onClick={handleNextMonth}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-32 rounded-lg" />
            ))
          ) : selectedSummary ? (
            <>
              <StatCard
                title={t("발송 수")}
                value={formatSummaryCount(selectedSummary.targetCount)}
                icon={Users}
                description={
                  locale === "en"
                    ? `${selectedSummary.monthLabel}`
                    : locale === "ja"
                      ? `${selectedSummary.monthLabel}時点`
                      : `${selectedSummary.monthLabel} 기준`
                }
              />
              <StatCard
                title={t("오픈율")}
                value={formatPercent(selectedSummary.openRate)}
                icon={BarChart3}
                description={
                  locale === "en"
                    ? `${formatSummaryCount(selectedSummary.openCount)} opened`
                    : locale === "ja"
                      ? `${formatSummaryCount(selectedSummary.openCount)}名 開封`
                      : `${formatSummaryCount(selectedSummary.openCount)}명 오픈`
                }
              />
              <StatCard
                title={t("클릭율")}
                value={formatPercent(selectedSummary.clickRate)}
                icon={TrendingUp}
                description={
                  locale === "en"
                    ? `${formatSummaryCount(selectedSummary.clickCount)} clicked`
                    : locale === "ja"
                      ? `${formatSummaryCount(selectedSummary.clickCount)}名 クリック`
                      : `${formatSummaryCount(selectedSummary.clickCount)}명 클릭`
                }
              />
              <StatCard
                title={t("제출율")}
                value={formatPercent(selectedSummary.submitRate)}
                icon={Shield}
                description={
                  locale === "en"
                    ? `${formatSummaryCount(selectedSummary.submitCount)} submitted`
                    : locale === "ja"
                      ? `${formatSummaryCount(selectedSummary.submitCount)}名 提出`
                      : `${formatSummaryCount(selectedSummary.submitCount)}명 제출`
                }
              />
            </>
          ) : (
            <Card className="col-span-full p-6 text-center text-muted-foreground">
              {t("통계 데이터를 불러올 수 없습니다.")}
            </Card>
          )}
        </div>
      </div>

      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-semibold flex items-center gap-2">
              <LineChart className="w-5 h-5 text-primary" />
              {t("모의훈련 현황 비교")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t("연도와 분기를 선택해 해당 기간의 프로젝트 성과를 비교하세요.")}
            </p>
            <p className="text-xs text-muted-foreground">
              {selectedQuarterKey
                ? locale === "en"
                  ? `${selectedYear ?? "-"} Q${selectedQuarterNumber ?? "-"} · ${formatSummaryCount(selectedQuarterProjects.length)} projects`
                  : locale === "ja"
                    ? `${selectedYear ?? "-"}年 第${selectedQuarterNumber ?? "-"}四半期 合計${formatSummaryCount(selectedQuarterProjects.length)}件`
                    : `${selectedYear ?? "-"}년 ${selectedQuarterNumber ?? "-"}분기 총 ${formatSummaryCount(selectedQuarterProjects.length)}개 프로젝트`
                : t("선택 가능한 분기가 없습니다.")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {yearOptions.length > 0 && (
              <Select
                value={selectedYear ?? undefined}
                onValueChange={(value) => setSelectedYear(value)}
              >
                <SelectTrigger className="w-[160px]" data-testid="select-dashboard-year">
                  <SelectValue placeholder={t("연도 선택")} />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {quarterOptions.length > 0 && (
              <Select
                value={selectedQuarterNumber ?? undefined}
                onValueChange={(value) => setSelectedQuarterNumber(value)}
              >
                <SelectTrigger className="w-[150px]" data-testid="select-dashboard-quarter">
                  <SelectValue placeholder={t("분기 선택")} />
                </SelectTrigger>
                <SelectContent>
                  {quarterOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
        <div className="h-[360px]">
          {isLoading ? (
            <Skeleton className="h-full w-full rounded-md" />
          ) : quarterComparisonData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={quarterComparisonData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="index"
                  stroke="hsl(var(--muted-foreground))"
                  axisLine={false}
                  tickLine={false}
                  tick={false}
                />
                <YAxis
                  yAxisId="count"
                  stroke="hsl(var(--muted-foreground))"
                  tickFormatter={(value) => formatCount(Number(value), intlLocale)}
                  width={60}
                  domain={[0, Math.max(maxQuarterTarget, 10)]}
                />
                <YAxis
                  yAxisId="rate"
                  orientation="right"
                  domain={[0, 100]}
                  stroke="hsl(var(--muted-foreground))"
                  tickFormatter={(value) => formatPercent(Number(value))}
                  width={60}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "0.5rem",
                  }}
                  labelFormatter={(value) => {
                    const entry = quarterComparisonData.find((item) => item.index === value);
                    return entry?.projectName ?? "";
                  }}
                  formatter={(value, name, item) => {
                    const label = String(name);
                    if (isRateDataKey(item?.dataKey)) {
                      return [formatPercent(Number(value)), label];
                    }
                    return [formatCount(Number(value), intlLocale), label];
                  }}
                />
                <Legend />
                <Bar
                  yAxisId="count"
                  dataKey="targetCount"
                  name={t("발송 수")}
                  fill="hsl(var(--primary))"
                  radius={[4, 4, 0, 0]}
                />
                <Line
                  yAxisId="rate"
                  type="linear"
                  dataKey="openRate"
                  name={t("오픈율")}
                  stroke="hsl(var(--chart-2))"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
                <Line
                  yAxisId="rate"
                  type="linear"
                  dataKey="clickRate"
                  name={t("클릭율")}
                  stroke="hsl(var(--chart-3))"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
                <Line
                  yAxisId="rate"
                  type="linear"
                  dataKey="submitRate"
                  name={t("제출율")}
                  stroke="hsl(var(--chart-4))"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {t("선택한 분기에 비교할 프로젝트가 없습니다.")}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
