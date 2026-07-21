const originalFetch = window.fetch.bind(window);
window.fetch = async (...args) => {
  const url = String(args[0]);
  try {
    const response = await originalFetch(...args);
    if (url.includes('overpass-api.de') && !response.ok) return { ok: true, json: async () => ({ elements: [] }) };
    return response;
  } catch (error) {
    if (url.includes('overpass-api.de')) return { ok: true, json: async () => ({ elements: [] }) };
    throw error;
  }
};
