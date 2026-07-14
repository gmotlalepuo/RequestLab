import {
  ApiRequest,
  Collection,
  Environment,
  Folder,
  Workspace,
  WorkspaceInvite,
  WorkspaceMember,
} from "../types";

export interface Repository {
  listWorkspaces(): Promise<Workspace[]>;
  createWorkspace(workspace: Workspace): Promise<void>;
  updateWorkspace(workspace: Workspace): Promise<void>;
  deleteWorkspace(id: string): Promise<void>;
  listPendingInvites(): Promise<WorkspaceInvite[]>;
  listWorkspaceInvites(workspaceId: string): Promise<WorkspaceInvite[]>;
  inviteToWorkspace(workspaceId: string, email: string): Promise<void>;
  respondToInvite(inviteId: string, accept: boolean): Promise<void>;
  revokeInvite(inviteId: string): Promise<void>;
  listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]>;
  removeWorkspaceMember(workspaceId: string, userId: string): Promise<void>;
  listEnvironments(collectionId: string): Promise<Environment[]>;
  createEnvironment(environment: Environment): Promise<void>;
  updateEnvironment(environment: Environment): Promise<void>;
  deleteEnvironment(id: string): Promise<void>;

  listCollections(workspaceId: string): Promise<Collection[]>;
  createCollection(collection: Collection): Promise<void>;
  updateCollection(collection: Collection): Promise<void>;
  deleteCollection(id: string): Promise<void>;

  listFolders(collectionId: string): Promise<Folder[]>;
  createFolder(folder: Folder): Promise<void>;
  updateFolder(folder: Folder): Promise<void>;
  deleteFolder(id: string): Promise<void>;

  listRequests(collectionId: string): Promise<ApiRequest[]>;
  getRequest(id: string): Promise<ApiRequest | null>;
  createRequest(request: ApiRequest): Promise<void>;
  updateRequest(request: ApiRequest): Promise<void>;
  deleteRequest(id: string): Promise<void>;
}
