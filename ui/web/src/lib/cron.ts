export function cronDescription(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return "Custom schedule";

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  const time = formatCronTime(hour, minute);
  const minuteText = formatCronMinute(minute);

  if (hour === "*" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*" && minuteText) {
    return `Every hour at minute ${minuteText}`;
  }

  if (time && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    return `Every day at ${time}`;
  }

  if (time && dayOfMonth === "*" && month === "*" && dayOfWeek === "1-5") {
    return `Weekdays at ${time}`;
  }

  const weekday = WEEKDAY_LABELS[dayOfWeek];
  if (time && dayOfMonth === "*" && month === "*" && weekday) {
    return `Every week on ${weekday} at ${time}`;
  }

  if (time && month === "*" && dayOfWeek === "*" && isNumberPart(dayOfMonth)) {
    return `Every month on day ${Number(dayOfMonth)} at ${time}`;
  }

  const dayMonth = formatCronDayMonth(dayOfMonth, month);
  if (time && dayOfWeek === "*" && dayMonth) {
    return `Once on ${dayMonth} at ${time}`;
  }

  if (time) {
    return `Custom schedule at ${time}`;
  }

  return "Custom schedule";
}

export function scheduleDescription(cron: string, timezone?: string): string {
  const timezoneText = timezoneDescription(timezone);
  return timezoneText ? `${cronDescription(cron)} · ${timezoneText}` : cronDescription(cron);
}

export function scheduleRuleLabel(cron?: string): string {
  const labels: Record<string, string> = {
    hourly: "Hourly",
    daily: "Daily",
    weekdays: "Weekdays",
    weekly: "Weekly",
    once: "Once",
    custom: "Custom",
  };
  return labels[getScheduleType(cron)] ?? labels.custom;
}

export function timezoneDescription(timezone?: string): string {
  if (!timezone) return "";
  if (timezone === "Asia/Ho_Chi_Minh") return "Vietnam time";
  return timezone.replaceAll("_", " ");
}

const WEEKDAY_LABELS: Record<string, string> = {
  "0": "Sunday",
  "7": "Sunday",
  "1": "Monday",
  "2": "Tuesday",
  "3": "Wednesday",
  "4": "Thursday",
  "5": "Friday",
  "6": "Saturday",
};

function isNumberPart(value: string): boolean {
  return /^\d+$/.test(value);
}

function formatCronTime(hour: string, minute: string): string | null {
  if (!isNumberPart(hour) || !isNumberPart(minute)) return null;
  const hourNumber = Number(hour);
  const minuteNumber = Number(minute);
  if (hourNumber < 0 || hourNumber > 23 || minuteNumber < 0 || minuteNumber > 59) return null;
  return `${String(hourNumber).padStart(2, "0")}:${String(minuteNumber).padStart(2, "0")}`;
}

function formatCronMinute(minute: string): string | null {
  if (!isNumberPart(minute)) return null;
  const minuteNumber = Number(minute);
  if (minuteNumber < 0 || minuteNumber > 59) return null;
  return String(minuteNumber).padStart(2, "0");
}

function formatCronDayMonth(dayOfMonth: string, month: string): string | null {
  if (!isNumberPart(dayOfMonth) || !isNumberPart(month)) return null;
  const dayNumber = Number(dayOfMonth);
  const monthNumber = Number(month);
  if (dayNumber < 1 || dayNumber > 31 || monthNumber < 1 || monthNumber > 12) return null;
  return `${String(dayNumber).padStart(2, "0")}/${String(monthNumber).padStart(2, "0")}`;
}

export function getScheduleType(cron?: string): string {
  if (!cron) return "hourly";
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return "custom";
  const [, hr, dom, mon, dow] = parts;

  if (hr === "*" && dom === "*" && mon === "*" && dow === "*") return "hourly";
  if (dom === "*" && mon === "*" && dow === "*") return "daily";
  if (dom === "*" && mon === "*" && dow === "1-5") return "weekdays";
  if (dom === "*" && mon === "*" && dow !== "*" && dow !== "1-5") return "weekly";
  if (isNumberPart(dom) && isNumberPart(mon) && dow === "*") return "once";
  return "custom";
}

export function parseTime(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return "09:00";
  const min = parts[0] === "*" ? "00" : parts[0].padStart(2, "0");
  const hr = parts[1] === "*" ? "09" : parts[1].padStart(2, "0");
  return `${hr}:${min}`;
}

export function parseOnceDate(cron: string): Date | undefined {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return undefined;
  const [min, hr, dom, mon] = parts;
  const d = new Date();
  const month = parseInt(mon, 10);
  const date = parseInt(dom, 10);
  const hours = parseInt(hr, 10);
  const minutes = parseInt(min, 10);
  if ([month, date, hours, minutes].some(Number.isNaN)) return undefined;
  d.setMonth(month - 1, date);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

export function parseMinute(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return "0";
  return parts[0] === "*" ? "0" : parts[0];
}

export function generateCron(type: string, timeOrMin: string): string {
  if (type === "hourly") {
    return `${timeOrMin || "0"} * * * *`;
  }
  const [hr, min] = timeOrMin.split(":");
  const h = hr ? parseInt(hr, 10).toString() : "0";
  const m = min ? parseInt(min, 10).toString() : "0";
  if (type === "daily") return `${m} ${h} * * *`;
  if (type === "weekdays") return `${m} ${h} * * 1-5`;
  if (type === "weekly") return `${m} ${h} * * 0`;
  return "0 0 * * *";
}
