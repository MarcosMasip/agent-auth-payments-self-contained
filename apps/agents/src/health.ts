import { getLocalModel } from './model-provider.js';

export async function getHealth() {
  const localMode = process.env.LOCAL_MODE === 'true';
  if (!localMode) {
    return { status: 'ok', localMode: false };
  }
  const { meta } = await getLocalModel();
  return { status: 'ok', localMode: true, model: meta.modelName, provider: meta.provider, degraded: meta.degraded, error: meta.error };
}
