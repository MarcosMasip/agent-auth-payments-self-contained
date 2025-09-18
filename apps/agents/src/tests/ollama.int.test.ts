import { graph } from '../../src/graph.js';

const localMode = process.env.LOCAL_MODE === 'true';

describe('Ollama Integration (auto-detect)', () => {
  (localMode ? it : it.skip)('invokes graph (Ollama if available, else mock)', async () => {
    const res = await graph.invoke({ messages: [{ role: 'user', content: 'Hello' }] });
    const last = res.messages[res.messages.length - 1];
    expect(last).toBeTruthy();
    // Optional: ensure credit estimate metadata exists in local mode
    if (localMode) {
      expect((last as any)._local_credit_estimate).toBeDefined();
    }
  });
});
