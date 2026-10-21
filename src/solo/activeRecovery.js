// Recovery add-on sessions (coach-built, free kind:"recovery" products) are
// logged like any workout, under a per-customer "<uid>_recovery" purchase id
// so they never count toward a purchased program's own progress.
export function isRecoveryLog(log) {
  return typeof log?.purchaseId === "string" && log.purchaseId.endsWith("_recovery");
}
