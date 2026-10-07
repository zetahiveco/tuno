import * as React from "react"
import { format, isValid, parse } from "date-fns"
import { CalendarIcon, XIcon } from "lucide-react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

type DateTimePickerMode = "date" | "datetime"

function toDate(value: string | undefined, mode: DateTimePickerMode): Date | undefined {
  if (!value) return undefined
  const parsed = mode === "datetime" ? new Date(value) : parse(value, "yyyy-MM-dd", new Date())
  if (isValid(parsed)) return parsed
  const fallback = new Date(value)
  return isValid(fallback) ? fallback : undefined
}

/**
 * shadcn-style date(time) picker — a popover with a calendar (and optional
 * time input) that replaces the native HTML date picker.
 *
 * Value contract:
 * - mode "date" (default): `yyyy-MM-dd` strings, `""` when empty
 * - mode "datetime": `yyyy-MM-ddTHH:mm` strings, `""` when empty
 */
function DateTimePicker({
  ariaLabel,
  className,
  disabled,
  mode = "date",
  onChange,
  placeholder = "Pick a date",
  value,
}: {
  ariaLabel?: string
  className?: string
  disabled?: boolean
  mode?: DateTimePickerMode
  onChange?: (value: string) => void
  placeholder?: string
  value?: string
}) {
  const [open, setOpen] = React.useState(false)
  const selected = toDate(value, mode)

  function emit(date: Date) {
    if (!onChange) return
    onChange(mode === "datetime" ? format(date, "yyyy-MM-dd'T'HH:mm") : format(date, "yyyy-MM-dd"))
  }

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild disabled={disabled}>
        <Button
          aria-label={ariaLabel}
          className={cn(
            "w-full justify-between border-input bg-transparent px-3 text-foreground font-normal shadow-none hover:bg-transparent data-[state=open]:bg-transparent",
            !selected && "text-muted-foreground",
            className,
          )}
          data-empty={!selected}
          size="sm"
          variant="outline"
        >
          <span className="truncate">{selected ? format(selected, mode === "datetime" ? "MMM d, yyyy — HH:mm" : "MMM d, yyyy") : placeholder}</span>
          {selected ? (
            <span
              aria-label="Clear date"
              className="-mr-1 grid size-5 shrink-0 place-items-center rounded-sm text-muted-foreground transition hover:bg-accent hover:text-foreground"
              onClick={(event) => {
                event.stopPropagation()
                onChange?.("")
              }}
              onPointerDown={(event) => event.stopPropagation()}
              role="button"
              tabIndex={-1}
            >
              <XIcon className="size-3.5" />
            </span>
          ) : null}
          <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          captionLayout="dropdown"
          mode="single"
          onSelect={(date) => {
            if (!date) return
            emit(date)
            if (mode === "date") setOpen(false)
          }}
          selected={selected}
        />
        {mode === "datetime" ? (
          <div className="flex items-center gap-2 border-t px-3 py-2.5">
            <Input
              className="h-8 w-fit border-input text-xs"
              onChange={(event) => {
                if (!selected) return
                const [hours = 0, minutes = 0] = event.target.value.split(":").map(Number)
                if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return
                const next = new Date(selected)
                next.setHours(hours, minutes, 0, 0)
                emit(next)
              }}
              type="time"
              value={selected ? format(selected, "HH:mm") : "09:00"}
            />
            <Button
              className="h-8 px-3 text-xs"
              disabled={!selected}
              onClick={() => {
                setOpen(false)
              }}
              type="button"
            >
              Done
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

export { DateTimePicker }
