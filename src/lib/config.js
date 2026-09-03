// Gate on coach self-signup. This is a deterrent, not real security — this
// repo is public, so anyone determined enough can read this value in the
// source. It stops a casual visitor from tapping "Coach" and creating an
// account; it does not replace real auth. Change it any time (ask to have
// it updated, or edit this file directly) and redeploy.
export const COACH_SETUP_CODE = "MPTCOACH26";
