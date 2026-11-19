/**
 * Host half of dsh-workspace-style.
 *
 * The bundle exists so the Loader has a host entry whose package manifest
 * publishes the Client module graph; every workspace-style behavior lives in
 * `client.js`. There is no Host state, no Remote method, and no model input.
 */
export function apply() {}
