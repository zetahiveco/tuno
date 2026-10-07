import { format } from "date-fns";


export function getUniqueFileName(name: string) {
    const pid = process.pid.toString();
    const timestamp = format(new Date(), 'yyMMdd_HHmmss');
    let filename = [pid, timestamp, name].join('_');
    filename = filename.split(' ').join('_').toLowerCase();
    return filename;
}

/** `{workflowId}_workflow_code_{version}_{dd_mm_yyyy_hh_mm}` */
export function workflowCodeFileName(version: number, workflowId: string, at: Date = new Date()) {
    const stamp = format(at, "dd_MM_yyyy_HH_mm")
    return `${workflowId}_workflow_code_${version}_${stamp}`
}
