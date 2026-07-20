import { SupabaseClient } from "@supabase/supabase-js";
import {
  ApiRequest,
  Collection,
  Environment,
  Folder,
  Workspace,
  WorkspaceInvite,
  WorkspaceMember,
} from "../types";
import { Repository } from "./repository";

/** @see supabase/schema.sql for the matching table definitions */

type WorkspaceRow = {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
};

type WorkspaceOwnerRow = {
  workspace_id: string;
  email: string;
};

type WorkspaceInviteRow = {
  id: string;
  workspace_id: string;
  email: string;
  invited_by: string;
  status: WorkspaceInvite["status"];
  created_at: string;
  responded_at: string | null;
  workspace_name: string;
};

type WorkspaceMemberRow = {
  workspace_id: string;
  user_id: string;
  email: string;
  role: WorkspaceMember["role"];
  joined_at: string;
};

type EnvironmentRow = {
  id: string;
  workspace_id: string;
  collection_id: string;
  name: string;
  variables: Environment["variables"];
  created_at: string;
};

type CollectionRow = {
  id: string;
  workspace_id: string;
  created_by: string | null;
  name: string;
  description: string;
  created_at: string;
};

type FolderRow = {
  id: string;
  collection_id: string;
  parent_folder_id: string | null;
  name: string;
  description: string | null;
  is_starred: boolean;
  created_at: string;
};

type RequestRow = {
  id: string;
  collection_id: string;
  folder_id: string | null;
  name: string;
  documentation: string | null;
  method: string;
  url: string;
  params: ApiRequest["params"];
  headers: ApiRequest["headers"];
  body_mode: string;
  body_raw: string;
  body_form: ApiRequest["bodyForm"];
  auth: ApiRequest["auth"];
  created_at: string;
};

const toWorkspace = (row: WorkspaceRow): Workspace => ({
  id: row.id,
  ownerId: row.user_id,
  name: row.name,
  createdAt: row.created_at,
});

const toInvite = (row: WorkspaceInviteRow): WorkspaceInvite => ({
  id: row.id,
  workspaceId: row.workspace_id,
  workspaceName: row.workspace_name,
  email: row.email,
  invitedBy: row.invited_by,
  status: row.status,
  createdAt: row.created_at,
  respondedAt: row.responded_at,
});

const toMember = (row: WorkspaceMemberRow): WorkspaceMember => ({
  workspaceId: row.workspace_id,
  userId: row.user_id,
  email: row.email,
  role: row.role,
  joinedAt: row.joined_at,
});

const toEnvironment = (row: EnvironmentRow): Environment => ({
  id: row.id,
  workspaceId: row.workspace_id,
  collectionId: row.collection_id,
  name: row.name,
  variables: row.variables ?? [],
  createdAt: row.created_at,
});

const toCollection = (row: CollectionRow): Collection => ({
  id: row.id,
  workspaceId: row.workspace_id,
  createdBy: row.created_by,
  name: row.name,
  description: row.description ?? "",
  createdAt: row.created_at,
});

const toFolder = (row: FolderRow): Folder => ({
  id: row.id,
  collectionId: row.collection_id,
  parentFolderId: row.parent_folder_id,
  name: row.name,
  description: row.description ?? "",
  isStarred: row.is_starred ?? false,
  createdAt: row.created_at,
});

const toRequest = (row: RequestRow): ApiRequest => ({
  id: row.id,
  collectionId: row.collection_id,
  folderId: row.folder_id,
  name: row.name,
  documentation: row.documentation ?? "",
  method: row.method as ApiRequest["method"],
  url: row.url,
  params: row.params ?? [],
  headers: row.headers ?? [],
  bodyMode: (row.body_mode as ApiRequest["bodyMode"]) ?? "none",
  bodyRaw: row.body_raw ?? "",
  bodyForm: row.body_form ?? [],
  auth: row.auth ?? { type: "none" },
  createdAt: row.created_at,
});

