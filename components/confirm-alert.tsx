import * as React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type ConfirmAlertOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
};

const DESTRUCTIVE_CLASSES = "bg-[#a12312] text-white hover:bg-[#8a1d0f]";

export function ConfirmAlertDialog({
  busy = false,
  cancelLabel = "Cancel",
  confirmLabel = "Delete",
  description,
  onConfirm,
  onOpenChange,
  open,
  title,
}: ConfirmAlertOptions & {
  busy?: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? <AlertDialogDescription>{description}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction className={DESTRUCTIVE_CLASSES} disabled={busy} onClick={onConfirm}>
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Imperative confirmation built on the shadcn AlertDialog.
 *
 * const { confirm, element } = useConfirm();
 * if (!(await confirm({ title: `Delete "${name}"?` }))) return;
 * // ...perform delete
 * return <>{element}</> somewhere in the tree.
 */
export function useConfirm() {
  const [options, setOptions] = React.useState<ConfirmAlertOptions | null>(null);
  const resolverRef = React.useRef<((confirmed: boolean) => void) | null>(null);

  const confirm = React.useCallback((nextOptions: ConfirmAlertOptions) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current?.(false);
      resolverRef.current = resolve;
      setOptions(nextOptions);
    });
  }, []);

  const settle = React.useCallback((confirmed: boolean) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setOptions(null);
    resolve?.(confirmed);
  }, []);

  const element = (
    <ConfirmAlertDialog
      description={options?.description}
      onConfirm={() => settle(true)}
      onOpenChange={(open) => {
        if (!open) settle(false);
      }}
      open={Boolean(options)}
      title={options?.title ?? ""}
    />
  );

  return { confirm, element };
}