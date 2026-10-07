import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
} from "@/components/ui/combobox";
import { timezoneCity, timezoneGroups, timezoneLabel, timezoneMatches, timezoneOffset, type TimezoneGroup } from "@/lib/timezones";

export function TimezoneSelector({
  invalid = false,
  onBlur,
  onChange,
  value,
}: {
  invalid?: boolean;
  onBlur?: () => void;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <Combobox
      items={timezoneGroups}
      value={value || null}
      onValueChange={(next) => onChange(next ?? "")}
      itemToStringLabel={(timeZone) => timezoneLabel(timeZone)}
      filter={(timeZone, query) => timezoneMatches(timeZone, query)}
      autoHighlight
    >
      <ComboboxInput
        aria-invalid={invalid || undefined}
        className="h-10 w-full border-[#e9e6ed] shadow-none"
        placeholder="Search time zones"
        onBlur={onBlur}
      />
      <ComboboxContent className="min-w-(--anchor-width)">
        <ComboboxEmpty>No time zones found.</ComboboxEmpty>
        <ComboboxList>
          {(group: TimezoneGroup) => (
            <ComboboxGroup className="pb-1" items={group.items} key={group.value}>
              <ComboboxLabel className="text-[10px] font-semibold tracking-[0.12em] uppercase">{group.value}</ComboboxLabel>
              <ComboboxCollection>
                {(timeZone: string) => (
                  <ComboboxItem key={timeZone} value={timeZone}>
                    <span className="truncate">{timezoneCity(timeZone)}</span>
                    <span className="ml-auto shrink-0 text-[10px] font-normal text-[#968d9a]">{timezoneOffset(timeZone)}</span>
                  </ComboboxItem>
                )}
              </ComboboxCollection>
            </ComboboxGroup>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