const toRequestRow = (request: ApiRequest): Omit<RequestRow, "created_at"> => ({
  id: request.id,
  collection_id: request.collectionId,
  folder_id: request.folderId,
  name: request.name,
  documentation: request.documentation ?? "",
  method: request.method,
  url: request.url,
  params: request.params,
  headers: request.headers,
  body_mode: request.bodyMode,
  body_raw: request.bodyRaw,
  body_form: request.bodyForm,
  auth: request.auth,
});

export class SupabaseRepository implements Repository {
  constructor(private client: SupabaseClient) {}

  private throwIfError(error: { message: string } | null): void {
    if (error) {
      throw new Error(error.message);
    }
  }

  async listWorkspaces(): Promise<Workspace[]> {
    const [{ data, error }, { data: owners, error: ownersError }] = await Promise.all([
      this.client
      .from("postman_workspaces")
      .select("*")
      .order("name"),
      this.client
        .from("postman_workspace_members")
        .select("workspace_id,email")
        .eq("role", "owner"),
    ]);
    this.throwIfError(error);
    this.throwIfError(ownersError);
    const ownerByWorkspace = new Map(
      (owners as WorkspaceOwnerRow[]).map((owner) => [owner.workspace_id, owner.email]),
    );
    return (data as WorkspaceRow[]).map((row) => ({
      ...toWorkspace(row),
      ownerEmail: ownerByWorkspace.get(row.id) || undefined,
    }));
  }

  async createWorkspace(workspace: Workspace): Promise<void> {
    const { error } = await this.client
      .from("postman_workspaces")
      .insert({ id: workspace.id, name: workspace.name });
    this.throwIfError(error);
  }

  async updateWorkspace(workspace: Workspace): Promise<void> {
    const { error } = await this.client
      .from("postman_workspaces")
      .update({ name: workspace.name })
      .eq("id", workspace.id);
    this.throwIfError(error);
  }

  async deleteWorkspace(id: string): Promise<void> {
    const { error } = await this.client
      .from("postman_workspaces")
      .delete()
      .eq("id", id);
    this.throwIfError(error);
  }

  async listPendingInvites(): Promise<WorkspaceInvite[]> {
    const { data, error } = await this.client
      .from("postman_workspace_invites")
      .select("*")
      .eq("status", "pending")
      .order("created_at");
    this.throwIfError(error);
    return (data as unknown as WorkspaceInviteRow[]).map(toInvite);
  }

  async listWorkspaceInvites(workspaceId: string): Promise<WorkspaceInvite[]> {
    const { data, error } = await this.client
      .from("postman_workspace_invites")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("status", "pending")
      .order("created_at");
    this.throwIfError(error);
    return (data as WorkspaceInviteRow[]).map(toInvite);
  }

  async inviteToWorkspace(workspaceId: string, email: string): Promise<void> {
    const { error } = await this.client
      .from("postman_workspace_invites")
      .upsert(
        {
          workspace_id: workspaceId,
          email: email.trim().toLowerCase(),
          status: "pending",
          responded_at: null,
        },
        { onConflict: "workspace_id,email" },
      );
    this.throwIfError(error);
  }

  async respondToInvite(inviteId: string, accept: boolean): Promise<void> {
    const { error } = await this.client.rpc("postman_respond_to_invite", {
      invite_id: inviteId,
      accept_invite: accept,
    });
    this.throwIfError(error);
  }

  async revokeInvite(inviteId: string): Promise<void> {
    const { error } = await this.client
      .from("postman_workspace_invites")
      .delete()
      .eq("id", inviteId);
    this.throwIfError(error);
  }

