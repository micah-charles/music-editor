export interface FeatureFlags {
  aiAnalysis: boolean;
  omrImport: boolean;
}

export const defaultFeatureFlags: FeatureFlags = {
  aiAnalysis: false,
  omrImport: true
};
