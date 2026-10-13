// Bundled assets in two tiers: `critical` is awaited by the loading screen, `deferred` loads in the background.
// ADAPT: this game draws everything with code, so there is nothing to preload. Add { alias, src } entries here.
export interface AssetEntry {
    alias: string;
    src: string;
}
export const manifest: { critical: AssetEntry[]; deferred: AssetEntry[] } = {
    critical: [],
    deferred: [],
};