  async listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    const { data, error } = await this.client
      .from("postman_workspace_members")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("role")
      .order("email");
    this.throwIfError(error);
    return (data as WorkspaceMemberRow[]).map(toMember);
  }

  async removeWorkspaceMember(
    workspaceId: string,
    userId: string,
  ): Promise<void> {
    const { error } = await this.client
      .from("postman_workspace_members")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId);
    this.throwIfError(error);
  }

  async listEnvironments(collectionId: string): Promise<Environment[]> {
    const { data, error } = await this.client
      .from("postman_environments")
      .select("*")
      .eq("collection_id", collectionId)
      .order("name");
    this.throwIfError(error);
    return (data as EnvironmentRow[]).map(toEnvironment);
  }

  async createEnvironment(environment: Environment): Promise<void> {
    const { error } = await this.client.from("postman_environments").insert({
      id: environment.id,
      workspace_id: environment.workspaceId,
      collection_id: environment.collectionId,
      name: environment.name,
      variables: environment.variables,
    });
    this.throwIfError(error);
  }

  async updateEnvironment(environment: Environment): Promise<void> {
    const { error } = await this.client
      .from("postman_environments")
      .update({ name: environment.name, variables: environment.variables })
      .eq("id", environment.id);
    this.throwIfError(error);
  }

  async deleteEnvironment(id: string): Promise<void> {
    const { error } = await this.client
      .from("postman_environments")
      .delete()
      .eq("id", id);
    this.throwIfError(error);
  }

  async listCollections(workspaceId: string): Promise<Collection[]> {
    const { data, error } = await this.client
      .from("postman_collections")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("name");
    this.throwIfError(error);
    return (data as CollectionRow[]).map(toCollection);
  }

  async createCollection(collection: Collection): Promise<void> {
    const { error } = await this.client.from("postman_collections").insert({
      id: collection.id,
      workspace_id: collection.workspaceId,
      name: collection.name,
      description: collection.description,
    });
    this.throwIfError(error);
  }

  async updateCollection(collection: Collection): Promise<void> {
    const { error } = await this.client
      .from("postman_collections")
      .update({ name: collection.name, description: collection.description })
      .eq("id", collection.id);
    this.throwIfError(error);
  }

  async deleteCollection(id: string): Promise<void> {
    const { error } = await this.client
      .from("postman_collections")
      .delete()
      .eq("id", id);
    this.throwIfError(error);
  }

  async listFolders(collectionId: string): Promise<Folder[]> {
    const { data, error } = await this.client
      .from("postman_folders")
      .select("*")
      .eq("collection_id", collectionId)
      .order("name");
    this.throwIfError(error);
    return (data as FolderRow[]).map(toFolder);
  }

  async createFolder(folder: Folder): Promise<void> {
    const { error } = await this.client.from("postman_folders").insert({
      id: folder.id,
      collection_id: folder.collectionId,
      parent_folder_id: folder.parentFolderId,
      name: folder.name,
      description: folder.description,
      is_starred: folder.isStarred,
    });
    this.throwIfError(error);
  }

  async updateFolder(folder: Folder): Promise<void> {
    const { error } = await this.client
      .from("postman_folders")
      .update({
        name: folder.name,
        description: folder.description,
        parent_folder_id: folder.parentFolderId,
        is_starred: folder.isStarred,
      })
      .eq("id", folder.id);
    this.throwIfError(error);
  }

  async deleteFolder(id: string): Promise<void> {
    const { error } = await this.client
      .from("postman_folders")
      .delete()
      .eq("id", id);
    this.throwIfError(error);
  }

  async listRequests(collectionId: string): Promise<ApiRequest[]> {
    const { data, error } = await this.client
      .from("postman_requests")
      .select("*")
      .eq("collection_id", collectionId)
      .order("name");
    this.throwIfError(error);
    return (data as RequestRow[]).map(toRequest);
  }

  async getRequest(id: string): Promise<ApiRequest | null> {
    const { data, error } = await this.client
      .from("postman_requests")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    this.throwIfError(error);
    return data ? toRequest(data as RequestRow) : null;
  }

  async createRequest(request: ApiRequest): Promise<void> {
    const { error } = await this.client
      .from("postman_requests")
      .insert(toRequestRow(request));
    this.throwIfError(error);
  }

  async updateRequest(request: ApiRequest): Promise<void> {
    const { id, ...row } = toRequestRow(request);
    const { error } = await this.client
      .from("postman_requests")
      .update(row)
      .eq("id", id);
    this.throwIfError(error);
  }

  async deleteRequest(id: string): Promise<void> {
    const { error } = await this.client
      .from("postman_requests")
      .delete()
      .eq("id", id);
    this.throwIfError(error);
  }
}
