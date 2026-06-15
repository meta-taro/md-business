/**
 * chrome.storage.session key under which the popup stashes the Markdown payload
 * before opening the viewer tab.
 */
export const STORAGE_KEY = 'mdb:viewer:payload';

export interface ViewerPayload {
  source: string;
  filename?: string;
  pluginId?: string;
}
