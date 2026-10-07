export type TimezoneGroup = {
  value: string;
  items: string[];
};

const supportedTimezones = Intl.supportedValuesOf("timeZone");
const supportedTimezoneSet = new Set(supportedTimezones);

function searchable(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replaceAll("/", " ");
}

function regionOf(timeZone: string) {
  if (timeZone === "UTC") return "UTC";
  const region = timeZone.split("/")[0];
  return region && region !== timeZone ? region : "Other";
}

export function isSupportedTimezone(value: string) {
  return supportedTimezoneSet.has(value);
}

export function timezoneCity(timeZone: string) {
  const city = timeZone.split("/").at(-1) ?? timeZone;
  return city.replaceAll("_", " ");
}

export function timezoneOffset(timeZone: string, date = new Date()) {
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
  })
    .formatToParts(date)
    .find((part) => part.type === "timeZoneName")?.value;

  if (!label || label === "GMT") return "GMT+0";
  return label;
}

export function timezoneLabel(timeZone: string) {
  return `${timezoneCity(timeZone)} (${timezoneOffset(timeZone)})`;
}

export function timezoneMatches(timeZone: string, query: string) {
  const needle = searchable(query).trim();
  if (!needle) return true;
  const haystack = searchable(`${timeZone} ${timezoneCity(timeZone)} ${timezoneOffset(timeZone)}`);
  return needle.split(/\s+/).every((part) => haystack.includes(part));
}

export const timezoneGroups: TimezoneGroup[] = Object.entries(Object.groupBy(supportedTimezones, regionOf))
  .map(([value, items]) => ({
    value,
    items: [...(items ?? [])].sort((left, right) => timezoneCity(left).localeCompare(timezoneCity(right))),
  }))
  .sort((left, right) => {
    if (left.value === "UTC") return -1;
    if (right.value === "UTC") return 1;
    return left.value.localeCompare(right.value);
  });
