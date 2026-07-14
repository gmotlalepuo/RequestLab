import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiRequest, Collection, Folder, Workspace } from '../types';
import { Repository } from './repository';

const KEYS = {
  workspaces: 'pm.workspaces',
  collections: 'pm.collections',
  folders: 'pm.folders',
  requests: 'pm.requests',
};

async function readAll<T>(key: string): Promise<T[]> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) {
    return [];
  }
  try {
    return JSON.parse(raw) as T[];
  } catch {
    return [];
  }
}

async function writeAll<T>(key: string, items: T[]): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(items));
}

export class LocalRepository implements Repository {
  async listWorkspaces(): Promise<Workspace[]> {
    const items = await readAll<Workspace>(KEYS.workspaces);
    return items.sort((a, b) => a.name.localeCompare(b.name));
  }

  async createWorkspace(workspace: Workspace): Promise<void> {
    const items = await readAll<Workspace>(KEYS.workspaces);
    items.push(workspace);
    await writeAll(KEYS.workspaces, items);
  }

  async updateWorkspace(workspace: Workspace): Promise<void> {
    const items = await readAll<Workspace>(KEYS.workspaces);
    await writeAll(
      KEYS.workspaces,
      items.map((w) => (w.id === workspace.id ? workspace : w)),
    );
  }

  async deleteWorkspace(id: string): Promise<void> {
    const workspaces = await readAll<Workspace>(KEYS.workspaces);
    await writeAll(
      KEYS.workspaces,
      workspaces.filter((w) => w.id !== id),
    );
    const collections = await readAll<Collection>(KEYS.collections);
    const doomedCollections = collections.filter((c) => c.workspaceId === id);
    for (const collection of doomedCollections) {
      await this.deleteCollection(collection.id);
    }
  }

  async listCollections(workspaceId: string): Promise<Collection[]> {
    const items = await readAll<Collection>(KEYS.collections);
    return items
      .filter((c) => c.workspaceId === workspaceId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async createCollection(collection: Collection): Promise<void> {
    const items = await readAll<Collection>(KEYS.collections);
    items.push(collection);
    await writeAll(KEYS.collections, items);
  }

  async updateCollection(collection: Collection): Promise<void> {
    const items = await readAll<Collection>(KEYS.collections);
    await writeAll(
      KEYS.collections,
      items.map((c) => (c.id === collection.id ? collection : c)),
    );
  }

  async deleteCollection(id: string): Promise<void> {
    const collections = await readAll<Collection>(KEYS.collections);
    await writeAll(
      KEYS.collections,
      collections.filter((c) => c.id !== id),
    );
    const folders = await readAll<Folder>(KEYS.folders);
    await writeAll(
      KEYS.folders,
      folders.filter((f) => f.collectionId !== id),
    );
    const requests = await readAll<ApiRequest>(KEYS.requests);
    await writeAll(
      KEYS.requests,
      requests.filter((r) => r.collectionId !== id),
    );
  }

  async listFolders(collectionId: string): Promise<Folder[]> {
    const items = await readAll<Folder>(KEYS.folders);
    return items
      .filter((f) => f.collectionId === collectionId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async createFolder(folder: Folder): Promise<void> {
    const items = await readAll<Folder>(KEYS.folders);
    items.push(folder);
    await writeAll(KEYS.folders, items);
  }

  async updateFolder(folder: Folder): Promise<void> {
    const items = await readAll<Folder>(KEYS.folders);
    await writeAll(
      KEYS.folders,
      items.map((f) => (f.id === folder.id ? folder : f)),
    );
  }

  async deleteFolder(id: string): Promise<void> {
    const folders = await readAll<Folder>(KEYS.folders);
    const childFolders = folders.filter((f) => f.parentFolderId === id);
    await writeAll(
      KEYS.folders,
      folders.filter((f) => f.id !== id),
    );
    const requests = await readAll<ApiRequest>(KEYS.requests);
    await writeAll(
      KEYS.requests,
      requests.filter((r) => r.folderId !== id),
    );
    for (const child of childFolders) {
      await this.deleteFolder(child.id);
    }
  }

  async listRequests(collectionId: string): Promise<ApiRequest[]> {
    const items = await readAll<ApiRequest>(KEYS.requests);
    return items
      .filter((r) => r.collectionId === collectionId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async getRequest(id: string): Promise<ApiRequest | null> {
    const items = await readAll<ApiRequest>(KEYS.requests);
    return items.find((r) => r.id === id) ?? null;
  }

  async createRequest(request: ApiRequest): Promise<void> {
    const items = await readAll<ApiRequest>(KEYS.requests);
    items.push(request);
    await writeAll(KEYS.requests, items);
  }

  async updateRequest(request: ApiRequest): Promise<void> {
    const items = await readAll<ApiRequest>(KEYS.requests);
    await writeAll(
      KEYS.requests,
      items.map((r) => (r.id === request.id ? request : r)),
    );
  }

  async deleteRequest(id: string): Promise<void> {
    const items = await readAll<ApiRequest>(KEYS.requests);
    await writeAll(
      KEYS.requests,
      items.filter((r) => r.id !== id),
    );
  }
}
